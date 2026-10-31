import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { Worker, Job } from 'bullmq';
import { PrismaClient, Estados } from '@prisma/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getRedisConnection, getCronQueue, CronJobData, patronCronRespaldo } from '../lib/queue/queue.js';
import { s3Client } from '../lib/s3Client.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import {
  resolverUsuarioCreadorCotizacion,
  notificarUsuario,
} from '../services/notificacion.service.js';

const prisma = new PrismaClient();
const execFileAsync = promisify(execFile);
const gzipAsync = promisify(gzip);

const BUCKET_BACKUP = process.env.MINIO_BUCKET_BACKUP || 'backups-postgres';
const BUCKET_MINIO = process.env.MINIO_BUCKET_NAME || 'documentos-metrologia';
const BUCKET_MINIO_BACKUP = process.env.MINIO_BUCKET_BACKUP_MINIO || 'backups-minio';
const MC_ALIAS = 'local';

// Marcador para distinguir rechazos automáticos (vencimiento) de los manuales.
const AUTO_RECHAZO_MARCADOR = 'Vencimiento automático';

/**
 * Lee un parámetro numérico desde parametros_sistema (CLAVE -> CODIGO_SCRIPT).
 */
async function leerParametroNumero(clave: string, porDefecto: number): Promise<number> {
  try {
    const p = await prisma.parametros_sistema.findUnique({ where: { CLAVE: clave } });
    const valor = Number(p?.CODIGO_SCRIPT);
    return Number.isFinite(valor) && valor >= 0 ? valor : porDefecto;
  } catch {
    return porDefecto;
  }
}

/**
 * Barrido de cotizaciones:
 *  - ENVIADA -> RECHAZADA (motivo automático) si pasó DIAS_RECHAZAR_COTIZACION.
 *  - RECHAZADA (auto) -> EN_SEGUIMIENTO si pasó DIAS_SEGUIMIENTO_COTIZACION.
 * Los días se leen de parametros_sistema en cada ejecución.
 */
