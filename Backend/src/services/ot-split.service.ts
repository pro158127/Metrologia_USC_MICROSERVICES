// services/ot-split.service.ts
// Split Engine: distribuye los instrumentos de una OT por `sitio_calibracion`
// generando/actualizando una OT (y su recepción) por cada sitio detectado.
// Se usa en:
//   - Flujo 2 (importación de OT con cotización previa, heterogénea): divide la OT Master.
//   - Flujo 3 (importación directa, heterogénea): genera las OTs operativas directamente.
// Si solo hay un sitio (homogénea), produce una única OT, reutilizando la existente si aplica.
import { Prisma } from '@prisma/client';
import { generarConsecutivo } from './consecutivo.service.js';

export type SitioCalibracion = 'LABORATORIO' | 'CLIENTE';

export interface InstrumentoResuelto {
  item?: number | null;
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
  asignado?: number | null;
  sitio: SitioCalibracion;
}

export interface SplitHeterogeneousOptions {
  idCotizacion: number;
  idCliente: number | null;
  idUsuario: number;
  idOtMaster?: number | null;
  datosOT: Record<string, unknown>;
  solicitante: string;
}

export interface OTPorSitio {
  id: number;
  codigo: string;
  esNueva: boolean;
  sitio: SitioCalibracion;
}

export interface RecepcionPorSitio {
  id: number;
  codigo: string;
  esNueva: boolean;
  sitio: SitioCalibracion;
}

export interface SplitResult {
  ots: OTPorSitio[];
  recepciones: RecepcionPorSitio[];
}

function agruparPorSitio(
  instrumentos: InstrumentoResuelto[],
): Map<SitioCalibracion, InstrumentoResuelto[]> {
  const mapa = new Map<SitioCalibracion, InstrumentoResuelto[]>();
  for (const inst of instrumentos) {
    const sitio: SitioCalibracion = inst.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
    const lista = mapa.get(sitio) ?? [];
    lista.push({ ...inst, sitio });
    mapa.set(sitio, lista);
  }
  return mapa;
}

/**
 * Ejecuta la transacción de división por sitio. Debe llamarse dentro de un
 * `prisma.$transaction` para garantizar integridad (rollback total si falla).
 */
