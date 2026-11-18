import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

type Tx = Prisma.TransactionClient;

/** After calibration starts, protect only the instrument identity, stamp and IBC entry. */
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
    OBSERVACIONES: string | null;
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
    observaciones?: string | null;
  }>,
): Promise<void> {
  const ot = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    select: { CODIGO_OT: true },
  });
  if (!ot) return;

  const ids = existentes.map((item) => item.ID_INSTRUMENTO);
  const calibraciones = ids.length ? await tx.calibraciones.findMany({
    where: { ID_INSTRUMENTO_FK: { in: ids } },
    select: { ID_INSTRUMENTO_FK: true },
  }) : [];
  const idsProtegidos = new Set(calibraciones.map((calibracion) => calibracion.ID_INSTRUMENTO_FK));
  const recibidosConId = recibidos.filter((item) => item.idInstrumento != null);
  const normalizar = (valor: unknown) => String(valor ?? '').trim();
  const estable = (valor: unknown): string => {
    if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
    if (valor && typeof valor === 'object') {
      const entradas = Object.entries(valor as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
      return `{${entradas.map(([clave, contenido]) => `${JSON.stringify(clave)}:${estable(contenido)}`).join(',')}}`;
    }
    return JSON.stringify(valor);
  };

  for (const actual of existentes.filter((item) => idsProtegidos.has(item.ID_INSTRUMENTO))) {
    const recibido = recibidosConId.find((item) => item.idInstrumento === actual.ID_INSTRUMENTO);
    if (!recibido) {
      throw new AppError(409, `No se puede eliminar el instrumento "${actual.INSTRUMENTO}": ya tiene un certificado creado.`);
    }
    const entradaIBC = (valor: unknown): unknown => {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return valor ?? {};
      const objeto = valor as Record<string, unknown>;
      return objeto.entrada ?? objeto;
    };
    const estadoIbcActual = actual.ESTADO_IBC as unknown;
    const cambio = normalizar(recibido.instrumento) !== normalizar(actual.INSTRUMENTO) ||
      estable(entradaIBC(recibido.estadoIBC)) !== estable(entradaIBC(estadoIbcActual)) ||
      normalizar(recibido.estampilla) !== normalizar(actual.ESTAMPILLA);
    if (cambio) {
      throw new AppError(409, `No se puede cambiar el instrumento, la estampilla ni el IBC de entrada de "${actual.INSTRUMENTO}": la calibración ya inició.`);
    }
  }
}

export async function validarInstrumentoSinCertificado(tx: Tx, idInstrumento: number): Promise<void> {
  const calibracion = await tx.calibraciones.findUnique({
    where: { ID_INSTRUMENTO_FK: idInstrumento },
    select: { ID_INSTRUMENTO_FK: true },
  });
  if (calibracion) throw new AppError(409, 'No se puede eliminar este instrumento porque su calibración ya inició.');
}