async function procesarCotizacionesVencidas(): Promise<{ rechazadas: number; seguimiento: number }> {
  const diasRechazo = await leerParametroNumero('DIAS_RECHAZAR_COTIZACION', 15);
  const diasSeguimiento = await leerParametroNumero('DIAS_SEGUIMIENTO_COTIZACION', 30);
  const ahora = new Date();
  const limiteRechazo = new Date(ahora.getTime() - diasRechazo * 24 * 60 * 60 * 1000);
  const limiteSeguimiento = new Date(ahora.getTime() - diasSeguimiento * 24 * 60 * 60 * 1000);

  let rechazadas = 0;
  let seguimiento = 0;

  // 1) ENVIADA -> RECHAZADA
  const enviadas = await prisma.cotizaciones.findMany({
    where: { ESTADO: Estados.ENVIADA },
    select: { ID_COTIZACION: true, CODIGO_COTIZACION: true, CREATED_AT: true, UPDATED_AT: true },
  });

  for (const cotizacion of enviadas) {
    const historialEnvio = await prisma.historial_estado_cotizacion.findFirst({
      where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, ESTADO_NUEVO: Estados.ENVIADA },
      orderBy: { CREATED_AT: 'desc' },
    });
    const fechaEnvio = historialEnvio?.CREATED_AT ?? cotizacion.UPDATED_AT ?? cotizacion.CREATED_AT;
    if (!fechaEnvio || fechaEnvio.getTime() > limiteRechazo.getTime()) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const actual = await tx.cotizaciones.findUnique({ where: { ID_COTIZACION: cotizacion.ID_COTIZACION } });
        if (!actual || actual.ESTADO !== Estados.ENVIADA) return;

        await tx.cotizaciones.update({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          data: {
            ESTADO: Estados.RECHAZADA,
            MOTIVO_RECHAZO: `${AUTO_RECHAZO_MARCADOR}: sin aprobación en ${diasRechazo} días.`,
          },
        });

        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
            ESTADO_ANTERIOR: Estados.ENVIADA,
            ESTADO_NUEVO: Estados.RECHAZADA,
            ID_USUARIO_FK: null,
            MOTIVO: `${AUTO_RECHAZO_MARCADOR}: sin aprobación en ${diasRechazo} días.`,
          },
        });

        await registrarBitacora(tx, {
          action: 'RECHAZO_AUTOMATICO',
          tableName: 'cotizaciones',
          recordId: cotizacion.ID_COTIZACION,
          userId: null,
          ip: '0.0.0.0',
          details: { codigo: cotizacion.CODIGO_COTIZACION, sistema: true, origen: 'cron_vencimiento_cotizacion' },
        });

        const creador = await resolverUsuarioCreadorCotizacion(tx, cotizacion.ID_COTIZACION);
        await notificarUsuario(tx, {
          idUsuario: creador,
          mensaje: `La cotización ${cotizacion.CODIGO_COTIZACION} fue rechazada automáticamente por superar ${diasRechazo} días sin aprobación.`,
          modulo: 'COTIZACIONES',
          nivelPrioridad: 'NORMAL',
        });
      });
      rechazadas += 1;
    } catch (error) {
      console.error(`[cron] Error rechazando cotización ${cotizacion.CODIGO_COTIZACION}:`, error);
    }
  }

  // 2) RECHAZADA (auto) -> EN_SEGUIMIENTO
  const rechazadasAuto = await prisma.cotizaciones.findMany({
    where: { ESTADO: Estados.RECHAZADA, MOTIVO_RECHAZO: { startsWith: AUTO_RECHAZO_MARCADOR } },
    select: { ID_COTIZACION: true, CODIGO_COTIZACION: true },
  });

  for (const cotizacion of rechazadasAuto) {
    const historialRechazo = await prisma.historial_estado_cotizacion.findFirst({
      where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, ESTADO_NUEVO: Estados.RECHAZADA },
      orderBy: { CREATED_AT: 'desc' },
    });
    const fechaRechazo = historialRechazo?.CREATED_AT;
    if (!fechaRechazo || fechaRechazo.getTime() > limiteSeguimiento.getTime()) continue;

    try {
      await prisma.$transaction(async (tx) => {
        const actual = await tx.cotizaciones.findUnique({ where: { ID_COTIZACION: cotizacion.ID_COTIZACION } });
        if (!actual || actual.ESTADO !== Estados.RECHAZADA) return;

        await tx.cotizaciones.update({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          data: { ESTADO: Estados.EN_SEGUIMIENTO },
        });

        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
            ESTADO_ANTERIOR: Estados.RECHAZADA,
            ESTADO_NUEVO: Estados.EN_SEGUIMIENTO,
            ID_USUARIO_FK: null,
            MOTIVO: `Transición automática a seguimiento tras ${diasSeguimiento} días del rechazo.`,
          },
        });

        await registrarBitacora(tx, {
          action: 'SEGUIMIENTO_AUTOMATICO',
          tableName: 'cotizaciones',
          recordId: cotizacion.ID_COTIZACION,
          userId: null,
          ip: '0.0.0.0',
          details: { codigo: cotizacion.CODIGO_COTIZACION, sistema: true, origen: 'cron_vencimiento_cotizacion' },
        });
      });
      seguimiento += 1;
    } catch (error) {
      console.error(`[cron] Error moviendo a seguimiento ${cotizacion.CODIGO_COTIZACION}:`, error);
    }
  }

  return { rechazadas, seguimiento };
}

/**
 * Marca como VENCIDA el pago de toda OT cuya FECHA_LIMITE_FACTURACION ya pasó
 * y aún no está PAGADA ni VENCIDA.
 */
async function procesarPagosVencidos(): Promise<number> {
  const ahora = new Date();
  const ots = await prisma.ordenes_trabajo.findMany({
    where: { FECHA_LIMITE_FACTURACION: { lt: ahora } },
    select: {
      ID_ORDEN_TRABAJO: true,
      CODIGO_OT: true,
      estado_pago: true,
      FECHA_LIMITE_FACTURACION: true,
    },
  });

  let actualizadas = 0;
  for (const ot of ots) {
    if (ot.estado_pago === 'PAGADO' || ot.estado_pago === 'VENCIDA') continue;

    try {
      await prisma.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
        data: { estado_pago: 'VENCIDA' },
      });
      await registrarBitacora(prisma, {
        action: 'MARCAR_PAGO_VENCIDO',
        tableName: 'ordenes_trabajo',
        recordId: ot.ID_ORDEN_TRABAJO,
        userId: null,
        ip: '0.0.0.0',
        details: { codigoOT: ot.CODIGO_OT, fechaLimite: ot.FECHA_LIMITE_FACTURACION, sistema: true },
      });
      actualizadas += 1;
      console.log(`[cron] Pago vencido: OT ${ot.CODIGO_OT}`);
    } catch (error) {
      console.error(`[cron] Error marcando pago vencido OT ${ot.CODIGO_OT}:`, error);
    }
  }
  return actualizadas;
}

/**
 * Ejecuta un respaldo de la base de datos con pg_dump y lo sube a MinIO.
 * Requiere pg_dump instalado en el contenedor (postgresql-client).
 */
