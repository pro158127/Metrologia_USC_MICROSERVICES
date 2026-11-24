import { Job, QueueEvents } from 'bullmq';
import { Prisma, PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EmailJobData, getEmailQueue, getRedisConnection, EMAIL_QUEUE_NAME } from '../lib/queue/queue.js';
import { notificarUsuario } from './notificacion.service.js';
import { AppError } from '../lib/errors.js';
import { controlesDeCorreo, limpiarContenidoCorreo } from './contenido-correo.service.js';

export const correoValido = z.email();
export const nuevoIdColaCorreo = () => `correo-${randomUUID()}`;
const estadosActivos = ['PENDIENTE', 'EN_PROCESO'];

export async function enviarCorreoYEsperar(data: EmailJobData, prisma: PrismaClient, confirmarNoRecibido = false): Promise<string> {
  const adjuntos = data.context_data.huellaComprobante ?? data.minio_links ?? [];
  const huella = createHash('sha256').update(JSON.stringify([data.to, adjuntos, data.context_data])).digest('hex');
  const contexto = { ...data.context_data, origen: data.tabla_origen, huella };
  const anterior = await prisma.correo_envios.findFirst({
    where: {
      MODULO: data.modulo_origen, ID_REGISTRO: data.id_registro, TIPO: data.template_type,
      CONTEXTO: { path: ['origen'], equals: data.tabla_origen },
    },
    orderBy: { ID_ENVIO_CORREO: 'desc' },
  });
  const mismaEntrega = (anterior?.CONTEXTO as { huella?: string } | null)?.huella === huella;
  if (anterior?.ESTADO === 'ENVIADO') {
    if (mismaEntrega && anterior.ID_JOB) return anterior.ID_JOB;
    throw new AppError(409, 'Hay un correo aceptado con otros datos. Revise el destinatario y los adjuntos antes de confirmar el despacho.');
  }
  if (anterior?.ESTADO === 'PENDIENTE' || anterior?.ESTADO === 'EN_PROCESO') {
    throw new AppError(409, 'Hay un intento sin confirmar. Revise el estado del correo antes de volver a enviar.');
  }
  if (anterior?.ESTADO === 'RESULTADO_INCIERTO') {
    if (!confirmarNoRecibido) throw new AppError(409, 'Confirme con el destinatario si recibió el correo antes de reintentar.');
    const previo = anterior.ID_JOB ? await getEmailQueue().getJob(anterior.ID_JOB) : undefined;
    const estado = await previo?.getState();
    if (estado && !['unknown', 'failed'].includes(estado)) {
      throw new AppError(409, 'La cola todavía conserva un resultado o está procesando el intento anterior. Actualice la vista.');
    }
    await prisma.audit_logs.create({ data: {
      action: 'CONFIRMAR_CORREO_NO_RECIBIDO', tableName: data.tabla_origen ?? 'correo_envios',
      recordId: String(data.id_registro), USER_ID: data.notificar_usuario_id ?? null,
      ip: '0.0.0.0', details: { idEnvio: anterior.ID_ENVIO_CORREO, jobId: anterior.ID_JOB },
    } });
  }
  const jobId = `directo-${randomUUID()}`;
  const envio = anterior && ['FALLIDO', 'RESULTADO_INCIERTO'].includes(anterior.ESTADO) ? await prisma.correo_envios.update({
    where: { ID_ENVIO_CORREO: anterior.ID_ENVIO_CORREO, ESTADO: anterior.ESTADO, ID_JOB: anterior.ID_JOB },
    data: { ESTADO: 'PENDIENTE', ID_JOB: jobId, DESTINATARIO: String(data.to), CONTEXTO: contexto,
      MINIO_LINKS: data.minio_links ?? [], ULTIMO_ERROR: null, SOLICITADO_POR: data.notificar_usuario_id },
  }) : await registrarCorreoPendiente(prisma, { ...data, context_data: contexto }, jobId);
  const payload = { ...data, id_envio_correo: envio.ID_ENVIO_CORREO };
  const queueEvents = new QueueEvents(EMAIL_QUEUE_NAME, { connection: getRedisConnection() });
  queueEvents.on('error', (error) => console.warn('[email] Error escuchando el envío:', error.message));
  let job: Job<EmailJobData> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let resultado: { status?: string; messageId?: string } | undefined;
  try {
    await Promise.race([
      queueEvents.waitUntilReady(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('La cola de correo no está disponible. Vuelva a intentar.')), 5000);
      }),
    ]);
    job = await getEmailQueue().add(data.template_type, payload, { jobId });
    resultado = await job.waitUntilFinished(queueEvents, 150_000);
    if (resultado?.status !== 'delivered') throw new Error('No se confirmó la aceptación del correo.');
  } catch (error) {
    const causa = error instanceof Error ? error : new Error(String(error));
    if (!job) job = await getEmailQueue().getJob(jobId).catch(() => undefined);
    // Un timeout puede ocurrir una vez aceptado el correo. Se deja revisar el
    // resultado antes de volver a enviar, en vez de declarar un rechazo.
    const estado = job ? await job.getState().catch(() => 'unknown') : 'unknown';
    if (estado === 'completed' && job?.returnvalue?.status === 'delivered') {
      await confirmarCorreo(prisma, envio.ID_ENVIO_CORREO, jobId, job.finishedOn, contexto, job.returnvalue.messageId);
      return jobId;
    }
    const retirado = job && ['waiting', 'delayed', 'prioritized'].includes(estado)
      ? await job.remove().then(() => true, () => false) : false;
    const observado = !job ? await prisma.correo_envios.findUnique({
      where: { ID_ENVIO_CORREO: envio.ID_ENVIO_CORREO }, select: { ESTADO: true },
    }) : null;
    if (observado?.ESTADO === 'ENVIADO') return jobId;
    const incierto = Boolean(job && !['failed', 'completed'].includes(estado) && !retirado) || observado?.ESTADO === 'EN_PROCESO';
    const motivo = incierto
      ? new Error('No se confirmó el resultado del correo. Revise la entrega antes de volver a intentar.')
      : causa;
    await registrarFalloCorreo(prisma, payload, jobId, motivo, job?.attemptsMade ?? 0, true, incierto);
    throw new AppError(502, motivo.message, incierto ? 'correo_resultado_incierto' : 'correo_fallido');
  } finally {
    clearTimeout(timer);
    await queueEvents.close();
  }
  await confirmarCorreo(prisma, envio.ID_ENVIO_CORREO, jobId, job?.finishedOn, contexto, resultado?.messageId);
  return jobId;
}

