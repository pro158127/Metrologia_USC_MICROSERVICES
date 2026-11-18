import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

type Tx = Prisma.TransactionClient;

/** Lock only units that already have a certificate record, regardless of review state. */
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
  const certificados = ids.length ? await tx.calibraciones.findMany({
    where: { ID_INSTRUMENTO_FK: { in: ids }, certificados: { isNot: null } },
    select: { ID_INSTRUMENTO_FK: true },
  }) : [];
  const idsProtegidos = new Set(certificados.map((certificado) => certificado.ID_INSTRUMENTO_FK));
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
    const cambio = normalizar(recibido.instrumento) !== normalizar(actual.INSTRUMENTO) ||
      normalizar(recibido.marca) !== normalizar(actual.MARCA) ||
      normalizar(recibido.modelo) !== normalizar(actual.MODELO) ||
      normalizar(recibido.serie) !== normalizar(actual.SERIE) ||
      normalizar(recibido.codigoInventario) !== normalizar(actual.CODIGO_INVENTARIO) ||
      normalizar(recibido.resolucion) !== normalizar(actual.RESOLUCION) ||
      Boolean(recibido.sensorInt) !== Boolean(actual.TIPO_SENSOR_TEMP_init) ||
      Boolean(recibido.sensorExt) !== Boolean(actual.TIPO_SENSOR_TEMP_ext) ||
      estable(recibido.estadoIBC ?? {}) !== estable(actual.ESTADO_IBC ?? {}) ||
      normalizar(recibido.estampilla) !== normalizar(actual.ESTAMPILLA) ||
      normalizar(recibido.observaciones) !== normalizar(actual.OBSERVACIONES);
    if (cambio) {
      throw new AppError(409, `No se pueden cambiar las características de "${actual.INSTRUMENTO}": ya tiene un certificado creado.`);
    }
  }
}

export async function validarInstrumentoSinCertificado(tx: Tx, idInstrumento: number): Promise<void> {
  const certificado = await tx.certificados.findFirst({
    where: { calibraciones: { ID_INSTRUMENTO_FK: idInstrumento } },
    select: { CODIGO_CERTIFICADO: true },
  });
  if (certificado) throw new AppError(409, 'No se puede eliminar este instrumento porque ya tiene un certificado creado.');
}
