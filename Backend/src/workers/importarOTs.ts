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

    let isOtNueva = false;
    let idOtFinal = 0;

    let isRecepcionNueva = false;
    let codigoRecepcionFinal = '';
    let idRecepcionFinal = 0;

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

      for (const item of datosExtraidos.tablas) {
        const tarifa = await tx.tarifas.findFirst({
          where: {
            Instrumento: {
              equals: item.instrumento,
              mode: 'insensitive',
            },
            ESTADO: 'ACTIVO',
          },
          // 🟢 CORRECCIÓN: Hacemos el JOIN con historial_tarifas
          include: {
            historial_tarifas: {
              where: { FECHA_FIN: null }, // Buscamos la tarifa que no ha expirado
              orderBy: { FECHA_INICIO: 'desc' }, // Aseguramos traer la más reciente
              take: 1, // Solo necesitamos el precio actual
            }
          },
          orderBy: {
            ID_TARIFA: 'asc',
          },
        });

        if (!tarifa) {
          throw new Error(
            `Validación fallida: El instrumento '${item.instrumento}' no existe en la matriz de tarifas.`,
          );
        }

        // 🟢 VALIDACIÓN: Evitamos fallo si existe la tarifa pero nunca se le asignó precio
        if (tarifa.historial_tarifas.length === 0) {
           throw new Error(
            `Validación fallida: El instrumento '${item.instrumento}' no tiene un precio vigente en su historial de tarifas.`,
          );
        }

        item.tarifa_id = tarifa.ID_TARIFA;
        item.magnitud_real = tarifa.MAGNITUD;
        item.tipo_servicio_real = tarifa.TIPO_SERVICIO;
        
        // 🟢 Extraemos el PRECIO_U y lo guardamos (forzado a número para cálculos)
        item.valor_estimado = Number(tarifa.historial_tarifas[0].PRECIO_U);
        item.tipo_servicio = item.tipo_servicio_real;
      }

      // ==============================================================
      // 5. COTIZACIÓN
      // ==============================================================
      if (!idCotizacionFinal) {
        isCotizacionNueva = true;
        codigoCotizacionFinal = await generarConsecutivo(tx, 'COT');

        // ==========================================================
        // AGRUPAR INSTRUMENTOS PARA CALCULAR CANTIDAD
        // ==========================================================
        const itemsAgrupados = new Map<string, any>();

        for (const item of datosExtraidos.tablas) {
          const clave = [
            item.instrumento?.trim().toLowerCase(),
            item.tipo_servicio_real?.trim().toLowerCase(),
            item.magnitud_real?.trim().toLowerCase(),
          ].join('|');

          const existente = itemsAgrupados.get(clave);

          if (existente) {
            existente.cantidad += 1; // Agrupamos repeticiones
          } else {
            itemsAgrupados.set(clave, {
              instrumento: item.instrumento,
              tipo_servicio: item.tipo_servicio_real || 'NO ACREDITADO',
              magnitud: item.magnitud_real || 'N/A',
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
            
            // 🟢 Multiplicación con operadores nativos
            const valorTotal = valorUnitario * cantidad;
            subtotalGeneral += valorTotal; // Acumulamos al gran total

            return {
              EQUIPO_DESCRIPCION: item.instrumento,
              TIPO_SERVICIO: item.tipo_servicio,
              MAGNITUD: item.magnitud,
              CANTIDAD: cantidad,
              VALOR_UNITARIO: valorUnitario,
              VALOR_TOTAL: valorTotal,
            };
          },
        );

        // ==========================================================
        // CREAR COTIZACIÓN
        // ==========================================================
        const nuevaCotizacion = await tx.cotizaciones.create({
          data: {
            CODIGO_COTIZACION: codigoCotizacionFinal,
            ID_CLIENTE_FK: cliente.ID_CLIENTE,
            MONTO_TOTAL: subtotalGeneral, // 🟢 Insertamos la suma total calculada
            ESTADO: 'APROBADA',
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
        const cotizacionExistente = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacionFinal },
          select: { ID_COTIZACION: true, CODIGO_COTIZACION: true },
        });

        if (!cotizacionExistente) {
          throw new Error(`La cotización '${idCotizacionFinal}' no existe.`);
        }
        codigoCotizacionFinal = cotizacionExistente.CODIGO_COTIZACION;
      }
      // ==============================================================
      // 6. ORDEN DE TRABAJO
      // ==============================================================
      const oteExistente = await tx.ordenes_trabajo.findFirst({
        where: { ID_COTIZACION_FK: idCotizacionFinal },
      });

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
        ES_EN_SITIO: getBoolean(datosExtraidos, 'calib_en_sitio', false),
        ES_LAB_PERMANENTE: getBoolean(
          datosExtraidos,
          'calib_laboratorio_permanente',
          true,
        ),
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

      let oteProcesada;

      if (oteExistente) {
        isOtNueva = false;
        codigoOTFinal = oteExistente.CODIGO_OT;

        oteProcesada = await tx.ordenes_trabajo.update({
          where: {
            ID_ORDEN_TRABAJO: oteExistente.ID_ORDEN_TRABAJO,
          },
          data: datosOT,
        });
      } else {
        isOtNueva = true;
        codigoOTFinal = await generarConsecutivo(tx, 'OT');

        oteProcesada = await tx.ordenes_trabajo.create({
          data: {
            CODIGO_OT: codigoOTFinal,
            ID_COTIZACION_FK: idCotizacionFinal,
            ID_CLIENTE_FK: cliente.ID_CLIENTE,
            estado: 'Creada',
            ESTADO_REVISION: 'PENDIENTE_REVISION',
            ...datosOT,
          },
        });
      }

      idOtFinal = oteProcesada.ID_ORDEN_TRABAJO;

      // ==============================================================
      // 7. DETALLES DE INSTRUMENTOS DE LA OT
      // ==============================================================
      await tx.orden_trabajo_detalles.deleteMany({
        where: {
          ID_ORDEN_TRABAJO_FK: idOtFinal,
        },
      });

      await tx.orden_trabajo_detalles.createMany({
        data: datosExtraidos.tablas.map((item, index) => ({
          ID_ORDEN_TRABAJO_FK: idOtFinal,
          ITEM: index + 1,
          INSTRUMENTO: item.instrumento,
          TIPO_SERVICIO: item.tipo_servicio_real || item.tipo_servicio || 'Calibración',
          FABRICANTE: item.fabricante || null,
          MODELO: item.modelo || null,
          SERIE: item.serie || null,
          CODIGO_INVENTARIO: item.codigo_interno || null,
          UBICACION: item.ubicacion || null,
          PUNTOS_CALIBRAR: item.puntos_calibracion || [],
          UNIDAD: item.unidad || null,
          INTERVALO_RANGO: item.intervalo_medicion || null,
          RESOLUCION: item.resolucion_division || null,
          asignado: idUsuario,
          DECLARACION_CONFORMIDAD: item.declaracion_conformidad ?? false,
          LIMITE_CONTROL_EMC:
            item.emp_ajuste_control || item.emp_limite_control || null,
          DOC_ESPECIFICACION: item.documento_especificacion || null,
          REGLA_DECISION: item.regla_decision || null,
          activacion: true,
        })),
      });

      // ==============================================================
      // 8. RECEPCIÓN
      // ==============================================================
      const recepcionExistente = await tx.recepciones_equipo.findFirst({
        where: {
          ID_ORDEN_TRABAJO_FK: idOtFinal,
        },
      });

      if (recepcionExistente) {
        isRecepcionNueva = false;
        codigoRecepcionFinal = recepcionExistente.CODIGO_RECEPCION;

        const sitioCalibracion = getBoolean(
          datosExtraidos,
          'calib_en_sitio',
          false,
        )
          ? 'CLIENTE'
          : 'LABORATORIO';

        await tx.recepciones_equipo.update({
          where: {
            ID_RECEPCION: recepcionExistente.ID_RECEPCION,
          },
          data: {
            SOLICITANTE: getString(datosExtraidos, 'solicitante_razon_social') || cliente.RAZON_SOCIAL,
            SITIO_CALIBRACION: sitioCalibracion,
            ESTADO: 'BORRADOR',
          },
        });
      } else {
        isRecepcionNueva = true;
        codigoRecepcionFinal = await generarConsecutivo(tx, 'REC');

        const sitioCalibracion = getBoolean(
          datosExtraidos,
          'calib_en_sitio',
          false,
        )
          ? 'CLIENTE'
          : 'LABORATORIO';

        const recepcionProcesada = await tx.recepciones_equipo.create({
          data: {
            CODIGO_RECEPCION: codigoRecepcionFinal,
            ID_COTIZACION_FK: idCotizacionFinal,
            ID_ORDEN_TRABAJO_FK: idOtFinal,
            ESTADO: 'BORRADOR',
            SOLICITANTE:
              getString(datosExtraidos, 'solicitante_razon_social') || cliente.RAZON_SOCIAL,
            SITIO_CALIBRACION: sitioCalibracion,
          },
        });

        idRecepcionFinal = recepcionProcesada.ID_RECEPCION;
      }

      if (!idRecepcionFinal) {
        const recepcion = await tx.recepciones_equipo.findUnique({
          where: {
            CODIGO_RECEPCION: codigoRecepcionFinal,
          },
          select: {
            ID_RECEPCION: true,
          },
        });

        if (!recepcion) {
          throw new Error(`No fue posible recuperar la recepción '${codigoRecepcionFinal}'.`);
        }

        idRecepcionFinal = recepcion.ID_RECEPCION;
      }

      await tx.recepcion_equipo_detalles.deleteMany({
        where: {
          ID_RECEPCION_FK: idRecepcionFinal,
        },
      });

      await tx.recepcion_equipo_detalles.createMany({
        data: datosExtraidos.tablas.map((item) => ({
          ID_RECEPCION_FK: idRecepcionFinal,
          INSTRUMENTO: item.instrumento,
          MARCA: item.fabricante || null,
          MODELO: item.modelo || null,
          SERIE: item.serie || null,
          CODIGO_INVENTARIO: item.codigo_interno || null,
          ESTAMPILLA: `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          activacion: true,
        })),
      });
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
              action: 'cot_aprove',
            }
          : null,
        {
          tipo: 2,
          id_registro: idOtFinal,
          codigo_actual: codigoOTFinal,
          action: 'ot_update',
        },
        {
          tipo: 3,
          id_registro: idRecepcionFinal,
          codigo_actual: codigoRecepcionFinal,
          action: isRecepcionNueva ? 'rec_create' : 'rec_update',
        },
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