/** Persiste el envío dentro de la misma transacción que publica el documento. */
export function registrarCorreoPendiente(tx: Prisma.TransactionClient, data: EmailJobData, jobId = nuevoIdColaCorreo()) {
  const destinatario = (Array.isArray(data.to) ? data.to.join(', ') : data.to ?? '').trim();
  return tx.correo_envios.create({
    data: {
      ID_COTIZACION_FK: data.id_cotizacion ?? null,
      ID_REGISTRO: data.id_registro ?? 0,
      MODULO: data.modulo_origen ?? 'correo',
      TIPO: data.template_type,
      DESTINATARIO: destinatario || 'SIN_CORREO_CONFIGURADO',
      ASUNTO: data.subject,
      TEMPLATE_TYPE: data.template_type,
      CONTEXTO: data.context_data,
      MINIO_LINKS: data.minio_links ?? [],
      SOLICITADO_POR: data.notificar_usuario_id ?? null,
      ID_JOB: jobId,
    },
  });
}

function confirmarCorreo(
  prisma: PrismaClient, id: number, jobId: string, terminado: number | undefined,
  contexto: Record<string, unknown>, messageId?: string,
) {
  const datos = limpiarContenidoCorreo(contexto).CONTEXTO ?? contexto;
  return prisma.correo_envios.updateMany({
    where: { ID_ENVIO_CORREO: id, ID_JOB: jobId, ESTADO: { in: [...estadosActivos, 'RESULTADO_INCIERTO'] } },
    data: { ESTADO: 'ENVIADO', ENVIADO_AT: terminado ? new Date(terminado) : new Date(), ULTIMO_ERROR: null,
      CONTEXTO: { ...datos, ...(messageId && { messageId }) } as Prisma.InputJsonObject },
  });
}

