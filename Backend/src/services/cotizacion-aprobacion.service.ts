import { Prisma } from '@prisma/client';
import { generarConsecutivo } from './consecutivo.service.js';

type Tx = Prisma.TransactionClient;

interface DetalleCotizacion {
  ID_DETALLE: number;
  EQUIPO_DESCRIPCION: string;
  TIPO_SERVICIO: string;
  MAGNITUD: string;
  CANTIDAD: number;
  sitio: 'LABORATORIO' | 'CLIENTE' | null;
  activacion: boolean | null;
}

interface CotizacionAprobacion {
  ID_COTIZACION: number;
  CODIGO_COTIZACION: string;
  ID_CLIENTE_FK: number | null;
  clientes?: { RAZON_SOCIAL: string; NIT: string; dirrecion: string; ciudad: string | null } | null;
  cotizacion_detalles: DetalleCotizacion[];
}

/**
 * Genera las Órdenes de Trabajo a partir de los detalles activos de la
 * cotización aprobada, separando por homogeneidad de sitio de calibración.
 * Reutilizado por la aprobación interna y por la aprobación vía enlace.
 */
export async function generarOrdenesTrabajoAprobacion(
  tx: Tx,
  cotizacion: CotizacionAprobacion
): Promise<{ ots: any[]; recs: any[] }> {
  const dataOTs: any[] = [];
  const dataRecs: any[] = [];

  const detalles = cotizacion.cotizacion_detalles.filter((d) => d.activacion !== false);

  const grupos = new Map<'LABORATORIO' | 'CLIENTE', DetalleCotizacion[]>();
  for (const detalle of detalles) {
    const sitio = detalle.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
    const lista = grupos.get(sitio) ?? [];
    lista.push(detalle);
    grupos.set(sitio, lista);
  }

  const esHeterogenea = grupos.size > 1;

  const desdoblarDetallesOT = (
    dets: DetalleCotizacion[],
    sitio: 'LABORATORIO' | 'CLIENTE'
  ) => {
    const result: any[] = [];
    let itemCounter = 1;
    for (const detalle of dets) {
      for (let i = 0; i < (detalle.CANTIDAD || 1); i++) {
        result.push({
          ITEM: itemCounter,
          INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
          TIPO_SERVICIO: detalle.TIPO_SERVICIO,
          asignado: null,
          sitio_calibracion: sitio,
        });
        itemCounter++;
      }
    }
    return result;
  };

  if (esHeterogenea) {
    const detallesOT: any[] = [];
    let itemCounter = 1;
    for (const detalle of detalles) {
      const sitioFila = detalle.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
      for (let i = 0; i < (detalle.CANTIDAD || 1); i++) {
        detallesOT.push({
          ITEM: itemCounter,
          INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
          TIPO_SERVICIO: detalle.TIPO_SERVICIO,
          asignado: null,
          sitio_calibracion: sitioFila,
        });
        itemCounter++;
      }
    }

    const masterExistente = await tx.ordenes_trabajo.findFirst({
      where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, SITIO_CALIBRACION: null },
    });

    let ot: any;
    if (masterExistente) {
      ot = await tx.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: masterExistente.ID_ORDEN_TRABAJO },
        data: {
          SITIO_CALIBRACION: null,
          ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
        },
      });

      const estadoOT = masterExistente.estado ?? 'Creada';
      if (estadoOT === 'Creada' || estadoOT === 'En_recepción') {
        await tx.orden_trabajo_detalles.deleteMany({
          where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
        });
        await tx.orden_trabajo_detalles.createMany({
          data: detallesOT.map((d) => ({
            ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
            ...d,
          })),
        });
      }
    } else {
      const codigoOT = await generarConsecutivo(tx, 'OT');
      ot = await tx.ordenes_trabajo.create({
        data: {
          CODIGO_OT: codigoOT,
          cotizaciones: {
            connect: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          },
          ...(cotizacion.ID_CLIENTE_FK != null
            ? { clientes: { connect: { ID_CLIENTE: cotizacion.ID_CLIENTE_FK } } }
            : {}),
          razon_social_solicitante: cotizacion.clientes?.RAZON_SOCIAL ?? '',
          no_cotizacion: cotizacion.CODIGO_COTIZACION,
          NIT_solicitante: cotizacion.clientes?.NIT ?? '',
          dirrecion_solcitante: cotizacion.clientes?.dirrecion ?? '',
          ciudad_solcitante: cotizacion.clientes?.ciudad ?? '',
          estado: 'Creada',
          SITIO_CALIBRACION: null,
          ES_EN_SITIO: false,
          ES_LAB_PERMANENTE: false,
          ES_INTERNO_USC: false,
          orden_trabajo_detalles: { create: detallesOT },
        },
      });
    }

    dataOTs.push(ot);
  } else {
    const [sitio, detallesGrupo] = Array.from(grupos.entries())[0];
    const esSitio = sitio === 'CLIENTE';
    const detallesOT = desdoblarDetallesOT(detallesGrupo, sitio);

    const otExistente = await tx.ordenes_trabajo.findFirst({
      where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, SITIO_CALIBRACION: sitio },
    });

    let ot: any;
    if (otExistente) {
      ot = await tx.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: otExistente.ID_ORDEN_TRABAJO },
        data: {
          SITIO_CALIBRACION: sitio,
          ES_EN_SITIO: esSitio,
          ES_LAB_PERMANENTE: !esSitio,
          ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
        },
      });

      const estadoOT = otExistente.estado ?? 'Creada';
      if (estadoOT === 'Creada' || estadoOT === 'En_recepción') {
        await tx.orden_trabajo_detalles.deleteMany({
          where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
        });
        await tx.orden_trabajo_detalles.createMany({
          data: detallesOT.map((d) => ({
            ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
            ...d,
          })),
        });
      }
    } else {
      const codigoOT = await generarConsecutivo(tx, 'OT');
      ot = await tx.ordenes_trabajo.create({
        data: {
          CODIGO_OT: codigoOT,
          cotizaciones: {
            connect: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          },
          ...(cotizacion.ID_CLIENTE_FK != null
            ? { clientes: { connect: { ID_CLIENTE: cotizacion.ID_CLIENTE_FK } } }
            : {}),
          razon_social_solicitante: cotizacion.clientes?.RAZON_SOCIAL ?? '',
          no_cotizacion: cotizacion.CODIGO_COTIZACION,
          NIT_solicitante: cotizacion.clientes?.NIT ?? '',
          dirrecion_solcitante: cotizacion.clientes?.dirrecion ?? '',
          ciudad_solcitante: cotizacion.clientes?.ciudad,
          estado: 'Creada',
          SITIO_CALIBRACION: sitio,
          ES_EN_SITIO: esSitio,
          ES_LAB_PERMANENTE: !esSitio,
          ES_INTERNO_USC: false,
          orden_trabajo_detalles: { create: detallesOT },
        },
      });
    }

    dataOTs.push(ot);
  }

  return { ots: dataOTs, recs: dataRecs };
}
