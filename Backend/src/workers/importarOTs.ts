import { PrismaClient } from '@prisma/client';
import exceljs from 'exceljs';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import {
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import {
  splitHeterogeneousOT,
  InstrumentoResuelto,
  SitioCalibracion,
} from '../services/ot-split.service.js';
import { Worker, Job } from 'bullmq';
import { getRedisConnection, IMPORTAR_QUEUE } from '../lib/queue/queue.js';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';

const prisma = new PrismaClient();

interface ImportarOTEPayload {
  s3KeyTemp: string;
  mappingConfig: any;
  id_cotizacion?: number;
  idUsuario: number;
  id_job: string;
  tipoFlujo?: 'estandar' | 'inverso';
}

type ExtractedScalar = string | number | boolean | Date | null;

interface ExtractedInstrument {
  item?: string | number | null;
  tipo_servicio?: string | null;
  instrumento: string;
  fabricante?: string | null;
  modelo?: string | null;
  serie?: string | null;
  codigo_interno?: string | null;
  ubicacion?: string | null;
  puntos_calibracion?: string[];
  unidad?: string | null;
  intervalo_medicion?: string | null;
  resolucion_division?: string | null;
  declaracion_conformidad?: boolean;
  emp_ajuste_control?: string | null;
  emp_limite_control?: string | null;
  documento_especificacion?: string | null;
  regla_decision?: string | null;
  tarifa_id?: number;
  magnitud_real?: string | null;
  tipo_servicio_real?: string | null;
  valor_estimado?: number;
  sitio?: string | null;
  instrumento_tarifa?: string | null; // nombre oficial de la tarifa resuelta
}

interface ExtractedData {
  escalares: Record<string, ExtractedScalar>;
  tablas: ExtractedInstrument[];
}

function cleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && value && 'result' in value) {
    return cleanString((value as any).result);
  }
  const text = String(value).trim();
  return text === '' ? null : text;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const text = String(value).trim().toLowerCase();
  if (['true', 'verdadero', 'sí', 'si', 's', 'yes', 'y', '1', 'x'].includes(text)) return true;
  if (['false', 'falso', 'no', 'n', '0'].includes(text)) return false;
  return null;
}

function normalizeDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  // ExcelJS puede entregar un objeto rich value para algunas celdas.
  if (typeof value === 'object' && value && 'result' in value) {
    return normalizeDate((value as any).result);
  }

  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readScalarValue(cell: exceljs.Cell, dataType?: string): ExtractedScalar {
  const raw = cell.value;

  switch (String(dataType || 'STRING').toUpperCase()) {
    case 'BOOLEAN':
      return normalizeBoolean(raw);
    case 'DATE':
      return normalizeDate(raw);
    case 'NUMBER': {
      if (raw === null || raw === undefined || raw === '') return null;
      const number = Number(raw);
      return Number.isFinite(number) ? number : null;
    }
    case 'STRING':
    default:
      return cleanString(raw);
  }
}

function cellText(cell: exceljs.Cell): string | null {
  return cleanString(cell.value);
}

