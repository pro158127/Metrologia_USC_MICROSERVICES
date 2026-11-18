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
