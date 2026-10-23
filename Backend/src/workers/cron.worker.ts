import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { PrismaClient, Estados } from '@prisma/client';
import { getRedisConnection, getCronQueue, CronJobData } from '../lib/queue/queue.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import {
  resolverUsuarioCreadorCotizacion,
  notificarUsuario,
} from '../services/notificacion.service.js';

const prisma = new PrismaClient();

const DIAS_VENCIMIENTO = 30;
const CRON_PATTERN = '0 2 * * *'; // Diario a las 02:00

/**
 * Barrido de cotizaciones: toda cotización en estado ENVIADA cuya fecha de
 * envío supere los 30 días pasa automáticamente a EN_SEGUIMIENTO.
 * La "fecha de envío" se resuelve desde el historial de estados (transición a
 * ENVIADA) y, como respaldo, desde UPDATED_AT/CREATED_AT de la cotización.
 */
async function procesarCotizacionesVencidas(): Promise<number> {
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - DIAS_VENCIMIENTO * 24 * 60 * 60 * 1000);

  const cotizaciones = await prisma.cotizaciones.findMany({
    where: { ESTADO: Estados.ENVIADA },
    select: {
      ID_COTIZACION: true,
      CODIGO_COTIZACION: true,
      CREATED_AT: true,
      UPDATED_AT: true,
    },
  });

  let actualizadas = 0;

  for (const cotizacion of cotizaciones) {
    const historialEnvio = await prisma.historial_estado_cotizacion.findFirst({
      where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, ESTADO_NUEVO: Estados.ENVIADA },
      orderBy: { CREATED_AT: 'desc' },
    });

    const fechaEnvio = historialEnvio?.CREATED_AT ?? cotizacion.UPDATED_AT ?? cotizacion.CREATED_AT;
    if (!fechaEnvio || fechaEnvio.getTime() > limite.getTime()) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const actual = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
        });
        if (!actual || actual.ESTADO !== Estados.ENVIADA) return;

        await tx.cotizaciones.update({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          data: { ESTADO: Estados.EN_SEGUIMIENTO },
        });

        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
            ESTADO_ANTERIOR: Estados.ENVIADA,
            ESTADO_NUEVO: Estados.EN_SEGUIMIENTO,
            ID_USUARIO_FK: null,
            MOTIVO: 'Transición automática por vencimiento (más de 30 días sin aprobación).',
          },
        });

        await registrarBitacora(tx, {
          action: 'CAMBIO_ESTADO_AUTOMATICO',
          tableName: 'cotizaciones',
          recordId: cotizacion.ID_COTIZACION,
          userId: null,
          ip: '0.0.0.0',
          details: {
            codigo: cotizacion.CODIGO_COTIZACION,
            estadoAnterior: Estados.ENVIADA,
            estadoNuevo: Estados.EN_SEGUIMIENTO,
            sistema: true,
            origen: 'cron_seguimiento_30_dias',
          },
        });

        const creador = await resolverUsuarioCreadorCotizacion(tx, cotizacion.ID_COTIZACION);
        await notificarUsuario(tx, {
          idUsuario: creador,
          mensaje: `La cotización ${cotizacion.CODIGO_COTIZACION} pasó a seguimiento comercial por superar 30 días sin aprobación.`,
          modulo: 'COTIZACIONES',
          nivelPrioridad: 'NORMAL',
        });
      });

      actualizadas += 1;
      console.log(`[cron] Cotización ${cotizacion.CODIGO_COTIZACION} movida a EN_SEGUIMIENTO.`);
    } catch (error) {
      console.error(`[cron] Error procesando cotización ${cotizacion.CODIGO_COTIZACION}:`, error);
    }
  }

  return actualizadas;
}

const worker = new Worker<CronJobData>(
  'cron-queue',
  async (job: Job<CronJobData>) => {
    console.log(`[cron] Ejecutando tarea programada: ${job.data.tarea}`);
    if (job.data.tarea === 'seguimiento-30-dias') {
      const total = await procesarCotizacionesVencidas();
      return { tarea: job.data.tarea, cotizacionesActualizadas: total };
    }
    return { tarea: job.data.tarea };
  },
  {
    connection: getRedisConnection(),
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`✅ [cron] Job ${job.id} completado:`, job.returnvalue);
});

worker.on('failed', (job, err) => {
  console.error(`❌ [cron] Job ${job?.id} falló: ${err.message}`);
});

worker.on('error', (err) => {
  console.error('🚨 [cron] Error crítico en el Worker:', err);
});

// Registro del job repetible (diario 02:00).
await getCronQueue().upsertJobScheduler(
  'seguimiento-30-dias',
  { pattern: CRON_PATTERN },
  {
    name: 'seguimiento-30-dias',
    data: { tarea: 'seguimiento-30-dias' },
  }
);

console.log(`🚀 [cron] Worker de tareas programadas escuchando (patrón: ${CRON_PATTERN})...`);
