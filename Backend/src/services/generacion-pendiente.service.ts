import { Prisma } from '@prisma/client';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
import type { GenerarExcelBody } from '../routes/plantillas-generacion.schemas.js';
import { resolverPlantillaOperativa } from './plantillas-readiness.service.js';

export type GeneracionExcelJob = GenerarExcelBody & {
  estadoCotizacion?: string;
  idVersionPlantilla?: number;
  rutaPlantilla?: string;
  mapeoPlantilla?: Prisma.JsonValue;
};

export type FacturaPdfJob = {
  documento: 'factura';
  tipo: 4;
  tipo_entry: 'prod';
  id_registro: number;
  id_job: string;
};

export type GeneracionDocumentoJob = GeneracionExcelJob | FacturaPdfJob;

type Tx = Prisma.TransactionClient;
export type SolicitudGeneracion = Omit<GenerarExcelBody, 'id_job' | 'codigo_actual'> & { codigo_actual?: string | null };

export async function registrarGeneracionPendiente(tx: Tx, nombre: string, solicitud: SolicitudGeneracion) {
  const { tipo, id_registro, tipo_entry } = solicitud;
  const plantilla = await resolverPlantillaOperativa(tx, tipo);
  const registro = tipo === 1
    ? await tx.cotizaciones.findUniqueOrThrow({ where: { ID_COTIZACION: id_registro }, select: { CODIGO_COTIZACION: true, ESTADO: true } })
    : tipo === 2
    ? await tx.ordenes_trabajo.findUniqueOrThrow({ where: { ID_ORDEN_TRABAJO: id_registro }, select: { CODIGO_OT: true } })
    : await tx.recepciones_equipo.findUniqueOrThrow({ where: { ID_RECEPCION: id_registro }, select: { CODIGO_RECEPCION: true } });
  const codigo = 'CODIGO_COTIZACION' in registro ? registro.CODIGO_COTIZACION
    : 'CODIGO_OT' in registro ? registro.CODIGO_OT : registro.CODIGO_RECEPCION;
  const payload: GeneracionExcelJob = {
    ...solicitud,
    codigo_actual: tipo_entry === 'prod' ? codigo : undefined,
    estadoCotizacion: tipo_entry === 'prod' && 'ESTADO' in registro ? registro.ESTADO : undefined,
    idVersionPlantilla: plantilla.ID_VERSION_PLANTILLA,
    rutaPlantilla: plantilla.documentos.RUTA_URL,
    mapeoPlantilla: plantilla.MAPPING_CONFIG,
  };
  const data = JSON.parse(JSON.stringify({ generacion: { nombre, payload } })) as Prisma.InputJsonValue;
  return tx.quote.create({ data: { status: 'PENDING', data } });
}

export async function despacharGeneracionesPendientes(tx: Tx): Promise<void> {
  const trabajos = await tx.quote.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING'] }, data: { path: ['generacion'], not: Prisma.AnyNull } },
    select: { id: true, data: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!trabajos.length) return;
  const cola = getGenerationExcelQueue();
  for (const trabajo of trabajos) {
    const { generacion } = (trabajo.data ?? {}) as { generacion?: { nombre: string; payload: Omit<FacturaPdfJob, 'id_job'> | GeneracionExcelJob } };
    if (!generacion) continue;
    const jobId = `doc-${trabajo.id}`;
    // BullMQ descarta el segundo add con el mismo ID, incluso desde otro proceso.
    await cola.add(generacion.nombre, { ...generacion.payload, id_job: trabajo.id }, { jobId });
  }
}