async function ejecutarBackup(): Promise<{ key?: string; error?: string }> {
  const dbUrl = (process.env.DATABASE_URL_LOCAL || process.env.DATABASE_URL_AWS || '').split('?')[0];
  if (!dbUrl) return { error: 'Sin URL de base de datos configurada.' };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const key = `backups/backup_${timestamp}.sql.gz`;

  try {
    const { stdout } = await execFileAsync(
      'pg_dump',
      ['--no-owner', '--no-privileges', '--dbname', dbUrl],
      { maxBuffer: 512 * 1024 * 1024 }
    );
    const comprimido = await gzipAsync(Buffer.from(stdout));
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_BACKUP,
        Key: key,
        Body: comprimido,
        ContentType: 'application/gzip',
      })
    );
    return { key };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Configura el alias de `mc` contra MinIO. Idempotente. */
async function configurarMc(): Promise<void> {
  const endpoint = process.env.MINIO_ENDPOINT || 'http://minio-storage:9000';
  const access = process.env.MINIO_ACCESS_KEY || 'admin_metrologia';
  const secret = process.env.MINIO_SECRET_KEY || 'PasswordSegura123';
  await execFileAsync('mc', ['alias', 'set', MC_ALIAS, endpoint, access, secret]);
}

/**
 * Espeja el bucket de documentos hacia el bucket de respaldo de MinIO.
 * Requiere el binario `mc` instalado en el contenedor.
 */
async function ejecutarBackupMinio(): Promise<{ error?: string }> {
  try {
    await configurarMc();
    await execFileAsync('mc', [
      'mirror',
      '--overwrite',
      `${MC_ALIAS}/${BUCKET_MINIO}`,
      `${MC_ALIAS}/${BUCKET_MINIO_BACKUP}/`,
    ]);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Borra respaldos (DB y MinIO) más antiguos que N días. */
async function aplicarRetencion(dias: number): Promise<{ error?: string }> {
  if (!dias || dias <= 0) return {};
  try {
    await configurarMc();
    await execFileAsync('mc', [
      'rm', '--recursive', '--force', '--older-than', `${dias}d`, `${MC_ALIAS}/${BUCKET_BACKUP}`,
    ]);
    await execFileAsync('mc', [
      'rm', '--recursive', '--force', '--older-than', `${dias}d`, `${MC_ALIAS}/${BUCKET_MINIO_BACKUP}`,
    ]);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const worker = new Worker<CronJobData>(
  'cron-queue',
  async (job: Job<CronJobData>) => {
    console.log(`[cron] Ejecutando tarea programada: ${job.data.tarea}`);
    switch (job.data.tarea) {
      case 'vencimiento-cotizaciones': {
        const r = await procesarCotizacionesVencidas();
        return { tarea: job.data.tarea, ...r };
      }
      case 'vencer-pagos': {
        const total = await procesarPagosVencidos();
        return { tarea: job.data.tarea, pagosVencidos: total };
      }
      case 'backup': {
        const [db, minio] = await Promise.all([ejecutarBackup(), ejecutarBackupMinio()]);
        const diasRetencion = await leerParametroNumero('RETENCION_BACKUPS', 30);
        const retencion = await aplicarRetencion(diasRetencion);
        return { tarea: job.data.tarea, db, minio, retencion };
      }
      default:
        return { tarea: job.data.tarea };
    }
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

// Schedulers repetibles (BullMQ). Los patrones de vencimiento son horarios; el
// de respaldo se deriva de FRECUENCIA_RESPALDO.
const HORA_PATTERN = '0 * * * *';

await getCronQueue().upsertJobScheduler(
  'vencimiento-cotizaciones',
  { pattern: HORA_PATTERN },
  { name: 'vencimiento-cotizaciones', data: { tarea: 'vencimiento-cotizaciones' } }
);

await getCronQueue().upsertJobScheduler(
  'vencer-pagos',
  { pattern: HORA_PATTERN },
  { name: 'vencer-pagos', data: { tarea: 'vencer-pagos' } }
);

const frecuenciaRespaldo = await prisma.parametros_sistema.findUnique({
  where: { CLAVE: 'FRECUENCIA_RESPALDO' },
});
const patronRespaldo = patronCronRespaldo(
  frecuenciaRespaldo?.FRECUENCIA ?? 'UNA_VEZ',
  frecuenciaRespaldo?.EXPRESION_CRON
);
if (patronRespaldo) {
  await getCronQueue().upsertJobScheduler(
    'backup',
    { pattern: patronRespaldo },
    { name: 'backup', data: { tarea: 'backup' } }
  );
}

console.log(`🚀 [cron] Worker de tareas programadas escuchando (vencimientos: ${HORA_PATTERN}, respaldo: ${patronRespaldo ?? 'desactivado'})...`);