export async function splitHeterogeneousOT(
  tx: Prisma.TransactionClient,
  instrumentos: InstrumentoResuelto[],
  options: SplitHeterogeneousOptions,
): Promise<SplitResult> {
  const ots: OTPorSitio[] = [];
  const recepciones: RecepcionPorSitio[] = [];

  const porSitio = agruparPorSitio(instrumentos);

  for (const [sitio, instrumentosSitio] of porSitio.entries()) {
    const esSitio = sitio === 'CLIENTE';

    const otExistente = await tx.ordenes_trabajo.findFirst({
      where: {
        ID_COTIZACION_FK: options.idCotizacion,
        SITIO_CALIBRACION: sitio,
        ...(options.idOtMaster != null
          ? { ID_OT_PADRE_FK: options.idOtMaster }
          : { ID_OT_PADRE_FK: null }),
      },
    });

    let ot: { ID_ORDEN_TRABAJO: number; CODIGO_OT: string };
    let esNueva = false;
    let codigoOT: string;

    if (otExistente) {
      codigoOT = otExistente.CODIGO_OT;
      ot = await tx.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: otExistente.ID_ORDEN_TRABAJO },
        data: {
          ...options.datosOT,
          SITIO_CALIBRACION: sitio,
          ES_EN_SITIO: esSitio,
          ES_LAB_PERMANENTE: !esSitio,
          ID_OT_PADRE_FK: options.idOtMaster ?? null,
        },
      });
    } else {
      esNueva = true;
      codigoOT = await generarConsecutivo(tx, 'OT');
      ot = await tx.ordenes_trabajo.create({
        data: {
          CODIGO_OT: codigoOT,
          ID_COTIZACION_FK: options.idCotizacion,
          ID_CLIENTE_FK: options.idCliente,
          ID_OT_PADRE_FK: options.idOtMaster ?? null,
          estado: 'Creada',
          ESTADO_REVISION: 'PENDIENTE_REVISION',
          SITIO_CALIBRACION: sitio,
          ES_EN_SITIO: esSitio,
          ES_LAB_PERMANENTE: !esSitio,
          ...options.datosOT,
        },
      });
    }

    ots.push({ id: ot.ID_ORDEN_TRABAJO, codigo: codigoOT, esNueva, sitio });

    // Detalles de la OT (sitio_calibracion por fila).
    await tx.orden_trabajo_detalles.deleteMany({
      where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
    });

    await tx.orden_trabajo_detalles.createMany({
      data: instrumentosSitio.map((item, index) => ({
        ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
        ITEM: index + 1,
        TIPO_SERVICIO: item.tipo_servicio || 'Calibración',
        INSTRUMENTO: item.instrumento,
        FABRICANTE: item.fabricante || null,
        MODELO: item.modelo || null,
        SERIE: item.serie || null,
        CODIGO_INVENTARIO: item.codigo_interno || null,
        UBICACION: item.ubicacion || null,
        PUNTOS_CALIBRAR: item.puntos_calibracion || [],
        UNIDAD: item.unidad || null,
        INTERVALO_RANGO: item.intervalo_medicion || null,
        RESOLUCION: item.resolucion_division || null,
        asignado: null,
        DECLARACION_CONFORMIDAD: item.declaracion_conformidad ?? false,
        LIMITE_CONTROL_EMC: item.emp_ajuste_control || item.emp_limite_control || null,
        DOC_ESPECIFICACION: item.documento_especificacion || null,
        REGLA_DECISION: item.regla_decision || null,
        sitio_calibracion: sitio,
        activacion: true,
      })),
    });

    // Recepción de equipo (una por OT derivada).
    const recepcionExistente = await tx.recepciones_equipo.findFirst({
      where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
    });

    let codigoRec: string;
    let idRec: number;
    let esNuevaRec = false;

    if (recepcionExistente) {
      codigoRec = recepcionExistente.CODIGO_RECEPCION;
      idRec = recepcionExistente.ID_RECEPCION;
      await tx.recepciones_equipo.update({
        where: { ID_RECEPCION: idRec },
        data: {
          SOLICITANTE: options.solicitante,
          SITIO_CALIBRACION: sitio,
          ESTADO: 'BORRADOR',
        },
      });
    } else {
      esNuevaRec = true;
      codigoRec = await generarConsecutivo(tx, 'REC');
      const rec = await tx.recepciones_equipo.create({
        data: {
          CODIGO_RECEPCION: codigoRec,
          ID_COTIZACION_FK: options.idCotizacion,
          ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
          ESTADO: 'BORRADOR',
          SOLICITANTE: options.solicitante,
          SITIO_CALIBRACION: sitio,
        },
      });
      idRec = rec.ID_RECEPCION;
    }

    recepciones.push({ id: idRec, codigo: codigoRec, esNueva: esNuevaRec, sitio });

    await tx.recepcion_equipo_detalles.deleteMany({
      where: { ID_RECEPCION_FK: idRec },
    });

    await tx.recepcion_equipo_detalles.createMany({
      data: instrumentosSitio.map((item, index) => ({
        ID_RECEPCION_FK: idRec,
        ITEM: index + 1,
        INSTRUMENTO: item.instrumento,
        MARCA: item.fabricante || null,
        MODELO: item.modelo || null,
        SERIE: item.serie || null,
        CODIGO_INVENTARIO: item.codigo_interno || null,
        RESOLUCION: item.resolucion_division || null,
        ESTAMPILLA: null,
        activacion: true,
      })),
    });
  }

  return { ots, recepciones };
}
