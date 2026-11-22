import type { Prisma } from '@prisma/client';
import type { GeneracionExcelJob } from './generacion-pendiente.service.js';
import type { EmailJobData } from '../lib/queue/queue.js';
import { registrarCorreoPendiente } from './email-delivery.service.js';

const correoPorAccion = {
  cot_create: { tipo: 'crear_cotizacion', asunto: 'Cotización', adjunto: 'pdf' },
  cot_update: { tipo: 'actualizar_cotizacion', asunto: 'Cotización actualizada', adjunto: 'pdf' },
  aprove: { tipo: 'aproved', asunto: 'Cotización aprobada', adjunto: 'pdf' },
  ot_create: { tipo: 'crear_ot', asunto: 'Registro de Orden de Trabajo', adjunto: 'excel' },
  ot_update: { tipo: 'actualizacion_ordenes', asunto: 'Orden de Trabajo actualizada', adjunto: 'excel' },
  ot_actualizar: { tipo: 'actualizacion_ordenes', asunto: 'Orden de Trabajo actualizada', adjunto: 'excel' },
} as const;

export function prepararCorreoDocumental(
  job: GeneracionExcelJob,
  estado: string | null,
  contexto: Record<string, unknown> | null,
  archivos: { excel?: string | null; url_pdf: string },
): EmailJobData | null {
  if (job.tipo_entry !== 'prod' || !contexto || !job.action) return null;
  if (job.action === 'cot_create' && estado !== 'ENVIADA') return null;
  if (job.action === 'cot_update' && estado === 'BORRADOR') return null;
  if (!(job.action in correoPorAccion)) return null;
  const configuracion = correoPorAccion[job.action as keyof typeof correoPorAccion];
  const esOt = configuracion.adjunto === 'excel';
  const adjunto = esOt ? archivos.excel : archivos.url_pdf;
  const codigo = esOt ? contexto.numeroOT : contexto.numeroCotizacion;
  return {
    to: typeof contexto.emailDestino === 'string' ? contexto.emailDestino : '',
    subject: `${configuracion.asunto}: ${codigo ?? ''} - MetroSoft`,
    template_type: configuracion.tipo,
    context_data: contexto,
    minio_links: adjunto ? [adjunto] : [],
    id_registro: job.id_registro,
    id_cotizacion: esOt ? job.id_cotizacion : job.id_registro,
    notificar_usuario_id: job.id_usuario ?? null,
    modulo_origen: esOt ? 'ordenes_trabajo' : 'cotizaciones',
    tipo_entry: 'prod',
  };
}

export async function completarGeneracionDocumental(
  tx: Prisma.TransactionClient,
  job: GeneracionExcelJob,
  estado: string | null,
  contexto: Record<string, unknown> | null,
  archivos: { excel?: string | null; url_pdf: string },
): Promise<void> {
  if (!job.id_job) throw new Error('Falta el registro de seguimiento del documento.');
  const completado = await tx.quote.updateMany({
    where: { id: job.id_job, status: { not: 'COMPLETED' } },
    data: { status: 'COMPLETED', fileUrl: null, data: archivos },
  });
  if (!completado.count) return;
  const correo = prepararCorreoDocumental(job, estado, contexto, archivos);
  if (!correo) return;
  if (!correo.id_cotizacion && job.tipo === 2) {
    const ot = await tx.ordenes_trabajo.findUnique({
      where: { ID_ORDEN_TRABAJO: job.id_registro }, select: { ID_COTIZACION_FK: true },
    });
    correo.id_cotizacion = ot?.ID_COTIZACION_FK ?? undefined;
  }
  await registrarCorreoPendiente(tx, correo);
}
