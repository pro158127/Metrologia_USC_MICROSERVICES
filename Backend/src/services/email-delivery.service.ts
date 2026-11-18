import { Job, QueueEvents } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  EmailJobData,
  getEmailQueue,
  getRedisConnection,
  EMAIL_QUEUE_NAME,
} from '../lib/queue/queue.js';
import { notificarUsuario } from './notificacion.service.js';

/** Encola el correo y espera su resultado SMTP final antes de continuar. */
export async function enviarCorreoYEsperar(data: EmailJobData): Promise<string> {
  const queueEvents = new QueueEvents(EMAIL_QUEUE_NAME, { connection: getRedisConnection() });
  let job: Job<EmailJobData> | undefined;
  try {
    await queueEvents.waitUntilReady();
    job = await getEmailQueue().add(data.template_type, data);
    await job.waitUntilFinished(queueEvents, 150_000);
    return String(job.id);
  } catch (error) {
    // Si la transacción de negocio falla o vence, evita dejar un envío pendiente.
    await job?.remove().catch(() => undefined);
    throw error;
  } finally {
    await queueEvents.close();
  }
}

/** Registra el envío en PostgreSQL antes de mandarlo a BullMQ. */
export async function encolarCorreoConRegistro(
  prisma: PrismaClient,
  data: EmailJobData,
): Promise<number> {
  let idCotizacion = data.id_cotizacion ?? null;
  if (!idCotizacion && data.tabla_origen === 'ordenes_trabajo' && data.id_registro) {
    const ot = await prisma.ordenes_trabajo.findUnique({
      where: { ID_ORDEN_TRABAJO: data.id_registro },
      select: { ID_COTIZACION_FK: true },
    });
    idCotizacion = ot?.ID_COTIZACION_FK ?? null;
  }

  const envio = await prisma.correo_envios.create({
    data: {
      ID_COTIZACION_FK: idCotizacion,
      ID_REGISTRO: data.id_registro ?? 0,
      MODULO: data.modulo_origen ?? 'correo',
      TIPO: data.template_type,
      DESTINATARIO: (Array.isArray(data.to) ? data.to.join(', ') : String(data.to ?? '')).trim() || 'SIN_CORREO_CONFIGURADO',
      ASUNTO: data.subject,
      TEMPLATE_TYPE: data.template_type,
      CONTEXTO: data.context_data,
      MINIO_LINKS: data.minio_links ?? [],
      SOLICITADO_POR: data.notificar_usuario_id ?? null,
    },
  });

  const destinatario = (Array.isArray(data.to) ? data.to.join(', ') : String(data.to ?? '')).trim();
  if (!destinatario) {
    const error = new Error('El cliente no tiene una dirección de correo configurada. Revise o actualice el correo electrónico.');
    await prisma.correo_envios.update({
      where: { ID_ENVIO_CORREO: envio.ID_ENVIO_CORREO },
      data: { ESTADO: 'FALLIDO', ULTIMO_ERROR: error.message },
    });
    await registrarFalloCorreo(
      prisma,
      { ...data, id_cotizacion: idCotizacion ?? undefined, id_envio_correo: envio.ID_ENVIO_CORREO },
      `no-address-${envio.ID_ENVIO_CORREO}`,
      error,
      0,
    );
    return envio.ID_ENVIO_CORREO;
  }

  try {
    const job = await getEmailQueue().add(data.template_type, {
      ...data,
      id_cotizacion: idCotizacion ?? undefined,
      id_envio_correo: envio.ID_ENVIO_CORREO,
    });
    await prisma.correo_envios.update({
      where: { ID_ENVIO_CORREO: envio.ID_ENVIO_CORREO },
      data: { ID_JOB: String(job.id) },
    });
    return envio.ID_ENVIO_CORREO;
  } catch (error) {
    const motivo = error instanceof Error ? error.message : String(error);
    await prisma.correo_envios.update({
      where: { ID_ENVIO_CORREO: envio.ID_ENVIO_CORREO },
      data: { ESTADO: 'FALLIDO', ULTIMO_ERROR: motivo },
    });
    await registrarFalloCorreo(
      prisma,
      { ...data, id_cotizacion: idCotizacion ?? undefined, id_envio_correo: envio.ID_ENVIO_CORREO },
      `enqueue-${envio.ID_ENVIO_CORREO}`,
      error instanceof Error ? error : new Error(motivo),
      0,
    );
    throw error;
  }
}
/** Persiste el fallo definitivo del envío en bitácora y notificaciones. */
export async function registrarFalloCorreo(
  prisma: PrismaClient,
  data: EmailJobData,
  jobId: string,
  error: Error,
  attempts: number,
): Promise<void> {
  const fecha = new Date();
  const destino = Array.isArray(data.to) ? data.to.join(', ') : data.to;
  const motivo = error.message || 'Error SMTP sin detalle';
  const modulo = data.modulo_origen || 'correo';
  const tabla = data.tabla_origen || 'email_queue_jobs';
  const registro = data.id_registro ?? jobId;

  if (data.id_envio_correo) {
    await prisma.correo_envios.update({
      where: { ID_ENVIO_CORREO: data.id_envio_correo },
      data: {
        ESTADO: 'FALLIDO',
        ULTIMO_ERROR: motivo,
        ID_JOB: jobId,
      },
    }).catch((updateError) => console.error('[email] No se pudo actualizar el seguimiento del envío:', updateError));
  }
  const mensaje = `No se pudo enviar el correo a ${destino} el ${fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}. Motivo: ${motivo}. Revise la dirección, la bandeja de spam o actualice el correo electrónico y vuelva a intentar.`;

  try {
    await prisma.audit_logs.create({
      data: {
        action: 'EMAIL_FALLIDO',
        tableName: tabla,
        recordId: String(registro),
        USER_ID: data.notificar_usuario_id ?? null,
        ip: '0.0.0.0',
        details: {
          jobId,
          template: data.template_type,
          destino,
          fecha: fecha.toISOString(),
          motivo,
          intentos: attempts,
          modulo,
        },
      },
    });
  } catch (auditError) {
    console.error('[email] No se pudo registrar el fallo en audit_logs:', auditError);
  }

  await notificarUsuario(prisma, {
    idUsuario: data.notificar_usuario_id ?? null,
    mensaje,
    modulo,
    nivelPrioridad: 'ALTA',
  });
}