export async function despacharCorreosPendientes(prisma: PrismaClient): Promise<void> {
  const vencimientoDirecto = new Date(Date.now() - 180_000);
  const [activos, inciertos] = await Promise.all([
    prisma.correo_envios.findMany({
      where: {
        ESTADO: { in: estadosActivos },
        OR: [
          { ID_JOB: { startsWith: 'correo-' } },
          { ID_JOB: { startsWith: 'directo-' }, UPDATED_AT: { lt: vencimientoDirecto } },
        ],
      },
      orderBy: [{ UPDATED_AT: 'asc' }, { ID_ENVIO_CORREO: 'asc' }],
      take: 100,
    }),
    prisma.correo_envios.findMany({
      where: { ESTADO: 'RESULTADO_INCIERTO', ID_JOB: { startsWith: 'directo-' },
        UPDATED_AT: { gt: new Date(Date.now() - 7 * 86_400_000) } },
      orderBy: { UPDATED_AT: 'desc' },
      take: 20,
    }),
  ]);
  const pendientes = [...activos, ...inciertos];
  if (!pendientes.length) return;
  const cola = getEmailQueue();
  for (const envio of pendientes) {
    const jobId = envio.ID_JOB!;
    const contexto = (envio.CONTEXTO ?? {}) as Record<string, unknown>;
    const data: EmailJobData = {
      to: envio.DESTINATARIO,
      subject: envio.ASUNTO,
      template_type: envio.TEMPLATE_TYPE as EmailJobData['template_type'],
      context_data: contexto,
      minio_links: Array.isArray(envio.MINIO_LINKS)
        ? envio.MINIO_LINKS.filter((link): link is string => typeof link === 'string') : [],
      id_registro: envio.ID_REGISTRO,
      id_cotizacion: envio.ID_COTIZACION_FK ?? undefined,
      id_envio_correo: envio.ID_ENVIO_CORREO,
      modulo_origen: envio.MODULO,
      tabla_origen: typeof contexto.origen === 'string' ? contexto.origen
        : contexto.contenidoCorreoProtegido ? 'usuarios' : envio.MODULO,
      notificar_usuario_id: envio.SOLICITADO_POR,
      tipo_entry: 'prod',
      ...controlesDeCorreo(contexto),
    };
    const directo = jobId.startsWith('directo-');
    if (!directo && !correoValido.safeParse(envio.DESTINATARIO).success) {
      await registrarFalloCorreo(prisma, data, jobId, new Error('Dirección ausente o inválida. Corrija el correo del destinatario.'), 0, true);
      continue;
    }
    if (!directo && ['cotizaciones', 'ordenes_trabajo'].includes(envio.MODULO) && data.minio_links?.length === 0) {
      await registrarFalloCorreo(prisma, data, jobId, new Error('Falta el archivo asociado al envío. Verifique el documento antes de reintentar.'), 0, true);
      continue;
    }

    const job = await cola.getJob(jobId);
    if (!job) {
      if (directo) {
        if (envio.ESTADO === 'RESULTADO_INCIERTO') continue;
        await registrarFalloCorreo(prisma, data, jobId, new Error('La solicitud se interrumpió antes de confirmar el correo.'), envio.INTENTOS, true, envio.ESTADO === 'EN_PROCESO');
        continue;
      }
      if (envio.ESTADO === 'EN_PROCESO') {
        await registrarFalloCorreo(prisma, data, jobId, new Error('Se perdió el resultado del envío. Verifique si el destinatario lo recibió antes de reintentar.'), envio.INTENTOS, true);
        continue;
      }
      await cola.add(envio.TEMPLATE_TYPE, data, { jobId });
      continue;
    }
    const estado = await job.getState();
    if (estado === 'failed') {
      await registrarFalloCorreo(prisma, data, jobId, new Error(job.failedReason), job.attemptsMade, true);
    } else if (estado === 'completed') {
      if (job.returnvalue?.status === 'delivered') {
        await confirmarCorreo(prisma, envio.ID_ENVIO_CORREO, jobId, job.finishedOn, contexto, job.returnvalue.messageId);
      } else {
        await registrarFalloCorreo(prisma, data, jobId, new Error('El trabajo fue omitido antes de confirmar la entrega.'), job.attemptsMade, true);
      }
    }
  }
}

/** Registra el fallo definitivo. Para trabajos persistidos, la transición se guarda una sola vez. */
export async function registrarFalloCorreo(
  prisma: PrismaClient, data: EmailJobData, jobId: string, error: Error, attempts: number, persistido = false,
  incierto = false,
): Promise<void> {
  const fecha = new Date();
  const destino = Array.isArray(data.to) ? data.to.join(', ') : data.to;
  const motivo = error.message || 'Error SMTP sin detalle';
  const modulo = data.modulo_origen || 'correo';
  const tabla = data.tabla_origen || 'email_queue_jobs';
  const registro = data.id_registro ?? jobId;

  async function guardarFalloAuditable(db: Prisma.TransactionClient) {
    await db.audit_logs.create({
      data: {
        action: 'EMAIL_FALLIDO', tableName: tabla, recordId: String(registro),
        USER_ID: data.notificar_usuario_id ?? null, ip: '0.0.0.0',
        details: { jobId, template: data.template_type, destino, fecha: fecha.toISOString(), motivo, intentos: attempts, modulo },
      },
    });
    await notificarUsuario(db, {
      idUsuario: data.notificar_usuario_id ?? null,
      mensaje: `No se pudo enviar el correo a ${destino} el ${fecha.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}. Motivo: ${motivo}. Revise la dirección y, si es incorrecta, corríjala antes de reintentar.`,
      modulo,
      nivelPrioridad: 'ALTA',
    });
  }

  if (data.id_envio_correo && persistido) {
    await prisma.$transaction(async (tx) => {
      const cambio = await tx.correo_envios.updateMany({
        where: { ID_ENVIO_CORREO: data.id_envio_correo, ID_JOB: jobId, ESTADO: { in: incierto ? estadosActivos : [...estadosActivos, 'RESULTADO_INCIERTO'] } },
        data: { ESTADO: incierto ? 'RESULTADO_INCIERTO' : 'FALLIDO', ULTIMO_ERROR: motivo,
          ...limpiarContenidoCorreo(data.context_data) },
      });
      if (cambio.count) await guardarFalloAuditable(tx);
    });
    return;
  }

  if (data.id_envio_correo) {
    await prisma.correo_envios.updateMany({
      where: { ID_ENVIO_CORREO: data.id_envio_correo, ID_JOB: jobId },
      data: { ESTADO: 'FALLIDO', ULTIMO_ERROR: motivo },
    });
  }
  await guardarFalloAuditable(prisma);
}
