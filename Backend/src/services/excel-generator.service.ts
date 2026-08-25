// services/excel-generator.service.ts
// Generación dinámica de Excel: resuelve la plantilla activa (version_plantillas
// con VERSION máxima), descarga el .xlsx desde MinIO, lo hidrata con los valores
// del registro (COTIZACION / ORDEN_TRABAJO / RECEPCION) según el MAPPING_CONFIG
// (celda→campo) y devuelve el binario hidratado.
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { getObjectBuffer } from '../lib/minioClient.js';

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

interface MappingConfig {
  mappings: {
    scalars?: Array<{ key: string; cell: string; dataType?: string; sheet?: string }>;
    tables?: Array<{
      key: string;
      startRow: number;
      sheet?: string;
      columns: Array<{ key: string; column: string; type?: string; subfields?: Array<{ key: string; column: string }> }>;
    }>;
  };
}

interface ValuesDoc {
  scalars: Record<string, unknown>;
  tables: Record<string, Record<string, unknown>[]>;
}

const MODULO_POR_TIPO: Record<TipoDocumentoExcel, string> = {
  COTIZACION: 'COTIZACIONES',
  ORDEN_TRABAJO: 'ORDEN_TRABAJO',
  RECEPCION: 'RECEPCION',
};

function esFecha(v: unknown): v is Date {
  return v instanceof Date;
}

function normalizarBooleano(v: unknown): unknown {
  if (typeof v === 'boolean') return v;
  if (v === true || v === 'true' || v === 'TRUE' || v === 'SI' || v === 'Sí' || v === 'si') return true;
  if (v === false || v === 'false' || v === 'FALSE' || v === 'NO' || v === 'no') return false;
  return v;
}

