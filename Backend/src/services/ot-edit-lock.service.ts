import { EstadoOT, Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

type Tx = Prisma.TransactionClient;

const estadosConCalibracionIniciada = new Set<EstadoOT>([
  EstadoOT.En_calibración,
  EstadoOT.Certificado_en_revisión,
  EstadoOT.Certificado_aprobado,
  EstadoOT.Certificado_enviado,
]);

/**
 * Regla compartida para impedir cambios comerciales o técnicos después de
 * iniciar calibraciones, incluso si el estado visible de la OT quedó atrasado.
 */
export async function validarOTEditableAntesDeCalibrar(
  tx: Tx,
  idOT: number,
  recurso: 'cotización' | 'instrumentos de recepción',
): Promise<void> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    select: { CODIGO_OT: true, estado: true },
  });
  if (!ot) return;

  const estado = (ot.estado ?? EstadoOT.Creada) as EstadoOT;
  const recepciones = await tx.recepciones_equipo.findMany({
    where: { ID_ORDEN_TRABAJO_FK: idOT },
    select: { ID_RECEPCION: true },
  });
  const idsRecepcion = recepciones.map((r) => r.ID_RECEPCION);
  const calibracionIniciada = idsRecepcion.length > 0
    ? Boolean(await tx.calibraciones.findFirst({
        where: { recepcion_equipo_detalles: { ID_RECEPCION_FK: { in: idsRecepcion } } },
        select: { ID_CALIBRACION: true },
      }))
    : false;

  if (estadosConCalibracionIniciada.has(estado) || calibracionIniciada) {
    throw new AppError(
      409,
      `No se puede modificar ${recurso} de la OT ${ot.CODIGO_OT}: la calibración ya inició. Registre una corrección formal sin alterar la trazabilidad existente.`,
    );
  }
}

/**
 * Una vez iniciada la calibración permite completar la salida física, pero
 * conserva inmutable la identidad y los datos técnicos de cada instrumento.
 */
export async function validarIdentidadInstrumentosRecepcion(
  tx: Tx,
  idOT: number,
  existentes: Array<{
    ID_INSTRUMENTO: number;
    INSTRUMENTO: string;
    MARCA: string | null;
    MODELO: string | null;
    SERIE: string | null;
    CODIGO_INVENTARIO: string | null;
    RESOLUCION: string | null;
    TIPO_SENSOR_TEMP_init: boolean | null;
    TIPO_SENSOR_TEMP_ext: boolean | null;
    ESTADO_IBC: Prisma.JsonValue | null;
    ESTAMPILLA: string | null;
  }>,
  recibidos: Array<{
    idInstrumento?: number;
    instrumento: string;
    marca?: string | null;
    modelo?: string | null;
    serie?: string | null;
    codigoInventario?: string | null;
    resolucion?: string | null;
    sensorInt?: boolean;
    sensorExt?: boolean;
    estadoIBC?: unknown;
    estampilla?: string | null;
  }>,
): Promise<void> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    select: { CODIGO_OT: true, estado: true },
  });
  if (!ot) return;

  const estado = (ot.estado ?? EstadoOT.Creada) as EstadoOT;
  const idsRecepcion = (await tx.recepciones_equipo.findMany({
    where: { ID_ORDEN_TRABAJO_FK: idOT },
    select: { ID_RECEPCION: true },
  })).map((r) => r.ID_RECEPCION);
  const calibracionIniciada = idsRecepcion.length > 0
    ? Boolean(await tx.calibraciones.findFirst({
        where: { recepcion_equipo_detalles: { ID_RECEPCION_FK: { in: idsRecepcion } } },
        select: { ID_CALIBRACION: true },
      }))
    : false;
  if (!estadosConCalibracionIniciada.has(estado) && !calibracionIniciada) return;

  const activos = existentes.filter((d) => d.ID_INSTRUMENTO > 0);
  const recibidosConId = recibidos.filter((d) => d.idInstrumento != null);
  const mismoConjunto = activos.length === recibidos.length &&
    recibidosConId.length === activos.length &&
    activos.every((d) => recibidosConId.some((r) => r.idInstrumento === d.ID_INSTRUMENTO));
  if (!mismoConjunto) {
    throw new AppError(
      409,
      `No se pueden agregar ni quitar instrumentos de la OT ${ot.CODIGO_OT}: la calibración ya inició.`,
    );
  }

  const normalizarTexto = (v: unknown) => String(v ?? '').trim();
  const estadoIbcEntrada = (v: unknown) => JSON.stringify(
    Object.fromEntries(Object.entries(((v as any)?.entrada ?? {}) as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))),
  );
  for (const actual of activos) {
    const recibido = recibidosConId.find((r) => r.idInstrumento === actual.ID_INSTRUMENTO)!;
    const cambioTecnico =
      normalizarTexto(recibido.instrumento) !== normalizarTexto(actual.INSTRUMENTO) ||
      normalizarTexto(recibido.marca) !== normalizarTexto(actual.MARCA) ||
      normalizarTexto(recibido.modelo) !== normalizarTexto(actual.MODELO) ||
      normalizarTexto(recibido.serie) !== normalizarTexto(actual.SERIE) ||
      normalizarTexto(recibido.codigoInventario) !== normalizarTexto(actual.CODIGO_INVENTARIO) ||
      normalizarTexto(recibido.resolucion) !== normalizarTexto(actual.RESOLUCION) ||
      Boolean(recibido.sensorInt) !== Boolean(actual.TIPO_SENSOR_TEMP_init) ||
      Boolean(recibido.sensorExt) !== Boolean(actual.TIPO_SENSOR_TEMP_ext) ||
      estadoIbcEntrada(recibido.estadoIBC) !== estadoIbcEntrada(actual.ESTADO_IBC) ||
      normalizarTexto(recibido.estampilla) !== normalizarTexto(actual.ESTAMPILLA);
    if (cambioTecnico) {
      throw new AppError(
        409,
        `No se pueden cambiar los datos técnicos de instrumentos de la OT ${ot.CODIGO_OT} después de iniciar la calibración.`,
      );
    }
  }
}
