// services/plantillas-readiness.service.ts
// Evalúa si las plantillas operativas de documentos (Cotización, Órdenes de
// Trabajo y Recepción) están completas: deben tener un archivo adjunto y su
// MAPPING_CONFIG lleno respecto al INPUT_SCHEMA (campos `required`).
import { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export const ID_PLANTILLA_COTIZACION = 1;
export const ID_PLANTILLA_ORDENES = 2;
export const ID_PLANTILLA_RECEPCION = 3;
export const IDS_PLANTILLAS_OPERATIVAS = [
  ID_PLANTILLA_COTIZACION,
  ID_PLANTILLA_ORDENES,
  ID_PLANTILLA_RECEPCION,
] as const;

const NOMBRE_MODULO: Record<number, string> = {
  [ID_PLANTILLA_COTIZACION]: 'Cotización',
  [ID_PLANTILLA_ORDENES]: 'Órdenes de Trabajo',
  [ID_PLANTILLA_RECEPCION]: 'Recepción',
};

export interface ResultadoPlantilla {
  id: number;
  modulo: string;
  completa: boolean;
  tieneArchivo: boolean;
  mapeoCompleto: boolean;
  faltantes: string[];
}

export interface EstadoPlantillasOperativas {
  todasCompletas: boolean;
  detalle: ResultadoPlantilla[];
  mensaje: string;
}

function evaluarMapeo(
  mappingConfig: unknown,
  inputSchema: unknown,
): { completo: boolean; faltantes: string[] } {
  const faltantes: string[] = [];
  const mapping = mappingConfig as any;

  const scalars: any[] = Array.isArray(mapping?.mappings?.scalars)
    ? mapping.mappings.scalars
    : [];
  const tables: any[] = Array.isArray(mapping?.mappings?.tables)
    ? mapping.mappings.tables
    : [];

  if (!mappingConfig || typeof mappingConfig !== 'object') {
    return { completo: false, faltantes: ['Mapeo de variables ausente'] };
  }

  const schema = inputSchema as any;
  if (schema && typeof schema === 'object' && schema.fields) {
    const schemaScalars: any[] = Array.isArray(schema.fields.scalars) ? schema.fields.scalars : [];
    for (const s of schemaScalars) {
      if (!s?.required) continue;
      const m = scalars.find((x) => x?.key === s.key);
      const cell = m?.cell;
      if (!m || typeof cell !== 'string' || cell.trim() === '') {
        faltantes.push(`Variable "${s.label ?? s.key}"`);
      }
    }

    const schemaTables: any[] = Array.isArray(schema.fields.tables) ? schema.fields.tables : [];
    for (const t of schemaTables) {
      if (!t?.required) continue;
      const m = tables.find((x) => x?.key === t.key);
      if (!m) {
        faltantes.push(`Tabla "${t.label ?? t.key}"`);
        continue;
      }
      if (m.startRow == null || m.endRow == null || m.star_header == null) {
        faltantes.push(`Tabla "${t.label ?? t.key}" (rango de filas)`);
      }
      for (const c of t.columns ?? []) {
        if (!c?.required) continue;
        const cm = (m.columns ?? []).find((x: any) => x?.key === c.key);
        const column = cm?.column;
        const columnsList = cm?.columnsList;
        const tiene =
          (typeof column === 'string' && column.trim() !== '') ||
          (Array.isArray(columnsList) && columnsList.length > 0);
        if (!tiene) {
          faltantes.push(`Columna "${c.label ?? c.key}" de "${t.label ?? t.key}"`);
        }
      }
    }
  } else {
    if (scalars.length === 0) faltantes.push('Sin variables mapeadas');
    if (tables.length === 0) faltantes.push('Sin tablas mapeadas');
  }

  return { completo: faltantes.length === 0, faltantes };
}

export async function evaluarCompletitudPlantilla(
  prisma: PrismaClient,
  id: number,
): Promise<ResultadoPlantilla> {
  const version = await prisma.version_plantillas.findFirst({
    where: { ID_PLANTILLA_FK: id },
    orderBy: { VERSION: 'desc' },
  });

  const tieneArchivo = version != null && version.ID_DOCUMENTOS_FK != null;
  const { completo: mapeoCompleto, faltantes } = evaluarMapeo(
    version?.MAPPING_CONFIG ?? null,
    version?.INPUT_SCHEMA ?? null,
  );

  const faltantesFinal = tieneArchivo
    ? faltantes
    : ['Archivo de plantilla (formato) no adjunto', ...faltantes];

  return {
    id,
    modulo: NOMBRE_MODULO[id] ?? `Plantilla ${id}`,
    completa: tieneArchivo && mapeoCompleto,
    tieneArchivo,
    mapeoCompleto,
    faltantes: faltantesFinal,
  };
}

function construirMensaje(detalle: ResultadoPlantilla[]): string {
  const incompletas = detalle.filter((d) => !d.completa);
  if (incompletas.length === 0) return '';

  const partes = incompletas.map(
    (d) => `${d.modulo}: ${d.faltantes.length > 0 ? d.faltantes.join(', ') : 'incompleta'}`,
  );

  return (
    'No es posible continuar: las plantillas de documento no están completas. ' +
    'Configure el formato (archivo) y el mapeo de variables en Administración → Plantillas. ' +
    `Detalle — ${partes.join(' | ')}`
  );
}

export async function evaluarPlantillasOperativas(
  prisma: PrismaClient,
): Promise<EstadoPlantillasOperativas> {
  const detalle = await Promise.all(
    IDS_PLANTILLAS_OPERATIVAS.map((id) => evaluarCompletitudPlantilla(prisma, id)),
  );
  return {
    todasCompletas: detalle.every((d) => d.completa),
    detalle,
    mensaje: construirMensaje(detalle),
  };
}

/** Lanza un AppError(412) si alguna de las 3 plantillas operativas está incompleta. */
export async function verificarPlantillasOperativas(prisma: PrismaClient): Promise<void> {
  const { todasCompletas, detalle } = await evaluarPlantillasOperativas(prisma);
  if (!todasCompletas) {
    throw new AppError(412, construirMensaje(detalle));
  }
}