function cellToArray(cell: exceljs.Cell): string[] {
  const value = cell.value;
  if (value === null || value === undefined || value === '') return [];

  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item))
      .filter((item): item is string => Boolean(item));
  }

  const text = cleanString(value);
  if (!text) return [];

  return text
    .split(/[,;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function readColumnsList(row: exceljs.Row, columnsList: string[]): string[] {
  const result: string[] = [];

  for (const column of columnsList) {
    const values = cellToArray(row.getCell(column));
    result.push(...values);
  }

  return result;
}

function readMappedRow(
  row: exceljs.Row,
  columns: any[],
): Record<string, string | string[] | boolean | number | null> {
  const result: Record<string, any> = {};

  for (const mapping of columns || []) {
    if (Array.isArray(mapping.columnsList)) {
      result[mapping.key] = readColumnsList(row, mapping.columnsList);
      continue;
    }

    if (mapping.column) {
      const cell = row.getCell(mapping.column);
      const raw = cell.value;

      // Los campos de tabla no tienen dataType en el mapping actual.
      // Se conserva el valor como texto salvo booleanos reconocibles.
      result[mapping.key] = cleanString(raw);
    }
  }

  return result;
}

function isInstrumentRowEmpty(row: exceljs.Row, columns: any[]): boolean {
  const instrumentColumn = columns?.find((column) => column.key === 'instrumento')?.column;
  if (instrumentColumn && cleanString(row.getCell(instrumentColumn).value)) return false;

  // Si no hay instrumento, consideramos vacía la fila cuando no hay ningún dato mapeado.
  return !(columns || []).some((mapping) => {
    if (mapping.column) return Boolean(cleanString(row.getCell(mapping.column).value));
    if (Array.isArray(mapping.columnsList)) {
      return mapping.columnsList.some((column: string) => Boolean(cleanString(row.getCell(column).value)));
    }
    return false;
  });
}

function normalizeInstrument(raw: Record<string, any>, tableKey: string): ExtractedInstrument | null {
  const instrumento = cleanString(raw.instrumento);
  if (!instrumento) return null;

  const puntos = Array.isArray(raw.puntos_calibracion)
    ? raw.puntos_calibracion
    : [];

  const declaracion = normalizeBoolean(raw.declaracion_conformidad);

  return {
    item: raw.item ?? null,
    instrumento,
    // El mapping principal usa fabricante y el anexo usa marca.
    fabricante: cleanString(raw.fabricante ?? raw.marca),
    modelo: cleanString(raw.modelo),
    serie: cleanString(raw.serie),
    codigo_interno: cleanString(raw.codigo_interno),
    ubicacion: cleanString(raw.ubicacion),
    puntos_calibracion: puntos,
    unidad: cleanString(raw.unidad),
    intervalo_medicion: cleanString(raw.intervalo_medicion),
    resolucion_division: cleanString(raw.resolucion_division),
    declaracion_conformidad: declaracion ?? false,
    emp_ajuste_control: cleanString(raw.emp_ajuste_control),
    emp_limite_control: cleanString(raw.emp_limite_control),
    documento_especificacion: cleanString(raw.documento_especificacion),
    regla_decision: cleanString(raw.regla_decision),
    // El anexo no trae tipo_servicio; se resolverá desde tarifas.
    tipo_servicio: cleanString(raw.tipo_servicio),
    // Sitio por fila (opcional en el mapping; si no viene se resuelve luego).
    sitio: cleanString(raw.sitio ?? raw.sitio_calibracion ?? raw.lugar_calibracion),
    tarifa_id: undefined,
    magnitud_real: null,
    tipo_servicio_real: null,
    valor_estimado: 0,
  };
}

function combineDateAndTime(dateValue: unknown, timeValue: unknown): Date | null {
  const date = normalizeDate(dateValue);
  if (!date) return null;

  const time = cleanString(timeValue);
  if (!time) return date;

  const match = time.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return date;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const second = Number(match[3] || 0);
  const meridiem = match[4]?.toUpperCase();

  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  if (hour > 23 || minute > 59 || second > 59) return date;

  const result = new Date(date);
  result.setHours(hour, minute, second, 0);
  return result;
}

function parseExcelDateOrNull(value: unknown): Date | null {
  return normalizeDate(value);
}

async function extractByMapping(
  workbook: exceljs.Workbook,
  mappingConfig: any,
): Promise<ExtractedData> {
  const datosExtraidos: ExtractedData = {
    escalares: {},
    tablas: [],
  };

  const scalars = mappingConfig?.mappings?.scalars || [];

  for (const scalar of scalars) {
    const sheet = workbook.getWorksheet(scalar.sheet || 1);
    if (!sheet) {
      throw new Error(`La hoja '${scalar.sheet}' configurada para '${scalar.key}' no existe.`);
    }

    datosExtraidos.escalares[scalar.key] = readScalarValue(
      sheet.getCell(scalar.cell),
      scalar.dataType,
    );
  }

  const tables = mappingConfig?.mappings?.tables || [];

  for (const tableConfig of tables) {
    const sheet = workbook.getWorksheet(tableConfig.sheet || 1);
    if (!sheet) {
      throw new Error(`La hoja '${tableConfig.sheet}' configurada para la tabla '${tableConfig.key}' no existe.`);
    }

    const startRow = Number(tableConfig.startRow);
    const endRow = Number(tableConfig.endRow);

    if (!Number.isInteger(startRow) || !Number.isInteger(endRow) || startRow > endRow) {
      throw new Error(`Rango inválido en la tabla '${tableConfig.key}': ${tableConfig.startRow}-${tableConfig.endRow}.`);
    }

    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
      const row = sheet.getRow(rowNumber);

      if (isInstrumentRowEmpty(row, tableConfig.columns)) continue;

      const rawRow = readMappedRow(row, tableConfig.columns);
      const instrument = normalizeInstrument(rawRow, tableConfig.key);

      if (instrument) {
        datosExtraidos.tablas.push(instrument);
      }
    }
  }

  if (datosExtraidos.tablas.length === 0) {
    throw new Error('No se encontraron instrumentos en ninguna de las tablas configuradas.');
  }

  return datosExtraidos;
}

function getString(data: ExtractedData, key: string): string | null {
  return cleanString(data.escalares[key]);
}

function getBoolean(data: ExtractedData, key: string, defaultValue = false): boolean {
  const value = normalizeBoolean(data.escalares[key]);
  return value ?? defaultValue;
}

function getDate(data: ExtractedData, key: string): Date | null {
  return parseExcelDateOrNull(data.escalares[key]);
}

function decimalOrZero(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

// ============================================================================
// CONFIGURACIÓN DEL MATCH DE TARIFAS
// ============================================================================

/**
 * true  = un instrumento sin tarifa / sin precio / ambiguo detiene el import (comportamiento anterior).
 * false = se importa igual: queda con la tarifa más probable (o sin tarifa y valor 0) y una advertencia.
 */
const ESTRICTO_TARIFAS = false;

/**
 * true  = en el flujo 2, si las cantidades del archivo no cuadran con la cotización, se detiene.
 * false = solo deja una advertencia. OJO: el split borra y recrea los detalles de la OT existente;
 *         con false, un archivo distinto sobre la misma cotización sobrescribe esos detalles.
 */
const BLOQUEAR_DISCREPANCIA_COTIZACION = true;

// ============================================================================
// NORMALIZACIÓN Y RESOLUCIÓN DE TARIFAS (sin tocar la BD)
// ============================================================================

/** Minúsculas, sin tildes, espacios/saltos de línea/\xa0 colapsados a uno solo. */
const normalizar = (s?: string | null): string =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLowerCase();

type CriterioFamilia = 'presion' | 'masa' | 'digital_analogico';

interface FamiliaTarifa {
  clave: string; // identifica la familia al comparar contra la cotización
  aliasOT: string[]; // nombres cortos del desplegable de la OT
  prefijosTarifa: string[]; // cómo empiezan los nombres en la tabla de tarifas
  criterio: CriterioFamilia; // cómo elegir entre las filas de la familia
}

const FAMILIAS: FamiliaTarifa[] = [
  {
    clave: 'familia:manometros',
    aliasOT: ['Manómetro analógico o digital'],
    prefijosTarifa: ['Manómetros analógicos y digitales'],
    criterio: 'presion',
  },
  {
    clave: 'familia:pesaje',
    aliasOT: ['Instrumentos de pesaje de funcionamiento no automático'],
    prefijosTarifa: ['Instrumentos de pesaje de funcionamiento no automático'],
    criterio: 'masa',
  },
  {
    clave: 'familia:termometros',
    aliasOT: ['Termómetro digital o analógico'],
    prefijosTarifa: ['Termómetros digitales', 'Termómetros de indicación analógica'],
    criterio: 'digital_analogico',
  },
  {
    clave: 'familia:termohigrometros',
    aliasOT: ['Termohigrómetro Digital o Analógico'],
    prefijosTarifa: ['Termohigrómetros / Analógicos', 'Termohigrómetros / Digitales'],
    criterio: 'digital_analogico',
  },
];

const FAMILIAS_N = FAMILIAS.map((f) => ({
  ...f,
  alias: f.aliasOT.map(normalizar),
  prefijos: f.prefijosTarifa.map(normalizar),
}));

/** Clave de comparación: todas las filas de una familia cuentan como un solo instrumento. */
const familiaDe = (nombre?: string | null): string => {
  const n = normalizar(nombre);
  const f = FAMILIAS_N.find((x) => x.alias.includes(n) || x.prefijos.some((p) => n.startsWith(p)));
  return f?.clave ?? n;
};

// ---------------------------------------------------------------------------
// Lectura de rangos (presión -> psi, masa -> g)
// ---------------------------------------------------------------------------
interface Dominio {
  factores: Record<string, number>; // unidad -> unidad base
  regexUnidad: RegExp;
}

const DOMINIO_PRESION: Dominio = {
  factores: {
    psi: 1,
    bar: 14.5037738,
    mbar: 0.0145037738,
    kpa: 0.145037738,
    mpa: 145.037738,
    pa: 0.000145037738,
    mmhg: 0.0193368,
    inhg: 0.491154,
    'kgf/cm2': 14.2233,
    'kg/cm2': 14.2233,
    cmh2o: 0.0142233,
  },
  regexUnidad: /(?<![a-z])(kgf\/cm[2²]|kg\/cm[2²]|cm\s?h2o|mmhg|inhg|mbar|psi|bar|kpa|mpa|pa)(?![a-z])/i,
};

const DOMINIO_MASA: Dominio = {
  factores: { mg: 0.001, g: 1, kg: 1000, lb: 453.592 },
  regexUnidad: /(?<![a-z])(kg|mg|lb|g)(?![a-z])/i,
};

const canonUnidad = (u?: string | null): string =>
  (u ?? '').toLowerCase().replace(/\s+/g, '').replace('²', '2');

/** "1.000" -> 1000, "1,5" -> 1.5, "0.250" -> 0.25 */
function parseNumero(token: string): number | null {
  let t = token.replace(/\s/g, '');
  const tienePunto = t.includes('.');
  const tieneComa = t.includes(',');

  if (tienePunto && tieneComa) {
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    t = t.split(mil).join('').replace(dec, '.');
  } else if (tienePunto || tieneComa) {
    const sep = tienePunto ? '.' : ',';
    const partes = t.split(sep);
    const esMiles =
      partes.length > 2 ||
      (partes.length === 2 && /^\d{3}$/.test(partes[1]) && /^-?[1-9]\d{0,2}$/.test(partes[0]));
    t = esMiles ? partes.join('') : t.replace(sep, '.');
  }

  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Rango del instrumento en la unidad base del dominio, o null si no se puede leer. */
function extraerRango(
  unidad: string | null | undefined,
  intervalo: string | null | undefined,
  dom: Dominio,
): { min: number; max: number } | null {
  const texto = intervalo ?? '';
  if (!texto.trim()) return null;

  // Unidad: la celda "unidad" o, si falta/no se reconoce, la escrita dentro del intervalo.
  let u = canonUnidad(unidad);
  if (!dom.factores[u]) {
    const m = texto.match(dom.regexUnidad);
    u = m ? canonUnidad(m[0]) : '';
  }
  const factor = dom.factores[u];
  if (!factor) return null;

  const limpio = texto
    .replace(new RegExp(dom.regexUnidad.source, 'gi'), ' ')
    // un guion entre dos números es separador de rango, no signo: "0-100" -> "0 a 100"
    .replace(/(\d)\s*[-–—]\s*(?=[-\d])/g, '$1 a ');

  const nums = (limpio.match(/(?<![\d.,])-?\d+(?:[.,]\d+)*/g) ?? [])
    .map(parseNumero)
    .filter((n): n is number => n !== null);
  if (nums.length === 0) return null;

  return { min: Math.min(...nums) * factor, max: Math.max(...nums) * factor };
}

/** Lee "(0 psi < p ≤ 50 psi)" del nombre de la tarifa, en psi. */
function rangoTarifaPresion(nombre: string): { lo: number; hi: number } | null {
  const m = normalizar(nombre).match(
    /\(\s*(-?\d+(?:[.,]\d+)?)\s*psi\s*[<≤]\s*p\s*≤\s*(-?\d+(?:[.,]\d+)?)\s*psi\s*\)/,
  );
  if (!m) return null;
  const lo = parseNumero(m[1]);
  const hi = parseNumero(m[2]);
  return lo === null || hi === null ? null : { lo, hi };
}

/** Lee "220 g < m ≤ 5000 g" / "5000 g < m ≤ 34 kg" del nombre de la tarifa, en gramos. */
function rangoTarifaMasa(nombre: string): { lo: number; hi: number } | null {
  const m = normalizar(nombre).match(
    /(\d+(?:[.,]\d+)?)\s*(kg|mg|g)\s*<\s*m\s*≤\s*(\d+(?:[.,]\d+)?)\s*(kg|mg|g)/,
  );
  if (!m) return null;
  const lo = parseNumero(m[1]);
  const hi = parseNumero(m[3]);
  const fLo = DOMINIO_MASA.factores[m[2]];
  const fHi = DOMINIO_MASA.factores[m[4]];
  return lo === null || hi === null ? null : { lo: lo * fLo, hi: hi * fHi };
}

// ---------------------------------------------------------------------------
// Elección entre varias filas de una misma familia
// ---------------------------------------------------------------------------
interface ItemParaTarifa {
  instrumento: string;
  unidad?: string | null;
  intervalo_medicion?: string | null;
  fabricante?: string | null;
  modelo?: string | null;
  resolucion_division?: string | null;
  documento_especificacion?: string | null;
}

interface ResultadoTarifa<T> {
  tarifa: T | null;
  advertencia?: string;
  motivo?: string;
}

const nombresCortos = <T extends { Instrumento: string }>(c: T[]): string =>
  c.map((x) => x.Instrumento.replace(/\s+/g, ' ').trim().slice(0, 60)).join(' | ');

function elegirPorRango<T extends { Instrumento: string }>(
  candidatas: T[],
  rango: { min: number; max: number } | null,
  leerTarifa: (nombre: string) => { lo: number; hi: number } | null,
  unidadBase: string,
): ResultadoTarifa<T> {
  const conRango = candidatas
    .map((t) => ({ t, r: leerTarifa(t.Instrumento) }))
    .filter((x): x is { t: T; r: { lo: number; hi: number } } => x.r !== null);

  if (conRango.length < 2) {
    return { tarifa: null, motivo: `Ambiguo: coincide con ${candidatas.length} tarifas (${nombresCortos(candidatas)})` };
  }

  // Sin rango legible en la OT: la de menor rango positivo, con advertencia.
  if (!rango) {
    return {
      tarifa: (conRango.find((x) => x.r.hi > 0) ?? conRango[0]).t,
      advertencia: 'rango de medición ilegible o vacío en la OT; se usó la tarifa de menor rango',
    };
  }

  const v = rango.max; // límite superior del instrumento
  const hit =
    v <= 0
      ? conRango.find((x) => x.r.hi <= 0) // p. ej. manómetro de vacío
      : conRango.find((x) => v > x.r.lo && v <= x.r.hi);

  if (!hit) {
    return { tarifa: null, motivo: `Rango fuera de las tarifas (máximo ${v.toFixed(1)} ${unidadBase})` };
  }
  return { tarifa: hit.t };
}

function elegirDigitalAnalogico<T extends { Instrumento: string }>(
  candidatas: T[],
  item: ItemParaTarifa,
): ResultadoTarifa<T> {
  // No se mira item.instrumento: el nombre del desplegable dice "digital o analógico".
  const texto = normalizar(
    [item.fabricante, item.modelo, item.resolucion_division, item.documento_especificacion].join(' '),
  );
  const dice = { analog: /analog/.test(texto), digital: /digital/.test(texto) };

  const tipoDe = (t: T): 'analogico' | 'digital' | null => {
    const n = normalizar(t.Instrumento);
    if (/analog/.test(n) && !/digital/.test(n)) return 'analogico';
    if (/digital/.test(n) && !/analog/.test(n)) return 'digital';
    return null;
  };

  const buscar = (tipo: 'analogico' | 'digital') => candidatas.find((t) => tipoDe(t) === tipo);

  if (dice.analog !== dice.digital) {
    const hit = buscar(dice.analog ? 'analogico' : 'digital');
    if (hit) return { tarifa: hit };
  }

  const porDefecto = buscar('digital') ?? candidatas[0];
  return {
    tarifa: porDefecto,
    advertencia: 'no se pudo saber si es digital o analógico (fabricante/modelo/resolución no lo dicen); se asumió digital',
  };
}

/**
 * 1) nombre exacto normalizado  2) alias de la OT / prefijo  3) si hay varias filas, criterio de la familia.
 * `tarifas` debe venir ordenado por ID_TARIFA asc.
 */
function buscarTarifa<T extends { Instrumento: string }>(
  tarifas: T[],
  item: ItemParaTarifa,
): ResultadoTarifa<T> {
  const n = normalizar(item.instrumento);

  const exacta = tarifas.find((t) => normalizar(t.Instrumento) === n);
  if (exacta) return { tarifa: exacta };

  const fam = FAMILIAS_N.find((f) => f.alias.includes(n));
  const candidatas = fam
    ? tarifas.filter((t) => fam.prefijos.some((p) => normalizar(t.Instrumento).startsWith(p)))
    : tarifas.filter((t) => normalizar(t.Instrumento).startsWith(n));

  if (candidatas.length === 0) return { tarifa: null, motivo: 'No existe en la matriz de tarifas' };
  if (candidatas.length === 1) return { tarifa: candidatas[0] };

  if (fam?.criterio === 'presion') {
    return elegirPorRango(
      candidatas,
      extraerRango(item.unidad, item.intervalo_medicion, DOMINIO_PRESION),
      rangoTarifaPresion,
      'psi',
    );
  }
  if (fam?.criterio === 'masa') {
    return elegirPorRango(
      candidatas,
      extraerRango(item.unidad, item.intervalo_medicion, DOMINIO_MASA),
      rangoTarifaMasa,
      'g',
    );
  }
  if (fam?.criterio === 'digital_analogico') {
    return elegirDigitalAnalogico(candidatas, item);
  }

  // Varias coincidencias y sin criterio (texto libre del cliente).
  const motivo = `Ambiguo: coincide con ${candidatas.length} tarifas (${nombresCortos(candidatas)})`;
  return ESTRICTO_TARIFAS
    ? { tarifa: null, motivo }
    : { tarifa: candidatas[0], advertencia: `${motivo}; se asignó la primera, revisar` };
}

export async function importarOrdenTrabajoExcel(payload: ImportarOTEPayload) {
  const { s3KeyTemp, mappingConfig, id_cotizacion, idUsuario, id_job } = payload;
  const rutaArchivoLocal = path.join(os.tmpdir(), `import-ote-${Date.now()}.xlsx`);

  let codigoOTFinal = '';

  try {
    await prisma.quote.update({
      where: { id: id_job },
      data: { status: 'PROCESSING' },
    });

    const s3Response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3KeyTemp }),
    );

    if (!s3Response.Body) throw new Error('Archivo vacío en MinIO');

    await pipeline(s3Response.Body as any, fs.createWriteStream(rutaArchivoLocal));

    const workbook = new exceljs.Workbook();
    await workbook.xlsx.readFile(rutaArchivoLocal);

    // ================================================================
    // 1. EXTRAER EL EXCEL SEGÚN EL mappingConfig REAL
    // ================================================================
    const datosExtraidos = await extractByMapping(workbook, mappingConfig);

    // El mapping contiene fecha + hora separadas.
    const fechaCalibracion = getDate(datosExtraidos, 'calib_fecha');
    const horaCalibracion = combineDateAndTime(
      datosExtraidos.escalares['calib_fecha'],
      datosExtraidos.escalares['calib_hora'],
    );

    // ================================================================
    // 2. VALIDAR USUARIO QUE QUEDARÁ COMO ASIGNADO
    // ================================================================
    const usuario = await prisma.usuarios.findUnique({
      where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
      select: { ID_USUARIO_AUTO_INCREMENT: true },
    });

    if (!usuario) {
      throw new Error(`El usuario '${idUsuario}' no existe y no puede asignarse a los instrumentos.`);
    }

    let isCotizacionNueva = false;
    let idCotizacionFinal = id_cotizacion;
    let codigoCotizacionFinal = '';

    let idOtFinal = 0;

    const otsProcesadas: { id: number; codigo: string; esNueva: boolean }[] = [];
    const advertencias: string[] = [];
    const recepcionesProcesadas: { id: number; codigo: string; esNueva: boolean }[] = [];

    await prisma.$transaction(async (tx) => {
      // ==============================================================
      // 3. CLIENTE
      // ==============================================================
      const nitLimpio = getString(datosExtraidos, 'cert_nit');

      if (!nitLimpio) {
        throw new Error('El documento no contiene un NIT en la celda configurada.');
      }

      const cliente = await tx.clientes.findFirst({
        where: {
          NIT: {
            equals: nitLimpio,
            mode: 'insensitive',
          },
        },
      });

      if (!cliente) {
        throw new Error(
          `Validación fallida: El cliente con NIT '${nitLimpio}' no existe en el sistema.`,
        );
      }

      // ==============================================================
      // 4. VALIDACIÓN DE TARIFAS (reporte agregado, sin insertar nada si falla)
      // ==============================================================
      const tarifasActivas = await tx.tarifas.findMany({
        where: { ESTADO: 'ACTIVO' },
        include: {
          historial_tarifas: {
            where: { FECHA_FIN: null },
            orderBy: { FECHA_INICIO: 'desc' },
            take: 1,
          },
        },
        orderBy: { ID_TARIFA: 'asc' },
      });

      const instrumentosSinTarifa: {
        item: string | number | null | undefined;
        instrumento: string;
        motivo: string;
      }[] = [];

      for (const item of datosExtraidos.tablas) {
        const etiqueta = `Ítem ${item.item ?? '?'} (${item.instrumento})`;
        const { tarifa, advertencia, motivo } = buscarTarifa(tarifasActivas, item);

        if (!tarifa) {
          const m = motivo ?? 'No existe en la matriz de tarifas';
          if (ESTRICTO_TARIFAS) {
            instrumentosSinTarifa.push({
              item: item.item ?? null,
              instrumento: item.instrumento,
              motivo: m,
            });
          } else {
            advertencias.push(`${etiqueta}: ${m}. Se importó sin tarifa y con valor 0.`);
          }
          continue;
        }

        if (advertencia) advertencias.push(`${etiqueta}: ${advertencia}`);

        item.tarifa_id = tarifa.ID_TARIFA;
        item.instrumento_tarifa = tarifa.Instrumento;
        item.magnitud_real = tarifa.MAGNITUD;
        item.tipo_servicio_real = tarifa.TIPO_SERVICIO;
        item.tipo_servicio = item.tipo_servicio_real;

        const vigente = tarifa.historial_tarifas[0];
        if (!vigente) {
          if (ESTRICTO_TARIFAS) {
            instrumentosSinTarifa.push({
              item: item.item ?? null,
              instrumento: item.instrumento,
              motivo: 'Sin precio vigente en su historial de tarifas',
            });
          } else {
            advertencias.push(`${etiqueta}: la tarifa no tiene precio vigente. Se importó con valor 0.`);
          }
          continue;
        }

        item.valor_estimado = Number(vigente.PRECIO_U);
      }

      if (instrumentosSinTarifa.length > 0) {
        throw new Error(
          `Validación de tarifas fallida para ${instrumentosSinTarifa.length} instrumento(s): ${JSON.stringify(
            instrumentosSinTarifa,
          )}`,
        );
      }

      // ==============================================================
      // 5. COTIZACIÓN
      // ==============================================================
      const normalizarSitio = (raw?: string | null): SitioCalibracion =>
        raw && String(raw).toUpperCase().startsWith('CLI') ? 'CLIENTE' : 'LABORATORIO';

      if (!idCotizacionFinal) {
        isCotizacionNueva = true;
        codigoCotizacionFinal = await generarConsecutivo(tx, 'COT');

        // ==========================================================
        // AGRUPAR INSTRUMENTOS PARA CALCULAR CANTIDAD (incluye sitio)
        // ==========================================================
        const itemsAgrupados = new Map<string, any>();

        for (const item of datosExtraidos.tablas) {
          const sitio = normalizarSitio(item.sitio);
          item.sitio = sitio;
          // Agrupa por tarifa resuelta (filas distintas de una familia = líneas distintas);
          // los instrumentos sin tarifa se agrupan por su propio nombre.
          const clave = [item.tarifa_id ?? `sin:${normalizar(item.instrumento)}`, sitio].join('|');

          const existente = itemsAgrupados.get(clave);

          if (existente) {
            existente.cantidad += 1; // Agrupamos repeticiones
          } else {
            itemsAgrupados.set(clave, {
              instrumento: item.instrumento_tarifa ?? item.instrumento,
              tipo_servicio: item.tipo_servicio_real || 'NO ACREDITADO',
              magnitud: item.magnitud_real || 'N/A',
              sitio,
              cantidad: 1,
              valor_unitario: decimalOrZero(item.valor_estimado), // Usa el PRECIO_U obtenido
            });
          }
        }

        // ==========================================================
        // CALCULAR VALOR TOTAL DE CADA ÍTEM Y SUBTOTAL
        // ==========================================================
        let subtotalGeneral = 0;

        const detallesCotizacion = Array.from(itemsAgrupados.values()).map(
          (item) => {
            const valorUnitario = item.valor_unitario;
            const cantidad = item.cantidad;

            // Multiplicación con operadores nativos
            const valorTotal = valorUnitario * cantidad;
            subtotalGeneral += valorTotal; // Acumulamos al gran total

            return {
              EQUIPO_DESCRIPCION: item.instrumento,
              TIPO_SERVICIO: item.tipo_servicio,
              MAGNITUD: item.magnitud,
              CANTIDAD: cantidad,
              VALOR_UNITARIO: valorUnitario,
              VALOR_TOTAL: valorTotal,
              sitio: item.sitio,
            };
          },
        );

        // ==========================================================
        // CREAR COTIZACIÓN (estado BORRADOR en importación directa)
        // ==========================================================
        const nuevaCotizacion = await tx.cotizaciones.create({
          data: {
            CODIGO_COTIZACION: codigoCotizacionFinal,
            ID_CLIENTE_FK: cliente.ID_CLIENTE,
            MONTO_TOTAL: subtotalGeneral, // Insertamos la suma total calculada
            ESTADO: 'BORRADOR',
            enviar: false,
            viaticos: 0,
            descuento: 0,
            cotizacion_detalles: {
              create: detallesCotizacion,
            },
          },
        });

        idCotizacionFinal = nuevaCotizacion.ID_COTIZACION;
      } else {
        // ==============================================================
        // FLUJO 2: importación ligada a una cotización existente.
        // Reglas de negocio (bloquean antes de insertar):
        //   1. El NIT del archivo debe coincidir con el cliente de la cotización.
        //   2. Los instrumentos deben coincidir en cantidad exacta con los
        //      detalles de la cotización.
        // Esto también evita importar una OT Master "diferente" a una cotización
        // que ya tiene OTs: cualquier contenido distinto falla aquí.
        // ==============================================================
        const cotizacionExistente = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacionFinal },
          include: {
            clientes: true,
            cotizacion_detalles: { where: { activacion: true } },
          },
        });

        if (!cotizacionExistente) {
          throw new Error(`La cotización '${idCotizacionFinal}' no existe.`);
        }

        // 1. NIT del cliente.
        const nitCotizacion = (cotizacionExistente.clientes?.NIT || '').trim().toLowerCase();
        if (nitCotizacion && nitCotizacion !== nitLimpio.trim().toLowerCase()) {
          throw new Error(
            `Validación fallida: el NIT del archivo ('${nitLimpio}') no coincide con el cliente de la cotización '${cotizacionExistente.CODIGO_COTIZACION}' ('${cotizacionExistente.clientes?.NIT}').`,
          );
        }

        // 2. Instrumentos con cantidad exacta.
        const claveDetalle = (instrumento: string, tipo: string) =>
          `${familiaDe(instrumento)}|${normalizar(tipo)}`;

        const cantidadCotizada = new Map<string, number>();
        for (const d of cotizacionExistente.cotizacion_detalles) {
          const k = claveDetalle(d.EQUIPO_DESCRIPCION, d.TIPO_SERVICIO);
          cantidadCotizada.set(k, (cantidadCotizada.get(k) ?? 0) + (d.CANTIDAD || 0));
        }

        const cantidadImportada = new Map<string, number>();
        for (const item of datosExtraidos.tablas) {
          const k = claveDetalle(
            item.instrumento_tarifa ?? item.instrumento,
            item.tipo_servicio_real || item.tipo_servicio || '',
          );
          cantidadImportada.set(k, (cantidadImportada.get(k) ?? 0) + 1);
        }

        const discrepancias: {
          instrumento: string;
          tipoServicio: string;
          esperado: number;
          encontrado: number;
        }[] = [];
        const claves = new Set([...cantidadCotizada.keys(), ...cantidadImportada.keys()]);
        for (const k of claves) {
          const esperado = cantidadCotizada.get(k) ?? 0;
          const encontrado = cantidadImportada.get(k) ?? 0;
          if (esperado !== encontrado) {
            const [instrumento, tipoServicio] = k.split('|');
            discrepancias.push({ instrumento, tipoServicio, esperado, encontrado });
          }
        }

        if (discrepancias.length > 0) {
          const detalle = `los instrumentos del archivo no coinciden con la cotización '${cotizacionExistente.CODIGO_COTIZACION}'. Detalle: ${JSON.stringify(discrepancias)}`;
          if (BLOQUEAR_DISCREPANCIA_COTIZACION) {
            throw new Error(`Validación fallida: ${detalle}`);
          }
          advertencias.push(`Aviso: ${detalle}`);
        }

        codigoCotizacionFinal = cotizacionExistente.CODIGO_COTIZACION;
      }
      // ==============================================================
      // 6. DATOS DE CABECERA DE LA OT (se aplican a cada OT generada)
      // ==============================================================
      const datosOT = {
        // Área certificado / cliente
        Razon_social: cliente.RAZON_SOCIAL,
        NIT: cliente.NIT,
        dirrecion: cliente.dirrecion,
        ciudad: cliente.ciudad,
        CORREO_CERTIFICADO: getString(datosExtraidos, 'cert_email_certificados'),
        CORREO_FACTURA: getString(datosExtraidos, 'cert_email_factura'),
        FECHA_LIMITE_FACTURACION: getDate(
          datosExtraidos,
          'cert_fecha_limite_facturacion',
        ),

        // Área calibración
        ES_INTERNO_USC: getBoolean(datosExtraidos, 'calib_interno_usc', false),
        PERSONA_CONTACTO: getString(datosExtraidos, 'calib_persona_contacto'),
        TELEFONO_CONTACTO: getString(datosExtraidos, 'calib_telefono'),
        FECHA_CALIBRACION: fechaCalibracion,
        HORA_CALIBRACION: horaCalibracion,

        // Área solicitante
        razon_social_solicitante: getString(
          datosExtraidos,
          'solicitante_razon_social',
        ),
        NIT_solicitante: getString(datosExtraidos, 'solicitante_nit'),
        dirrecion_solcitante: getString(
          datosExtraidos,
          'solicitante_direccion',
        ),
        ciudad_solcitante: getString(datosExtraidos, 'solicitante_ciudad'),
        PERSONA_CONTACT_SOLCITANTE: getString(
          datosExtraidos,
          'solicitante_contacto',
        ),
        TELEFONO_CONTACTO_SOLICITANTE: getString(
          datosExtraidos,
          'solicitante_telefono',
        ),
        no_orden_trabajo: getString(datosExtraidos, 'no_orden_trabajo'),
        no_cotizacion: getString(datosExtraidos, 'no_cotizacion'),
        RESPONSABLE: getString(datosExtraidos, 'responsable'),
        FECHA_CALIBRACION_DILIGENCIAMENTO: getDate(
          datosExtraidos,
          'fecha_diligenciamiento',
        ),
        REQUIERE_ANEXO: getBoolean(
          datosExtraidos,
          'requiere_anexo_instrumentos',
          false,
        ),

        OBSERVACIONES: getString(datosExtraidos, 'observaciones'),
      };

      // ==============================================================
      // 6. RESOLVER SITIO POR FILA + SPLIT ENGINE
      // ==============================================================
      const detallesCotizacion = await tx.cotizacion_detalles.findMany({
        where: {
          ID_COTIZACION_FK: idCotizacionFinal,
          activacion: true,
        },
      });

      const sitioPorClave = new Map<string, SitioCalibracion>();
      for (const d of detallesCotizacion) {
        const inst = familiaDe(d.EQUIPO_DESCRIPCION);
        const tipo = normalizar(d.TIPO_SERVICIO);
        const sitio = d.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
        if (tipo && !sitioPorClave.has(`${inst}|${tipo}`)) {
          sitioPorClave.set(`${inst}|${tipo}`, sitio);
        }
        if (!sitioPorClave.has(inst)) {
          sitioPorClave.set(inst, sitio);
        }
      }

      const resolverSitio = (item: ExtractedInstrument): SitioCalibracion => {
        if (item.sitio) return normalizarSitio(item.sitio);
        const inst = familiaDe(item.instrumento_tarifa ?? item.instrumento);
        const tipo = normalizar(item.tipo_servicio_real || item.tipo_servicio || '');
        if (tipo) {
          const s = sitioPorClave.get(`${inst}|${tipo}`);
          if (s) return s;
        }
        return sitioPorClave.get(inst) ?? 'LABORATORIO';
      };

      const instrumentosResueltos: InstrumentoResuelto[] = datosExtraidos.tablas.map((item) => ({
        item: item.item != null ? Number(item.item) : null,
        tipo_servicio: item.tipo_servicio_real || item.tipo_servicio || 'Calibración',
        instrumento: item.instrumento,
        fabricante: item.fabricante,
        modelo: item.modelo,
        serie: item.serie,
        codigo_interno: item.codigo_interno,
        ubicacion: item.ubicacion,
        puntos_calibracion: item.puntos_calibracion,
        unidad: item.unidad,
        intervalo_medicion: item.intervalo_medicion,
        resolucion_division: item.resolucion_division,
        declaracion_conformidad: item.declaracion_conformidad,
        emp_ajuste_control: item.emp_ajuste_control,
        emp_limite_control: item.emp_limite_control,
        documento_especificacion: item.documento_especificacion,
        regla_decision: item.regla_decision,
        asignado: idUsuario,
        sitio: resolverSitio(item),
      }));

      const esHeterogenea = new Set(instrumentosResueltos.map((i) => i.sitio)).size > 1;

      // Flujo 2 heterogéneo: localizar la OT Master (SITIO_CALIBRACION = null).
      let idOtMaster: number | null = null;
      let codigoOtMaster: string | null = null;
      if (id_cotizacion != null && esHeterogenea) {
        const master = await tx.ordenes_trabajo.findFirst({
          where: { ID_COTIZACION_FK: idCotizacionFinal, SITIO_CALIBRACION: null },
        });
        if (master) {
          idOtMaster = master.ID_ORDEN_TRABAJO;
          codigoOtMaster = master.CODIGO_OT;
        }
      }

      const solicitante =
        getString(datosExtraidos, 'solicitante_razon_social') || cliente.RAZON_SOCIAL;

      const resultado = await splitHeterogeneousOT(tx, instrumentosResueltos, {
        idCotizacion: idCotizacionFinal,
        idCliente: cliente.ID_CLIENTE,
        idUsuario,
        idOtMaster,
        datosOT,
        solicitante,
      });

      for (const o of resultado.ots) {
        otsProcesadas.push({ id: o.id, codigo: o.codigo, esNueva: o.esNueva });
      }
      for (const r of resultado.recepciones) {
        recepcionesProcesadas.push({ id: r.id, codigo: r.codigo, esNueva: r.esNueva });
      }

      // ==============================================================
      // 7. HISTORIAL DE CAMBIOS (solo en división heterogénea de Flujo 2)
      // ==============================================================
      if (esHeterogenea && idOtMaster != null) {
        const ultimaVersion = await tx.historial_cambios.findFirst({
          where: { id_cotizacion: idCotizacionFinal },
          orderBy: { created_at: 'desc' },
        });

        let siguienteNum = 1;
        if (ultimaVersion && ultimaVersion.numero_version) {
          const match = ultimaVersion.numero_version.match(/V(\d+)/);
          if (match) siguienteNum = parseInt(match[1], 10) + 1;
        }

        await tx.historial_cambios.create({
          data: {
            id: crypto.randomUUID(),
            numero_version: `V${siguienteNum}`,
            fecha_cambio: new Date(),
            descripcion:
              'División de Orden de Trabajo por sitio de calibración (importación de OT).',
            observaciones: null,
            aprobo: 'Sistema',
            id_cotizacion: idCotizacionFinal,
            updated_at: new Date(),
          },
        });
      }

      // Para el documento definitivo: la Master si existe; si no, la primera OT operativa.
      if (idOtMaster != null && codigoOtMaster) {
        idOtFinal = idOtMaster;
        codigoOTFinal = codigoOtMaster;
      } else if (resultado.ots[0]) {
        idOtFinal = resultado.ots[0].id;
        codigoOTFinal = resultado.ots[0].codigo;
      }
    });

    // ================================================================
    // 9. GUARDAR EXCEL DEFINITIVO EN S3
    // ================================================================
    const s3KeyDefinitiva = `importaciones_ote/${codigoOTFinal}.xlsx`;

    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BUCKET_NAME,
        CopySource: `${BUCKET_NAME}/${s3KeyTemp}`,
        Key: s3KeyDefinitiva,
      }),
    );

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3KeyTemp,
      }),
    );

    // ================================================================
    // 10. HISTORIAL DEL DOCUMENTO
    // ================================================================
    let documentoId: number;
    let nuevaVersionNum = 1;

    const docExistente = await prisma.documentos.findFirst({
      where: {
        ID_ORDEN_TRABAJO_FK: idOtFinal,
      },
    });

    if (docExistente) {
      documentoId = docExistente.ID_DOCUMENTO;

      const ultimaVersion = await prisma.version_documentos.findFirst({
        where: {
          ID_DOCUMENTO_FK: documentoId,
        },
        orderBy: {
          VERSION: 'desc',
        },
      });

      nuevaVersionNum = ultimaVersion ? ultimaVersion.VERSION + 1 : 1;

      await prisma.documentos.update({
        where: {
          ID_DOCUMENTO: documentoId,
        },
        data: {
          RUTA_URL: s3KeyDefinitiva,
        },
      });
    } else {
      const nuevoDoc = await prisma.documentos.create({
        data: {
          NOMBRE: codigoOTFinal,
          RUTA_URL: s3KeyDefinitiva,
          PROVEEDOR: 'AWS_S3',
          MIME_TYPE:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ID_ORDEN_TRABAJO_FK: idOtFinal,
        },
      });

      documentoId = nuevoDoc.ID_DOCUMENTO;
    }

    await prisma.version_documentos.create({
      data: {
        ID_DOCUMENTO_FK: documentoId,
        VERSION: nuevaVersionNum,
        RUTA_URL: s3KeyDefinitiva,
        usuario_fk: idUsuario,
        content_json: {
          excel: s3KeyDefinitiva,
          mappingVersion: mappingConfig?.version ?? null,
          templateId: mappingConfig?.templateId ?? null,
          templateType: mappingConfig?.templateType ?? null,
          tablasImportadas: datosExtraidos.tablas.length,
        },
      },
    });

    await prisma.quote.update({
      where: {
        id: id_job,
      },
      data: {
        status: 'COMPLETED',
        fileUrl: s3KeyDefinitiva,
        data: { advertencias },
      },
    });

    return {
      success: true,
      fileUrl: s3KeyDefinitiva,
      idUsuario,
      advertencias,
      triggers: [
        isCotizacionNueva
          ? {
              tipo: 1,
              id_registro: idCotizacionFinal,
              codigo_actual: codigoCotizacionFinal,
              action: 'cot_create',
            }
          : null,
        ...otsProcesadas.map((o) => ({
          tipo: 2,
          id_registro: o.id,
          codigo_actual: o.codigo,
          action: 'ot_update',
        })),
        ...recepcionesProcesadas.map((r) => ({
          tipo: 3,
          id_registro: r.id,
          codigo_actual: r.codigo,
          action: r.esNueva ? 'rec_create' : 'rec_update',
        })),
      ].filter(Boolean),
    };
  } catch (error: any) {
    console.error('Error importando OTE:', error);

    await s3Client
      .send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3KeyTemp,
        }),
      )
      .catch(() => {});

    await prisma.quote.update({
      where: {
        id: id_job,
      },
      data: {
        status: 'FAILED',
        data: {
          error: error?.message || String(error),
        },
      },
    });

    throw error;
  } finally {
    await fs.promises.rm(rutaArchivoLocal, { force: true }).catch(() => {});
  }
}

