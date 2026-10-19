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
      const instrumentosSinTarifa: {
        item: string | number | null | undefined;
        instrumento: string;
        motivo: string;
      }[] = [];

      for (const item of datosExtraidos.tablas) {
        const tarifa = await tx.tarifas.findFirst({
          where: {
            Instrumento: {
              equals: item.instrumento,
              mode: 'insensitive',
            },
            ESTADO: 'ACTIVO',
          },
          // Hacemos el JOIN con historial_tarifas para obtener el precio vigente.
          include: {
            historial_tarifas: {
              where: { FECHA_FIN: null },
              orderBy: { FECHA_INICIO: 'desc' },
              take: 1,
            }
          },
          orderBy: {
            ID_TARIFA: 'asc',
          },
        });

        if (!tarifa) {
          instrumentosSinTarifa.push({
            item: item.item ?? null,
            instrumento: item.instrumento,
            motivo: 'No existe en la matriz de tarifas',
          });
          continue;
        }

        if (tarifa.historial_tarifas.length === 0) {
          instrumentosSinTarifa.push({
            item: item.item ?? null,
            instrumento: item.instrumento,
            motivo: 'Sin precio vigente en su historial de tarifas',
          });
          continue;
        }

        item.tarifa_id = tarifa.ID_TARIFA;
        item.magnitud_real = tarifa.MAGNITUD;
        item.tipo_servicio_real = tarifa.TIPO_SERVICIO;
        item.valor_estimado = Number(tarifa.historial_tarifas[0].PRECIO_U);
        item.tipo_servicio = item.tipo_servicio_real;
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
          const clave = [
            item.instrumento?.trim().toLowerCase(),
            item.tipo_servicio_real?.trim().toLowerCase(),
            item.magnitud_real?.trim().toLowerCase(),
            sitio,
          ].join('|');

          const existente = itemsAgrupados.get(clave);

          if (existente) {
            existente.cantidad += 1; // Agrupamos repeticiones
          } else {
            itemsAgrupados.set(clave, {
              instrumento: item.instrumento,
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
          `${instrumento.trim().toLowerCase()}|${(tipo || '').trim().toLowerCase()}`;

        const cantidadCotizada = new Map<string, number>();
        for (const d of cotizacionExistente.cotizacion_detalles) {
          const k = claveDetalle(d.EQUIPO_DESCRIPCION, d.TIPO_SERVICIO);
          cantidadCotizada.set(k, (cantidadCotizada.get(k) ?? 0) + (d.CANTIDAD || 0));
        }

        const cantidadImportada = new Map<string, number>();
        for (const item of datosExtraidos.tablas) {
          const k = claveDetalle(
            item.instrumento,
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
          throw new Error(
            `Validación fallida: los instrumentos del archivo no coinciden con la cotización '${cotizacionExistente.CODIGO_COTIZACION}'. Detalle: ${JSON.stringify(discrepancias)}`,
          );
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
        const inst = d.EQUIPO_DESCRIPCION.trim().toLowerCase();
        const tipo = (d.TIPO_SERVICIO || '').trim().toLowerCase();
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
        const inst = item.instrumento.trim().toLowerCase();
        const tipo = (item.tipo_servicio_real || item.tipo_servicio || '').trim().toLowerCase();
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
      },
    });

    return {
      success: true,
      fileUrl: s3KeyDefinitiva,
      idUsuario,
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