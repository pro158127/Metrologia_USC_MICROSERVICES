import ExcelJS from 'exceljs';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { getObjectBuffer } from '../lib/minioClient.js';
import { mappingConfigSchema } from '../routes/plantillas-generacion.schemas.js';
import { resolverPlantillaOperativa } from './plantillas-readiness.service.js';
import { hidratarFormatoOperativo } from './render-documento-operativo.service.js';

export type TipoDocumentoExcel = 'COTIZACION' | 'ORDEN_TRABAJO' | 'RECEPCION';

export interface GenerarExcelParams {
  prisma: PrismaClient;
  tipo: TipoDocumentoExcel;
  id: number;
  plantillaId?: number;
  version?: number;
}

export interface DocumentoExcelGenerado {
  buffer: Buffer;
  fileName: string;
}

const TIPOS = { COTIZACION: 1, ORDEN_TRABAJO: 2, RECEPCION: 3 } as const;

export async function generarDocumentoExcel(params: GenerarExcelParams): Promise<DocumentoExcelGenerado> {
  const { prisma, tipo, id, plantillaId, version } = params;
  const plantilla = await resolverPlantillaOperativa(prisma, TIPOS[tipo], { plantillaId, version });
  const registro = await resolverRegistro(prisma, tipo, id);
  if (registro == null) throw new AppError(404, 'No se encontró el registro que se desea descargar.');
  const libro = new ExcelJS.Workbook();
  const formato = await getObjectBuffer(plantilla.documentos.RUTA_URL);
  await libro.xlsx.load(formato as any);
  hidratarFormatoOperativo(libro, TIPOS[tipo], registro, mappingConfigSchema.parse(plantilla.MAPPING_CONFIG));
  const fila = registro as { CODIGO_COTIZACION?: string; CODIGO_OT?: string; CODIGO_RECEPCION?: string };
  return {
    buffer: Buffer.from(await libro.xlsx.writeBuffer()),
    fileName: `${fila.CODIGO_COTIZACION ?? fila.CODIGO_OT ?? fila.CODIGO_RECEPCION}.xlsx`,
  };
}

async function resolverRegistro(prisma: PrismaClient, tipo: TipoDocumentoExcel, id: number): Promise<unknown> {
  if (tipo === 'COTIZACION') {
    return prisma.cotizaciones.findUnique({
      where: { ID_COTIZACION: id },
      include: {
        clientes: true,
        cotizacion_detalles: { where: { activacion: true } },
        historial_cambios: true,
      },
    });
  }
  if (tipo === 'ORDEN_TRABAJO') {
    return prisma.ordenes_trabajo.findUnique({
      where: { ID_ORDEN_TRABAJO: id },
      include: {
        clientes: true,
        cotizaciones: true,
        orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] }, orderBy: { ITEM: 'asc' } },
      },
    });
  }
  return prisma.recepciones_equipo.findUnique({
    where: { ID_RECEPCION: id },
    include: {
      recepcion_equipo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] }, orderBy: { ITEM: 'asc' } },
      cotizaciones: true,
      ordenes_trabajo: {
        include: {
          orden_trabajo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            orderBy: { ITEM: 'asc' },
            include: { usuarios: { select: { NOMBRE_COMPLETO: true } } },
          },
        },
      },
    },
  });
}