// ============================================================================
// WORKER BULLMQ
// ============================================================================

export const worker_import = new Worker<ImportarOTEPayload>(
  IMPORTAR_QUEUE,
  async (job: Job<ImportarOTEPayload>) => {
    return await importarOrdenTrabajoExcel(job.data);
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

worker_import.on('completed', async (job, returnValue: any) => {
  console.log(`✅ [import-worker] Job ${job.id} completado con éxito.`);

  if (returnValue?.success && returnValue?.triggers) {
    const excelQueue = getGenerationExcelQueue();

    for (const trigger of returnValue.triggers) {
      console.log(
        `➡️ [import-worker] Encolando Excel | Tipo: ${trigger.tipo} | Acción: ${trigger.action}`,
      );

      await excelQueue.add('procesar_excel_importado', {
        tipo: trigger.tipo,
        id_registro: trigger.id_registro,
        codigo_actual: trigger.codigo_actual,
        action: trigger.action,
        tipo_entry: 'prod',
        id_usuario: returnValue.idUsuario,
        id_job: job.id,
      });
    }
  }
});

worker_import.on('failed', (job, err) => {
  console.error(
    `❌ [import-worker] Job ${job?.id} falló: ${err.message}`,
  );
});

worker_import.on('error', (err) => {
  console.error('🚨 [import-worker] Error crítico en Redis:', err);
});