function horaDeFecha(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function celdasCubiertasDeHoja(worksheet: ExcelJS.Worksheet): Set<string> {
  const refs: string[] = Array.isArray((worksheet as any).model?.merges)
    ? (worksheet as any).model.merges
    : Array.isArray((worksheet as any)._merges)
      ? (worksheet as any)._merges
      : [];
  const covered = new Set<string>();
  for (const ref of refs) {
    if (typeof ref !== 'string' || !ref.includes(':')) continue;
    const [start, end] = ref.split(':');
    const startMatch = start.match(/^([A-Z]+)(\d+)$/);
    const endMatch = end.match(/^([A-Z]+)(\d+)$/);
    if (!startMatch || !endMatch) continue;
    const col0 = letterToIndex(startMatch[1]);
    const col1 = letterToIndex(endMatch[1]);
    const row0 = parseInt(startMatch[2], 10);
    const row1 = parseInt(endMatch[2], 10);
    for (let r = Math.min(row0, row1); r <= Math.max(row0, row1); r++) {
      for (let c = Math.min(col0, col1); c <= Math.max(col0, col1); c++) {
        if (r === row0 && c === col0) continue;
        covered.add(`${r}:${c}`);
      }
    }
  }
  return covered;
}

function letterToIndex(letter: string): number {
  let idx = 0;
  for (let i = 0; i < letter.length; i++) {
    idx = idx * 26 + (letter.charCodeAt(i) - 64);
  }
  return idx;
}

function indexToLetter(index: number): string {
  let s = '';
  let c = index;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function resolverHoja(
  workbook: ExcelJS.Workbook,
  nombre?: string
): ExcelJS.Worksheet | undefined {
  if (nombre) {
    const hoja = workbook.getWorksheet(nombre);
    if (hoja) return hoja;
  }
  return workbook.worksheets[0];
}

function escribirValor(worksheet: ExcelJS.Worksheet, celda: string, valor: unknown): void {
  if (valor === undefined || valor === null) return;
  if (typeof valor === 'string' && valor === '') return;

  const cell = worksheet.getCell(celda);
  if (esFecha(valor)) {
    cell.value = new Date(valor.getTime());
    return;
  }
  cell.value = typeof valor === 'number' || typeof valor === 'boolean' ? valor : String(valor);
}

export async function generarDocumentoExcel(params: GenerarExcelParams): Promise<DocumentoExcelGenerado> {
  const { prisma, tipo, id, plantillaId, version } = params;

  const plantilla =
    plantillaId !== undefined
      ? await prisma.plantillas.findUnique({
          where: { ID_PLANTILLA: plantillaId },
          include: {
            version_plantillas: {
              where: version ? { VERSION: version } : undefined,
              orderBy: { VERSION: 'desc' },
              take: 1,
              include: { documentos: true },
            },
          },
        })
      : await prisma.plantillas.findFirst({
          where: { MODULO: MODULO_POR_TIPO[tipo] },
          include: {
            version_plantillas: {
              where: version ? { VERSION: version } : undefined,
              orderBy: { VERSION: 'desc' },
              take: 1,
              include: { documentos: true },
            },
          },
        });

  if (!plantilla) {
    throw new AppError(404, `No se encontró una plantilla para el tipo ${tipo}`);
  }

  const versionActiva = plantilla.version_plantillas[0];
  if (!versionActiva?.documentos) {
    throw new AppError(400, 'La plantilla activa no tiene un documento Excel asociado.');
  }

  const mappingConfig = versionActiva.MAPPING_CONFIG as MappingConfig | null;
  if (!mappingConfig?.mappings) {
    throw new AppError(400, 'La versión activa no tiene un MAPPING_CONFIG guardado.');
  }

  const registro = await resolverRegistro(prisma, tipo, id);
  const valores = construirValores(tipo, registro);

  const buffer = await getObjectBuffer(versionActiva.documentos.RUTA_URL);
  const hidratado = await hidratarWorkbook(buffer, mappingConfig, valores);

  const baseNombre = versionActiva.documentos.NOMBRE.replace(/\.[^/.]+$/, '') || 'documento';
  return {
    buffer: hidratado,
    fileName: `${baseNombre}_${tipo}_${id}.xlsx`,
  };
}

async function resolverRegistro(prisma: PrismaClient, tipo: TipoDocumentoExcel, id: number): Promise<unknown> {
  if (tipo === 'COTIZACION') {
    return prisma.cotizaciones.findUnique({
      where: { ID_COTIZACION: id },
      include: {
        clientes: true,
        cotizacion_detalles: true,
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
        orden_trabajo_detalles: true,
      },
    });
  }
  return prisma.recepciones_equipo.findUnique({
    where: { ID_RECEPCION: id },
    include: {
      recepcion_equipo_detalles: true,
      cotizaciones: true,
    },
  });
}

function construirValores(tipo: TipoDocumentoExcel, registro: unknown): ValuesDoc {
  if (!registro) throw new AppError(404, 'Registro no encontrado');
  if (tipo === 'COTIZACION') return construirValoresCotizacion(registro as any);
  if (tipo === 'ORDEN_TRABAJO') return construirValoresOrdenTrabajo(registro as any);
  return construirValoresRecepcion(registro as any);
}

function construirValoresCotizacion(c: any): ValuesDoc {
  const cliente = c.clientes as any;
  const detalles = (c.cotizacion_detalles ?? []) as any[];
  const cambios = (c.historial_cambios ?? []) as any[];
  const totalCantidad = detalles.reduce((acc, d) => acc + (d.CANTIDAD ?? 0), 0);
  const totalServicio = detalles.reduce((acc, d) => acc + Number(d.VALOR_TOTAL ?? 0), 0);

  return {
    scalars: {
      no_cotizacion: c.CODIGO_COTIZACION,
      fecha_cotizacion: c.CREATED_AT,
      empresa: cliente?.RAZON_SOCIAL,
      nit: cliente?.NIT,
      ciudad: cliente?.ciudad,
      telefono: cliente?.TELEFONO,
      contacto: cliente?.NOMBRE_CONTACTO,
      email: cliente?.CORREO,
      total_cantidad_servicios: totalCantidad,
      total_servicio: totalServicio,
      monto_total: c.MONTO_TOTAL !== null && c.MONTO_TOTAL !== undefined ? Number(c.MONTO_TOTAL) : undefined,
    },
    tables: {
      tabla_cotizacion_items: detalles.map((d) => ({
        equipo_puntos: d.EQUIPO_DESCRIPCION,
        tipo_servicio: d.TIPO_SERVICIO,
        magnitud: d.MAGNITUD,
        norma_guia_tecnica: d.NORMA_TECNICA,
        cantidad: d.CANTIDAD,
        valor_unitario: Number(d.VALOR_UNITARIO),
        valor_total: Number(d.VALOR_TOTAL),
      })),
      tabla_control_cambios: cambios.map((h) => ({
        no_version: h.numero_version,
        fecha_cambio: h.fecha_cambio,
        descripcion: h.descripcion,
        validacion_hoja_calculo: normalizarBooleano(h.requiere_validacion_hoja),
        observaciones: h.observaciones,
        aprobo: h.aprobo,
      })),
    },
  };
}

function construirValoresOrdenTrabajo(o: any): ValuesDoc {
  const cliente = o.clientes as any;
  const detalles = (o.orden_trabajo_detalles ?? []) as any[];

  return {
    scalars: {
      cert_razon_social: cliente?.RAZON_SOCIAL,
      cert_nit: cliente?.NIT,
      cert_email_certificados: o.CORREO_CERTIFICADO,
      cert_fecha_limite_facturacion: o.FECHA_LIMITE_FACTURACION,
      cert_direccion: cliente?.dirrecion,
      cert_ciudad: cliente?.ciudad,
      cert_email_factura: o.CORREO_FACTURA,
      calib_interno_usc: normalizarBooleano(o.ES_INTERNO_USC),
      calib_en_sitio: normalizarBooleano(o.ES_EN_SITIO),
      calib_persona_contacto: o.PERSONA_CONTACTO,
      calib_telefono: o.TELEFONO_CONTACTO,
      calib_fecha: o.FECHA_CALIBRACION,
      calib_laboratorio_permanente: normalizarBooleano(o.ES_LAB_PERMANENTE),
      calib_hora: horaDeFecha(o.hora),
      solicitante_razon_social: o.Razon_social,
      solicitante_nit: o.NIT_solicitante,
      no_orden_trabajo: o.CODIGO_OT,
      no_cotizacion: o.no_cotizacion ?? o.cotizaciones?.CODIGO_COTIZACION,
      solicitante_direccion: o.dirrecion_solcitante,
      solicitante_ciudad: o.ciudad_solcitante,
      responsable: o.RESPONSABLE,
      fecha_diligenciamiento: o.FECHA_CALIBRACION_DILIGENCIAMENTO,
      solicitante_contacto: o.PERSONA_CONTACT_SOLCITANTE,
      solicitante_telefono: o.TELEFONO_CONTACTO_SOLICITANTE,
      requiere_anexo_instrumentos: normalizarBooleano(o.REQUIERE_ANEXO),
      observaciones: o.OBSERVACIONES,
    },
    tables: {
      tabla_instrumentos_principal: detalles.filter((d) => (d.ITEM ?? 0) <= 10).map((d) => mapearDetalleOt(d)),
      tabla_instrumentos_anexo: detalles.filter((d) => (d.ITEM ?? 0) > 10).map((d) => mapearDetalleOt(d)),
    },
  };
}

function mapearDetalleOt(d: any): Record<string, unknown> {
  const puntos = Array.isArray(d.PUNTOS_CALIBRAR) ? d.PUNTOS_CALIBRAR : [];
  const puntosObj: Record<string, unknown> = {};
  puntos.forEach((p: unknown, i: number) => {
    if (i < 5) puntosObj[`punto_${i + 1}`] = p;
  });
  return {
    item: d.ITEM,
    tipo_servicio: d.TIPO_SERVICIO,
    instrumento: d.INSTRUMENTO,
    fabricante: d.FABRICANTE,
    modelo: d.MODELO,
    serie: d.SERIE,
    codigo_interno: d.CODIGO_INVENTARIO,
    ubicacion: d.UBICACION,
    puntos_calibracion: puntosObj,
    unidad: d.UNIDAD,
    intervalo_medicion: d.INTERVALO_RANGO,
    resolucion_division: d.RESOLUCION,
    declaracion_conformidad: normalizarBooleano(d.DECLARACION_CONFORMIDAD),
    emp_ajuste_control: d.LIMITE_CONTROL_EMC,
    documento_especificacion: d.DOC_ESPECIFICACION,
    regla_decision: d.REGLA_DECISION,
  };
}

function construirValoresRecepcion(r: any): ValuesDoc {
  const detalles = (r.recepcion_equipo_detalles ?? []) as any[];
  return {
    scalars: {
      nombre_quien_entrega: r.NOMBRE_ENTREGA,
      no_cotizacion: r.cotizaciones?.CODIGO_COTIZACION,
      sitio_laboratorio_permanente:
        r.SITIO_CALIBRACION && /LAB/i.test(r.SITIO_CALIBRACION) ? true : null,
      sitio_instalaciones_cliente:
        r.SITIO_CALIBRACION && /CLIENTE|INSTALA/i.test(r.SITIO_CALIBRACION) ? true : null,
      fecha_recepcion: r.FECHA_RECEPCION,
      nombre_quien_recibe: r.NOMBRE_RECIBE,
      fecha_salida: r.FECHA_SALIDA,
      nombre_quien_empaca: r.NOMBRE_EMPACA,
      accesorios: r.ACCESORIOS,
      pruebas_pesaje_si: normalizarBooleano(r.PRUEBAS_COMPLETAS),
      pruebas_pesaje_no: r.PRUEBAS_COMPLETAS === false ? true : null,
      pruebas_pesaje_justificacion_no: r.OBSERVACIONES_PRUEBAS,
      nombre_quien_calibra: r.NOMBRE_CALIBRA,
      nombre_quien_recibe_servicio: r.NOMBRE_RECIBE_SERVICIO,
    },
    tables: {
      tabla_recepcion_instrumentos: detalles.map((d) => {
        const ibc = (d.ESTADO_IBC as any) ?? {};
        return {
          instrumento: d.INSTRUMENTO,
          marca: d.MARCA,
          modelo: d.MODELO,
          serie: d.SERIE,
          codigo_interno: d.CODIGO_INVENTARIO,
          resolucion: d.RESOLUCION,
          tipo_sensor_int: d.TIPO_SENSOR_TEMP === 'INT' ? true : null,
          tipo_sensor_ext: d.TIPO_SENSOR_TEMP === 'EXT' ? true : null,
          estado_ibc_e: normalizarBooleano(ibc.e),
          estado_ibc_t: normalizarBooleano(ibc.t),
          estado_ibc_d: normalizarBooleano(ibc.d),
          estado_ibc_a: normalizarBooleano(ibc.a),
          estampilla: d.ESTAMPILLA,
          observaciones: d.OBSERVACIONES,
        };
      }),
    },
  };
}

export async function hidratarWorkbook(
  buffer: Buffer | Uint8Array,
  mappingConfig: MappingConfig,
  valores: ValuesDoc
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const escalares = mappingConfig.mappings.scalars ?? [];
  const tablas = mappingConfig.mappings.tables ?? [];

  for (const sm of escalares) {
    if (!sm.cell || !(sm.key in valores.scalars)) continue;
    const hoja = resolverHoja(workbook, sm.sheet);
    if (!hoja) continue;
    escribirValor(hoja, sm.cell, valores.scalars[sm.key]);
  }

  for (const tabla of tablas) {
    const filas = valores.tables[tabla.key] ?? [];
    if (filas.length === 0 || typeof tabla.startRow !== 'number') continue;

    const hoja = resolverHoja(workbook, tabla.sheet);
    if (!hoja) continue;

    const celdasCubiertas = celdasCubiertasDeHoja(hoja);

    let filaActual = Math.max(1, tabla.startRow);
    for (const fila of filas) {
      for (const col of tabla.columns) {
        if (!col.column) continue;
        if (col.type === 'OBJECT') {
          const objeto = (fila as any)[col.key];
          if (objeto && typeof objeto === 'object') {
            const claves = Object.keys(objeto);
            if (col.subfields && col.subfields.length > 0) {
              for (const sub of col.subfields) {
                if (!sub.column) continue;
                const valor = (objeto as Record<string, unknown>)[sub.key];
                if (valor === undefined) continue;
                const ref = `${sub.column}${filaActual}`;
                if (celdasCubiertas.has(`${filaActual}:${letterToIndex(sub.column)}`)) continue;
                escribirValor(hoja, ref, valor);
              }
            } else {
              claves.forEach((k, idx) => {
                const letra = indexToLetter(letterToIndex(col.column!) + idx);
                const ref = `${letra}${filaActual}`;
                if (celdasCubiertas.has(`${filaActual}:${letterToIndex(letra)}`)) return;
                escribirValor(hoja, ref, (objeto as Record<string, unknown>)[k]);
              });
            }
          }
          continue;
        }
        const valor = (fila as Record<string, unknown>)[col.key];
        if (valor === undefined) continue;
        if (celdasCubiertas.has(`${filaActual}:${letterToIndex(col.column)}`)) continue;
        escribirValor(hoja, `${col.column}${filaActual}`, valor);
      }
      filaActual += 1;
    }
  }

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
