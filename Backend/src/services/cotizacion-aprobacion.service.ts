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

/** Desdobla los detalles (por CANTIDAD) a filas de recepción. */
function desdoblarRecepcionDetalles(dets: DetalleCotizacion[]): any[] {
  const result: any[] = [];
  let itemCounter = 1;
  for (const det of dets) {
    for (let i = 0; i < (det.CANTIDAD || 1); i++) {
      result.push({
        ITEM: itemCounter,
        INSTRUMENTO: det.EQUIPO_DESCRIPCION,
        MARCA: null,
        MODELO: null,
        SERIE: null,
        CODIGO_INVENTARIO: null,
        RESOLUCION: null,
        activacion: true,
      });
      itemCounter++;
    }
  }
  return result;
}

/** Crea (o actualiza) la recepción vinculada a una OT. */
export async function upsertRecepcion(
  tx: Tx,
  input: {
    idCotizacion: number;
    idOrdenTrabajo: number;
    sitio: 'LABORATORIO' | 'CLIENTE';
    solicitante: string;
    detalles: DetalleCotizacion[];
  },
) {
  const detallesRec = desdoblarRecepcionDetalles(input.detalles);

  const existente = await tx.recepciones_equipo.findFirst({
    where: { ID_ORDEN_TRABAJO_FK: input.idOrdenTrabajo },
  });

  if (existente) {
    await tx.recepciones_equipo.update({
      where: { ID_RECEPCION: existente.ID_RECEPCION },
      data: {
        SOLICITANTE: input.solicitante,
        SITIO_CALIBRACION: input.sitio,
        ESTADO: 'BORRADOR',
      },
    });
    await tx.recepcion_equipo_detalles.deleteMany({
      where: { ID_RECEPCION_FK: existente.ID_RECEPCION },
    });
    await tx.recepcion_equipo_detalles.createMany({
      data: detallesRec.map((d) => ({ ID_RECEPCION_FK: existente.ID_RECEPCION, ...d })),
    });
    return existente;
  }

  const codigoRec = await generarConsecutivo(tx, 'REC');
  return tx.recepciones_equipo.create({
    data: {
      CODIGO_RECEPCION: codigoRec,
      ID_COTIZACION_FK: input.idCotizacion,
      ID_ORDEN_TRABAJO_FK: input.idOrdenTrabajo,
      SOLICITANTE: input.solicitante,
      SITIO_CALIBRACION: input.sitio,
      ESTADO: 'BORRADOR',
      recepcion_equipo_detalles: { create: detallesRec },
    },
  });
}

/**
 * Genera las Órdenes de Trabajo y sus recepciones a partir de los detalles
 * activos de la cotización aprobada, separando por homogeneidad de sitio.
 * - Homogénea: 1 OT + 1 recepción.
 * - Heterogénea: 1 OT Master (SITIO=null) + 1 OT hija por sitio + 1 recepción por hija.
 */
export async function generarOrdenesTrabajoAprobacion(
  tx: Tx,
  cotizacion: CotizacionAprobacion
): Promise<{ ots: any[]; recs: any[] }> {
  const dataOTs: any[] = [];
  const dataRecs: any[] = [];

  const detalles = cotizacion.cotizacion_detalles.filter((d) => d.activacion !== false);

  const solicitante = cotizacion.clientes?.RAZON_SOCIAL ?? '';

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
    sitio: 'LABORATORIO' | 'CLIENTE',
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

  const cabeceraOT = () => ({
    ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
    ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
    razon_social_solicitante: cotizacion.clientes?.RAZON_SOCIAL ?? '',
    no_cotizacion: cotizacion.CODIGO_COTIZACION,
    NIT_solicitante: cotizacion.clientes?.NIT ?? '',
    dirrecion_solcitante: cotizacion.clientes?.dirrecion ?? '',
    ciudad_solcitante: cotizacion.clientes?.ciudad ?? '',
  });

  if (esHeterogenea) {
    // ==========================================================
    // HETEROGÉNEA: Master (SITIO=null) + hijas por sitio + recepciones.
    // ==========================================================
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

    let master: any;
    if (masterExistente) {
      master = await tx.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: masterExistente.ID_ORDEN_TRABAJO },
        data: { SITIO_CALIBRACION: null, ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK },
      });
      const estadoOT = masterExistente.estado ?? 'Creada';
      if (estadoOT === 'Creada' || estadoOT === 'En_recepción') {
        await tx.orden_trabajo_detalles.deleteMany({
          where: { ID_ORDEN_TRABAJO_FK: master.ID_ORDEN_TRABAJO },
        });
        await tx.orden_trabajo_detalles.createMany({
          data: detallesOT.map((d) => ({ ID_ORDEN_TRABAJO_FK: master.ID_ORDEN_TRABAJO, ...d })),
        });
      }
    } else {
      const codigoOT = await generarConsecutivo(tx, 'OT');
      master = await tx.ordenes_trabajo.create({
        data: {
          CODIGO_OT: codigoOT,
          ...cabeceraOT(),
          estado: 'Creada',
          SITIO_CALIBRACION: null,
          ES_EN_SITIO: false,
          ES_LAB_PERMANENTE: false,
          ES_INTERNO_USC: false,
          orden_trabajo_detalles: { create: detallesOT },
        },
      });
    }

    dataOTs.push(master);

    // Hijas por sitio + recepciones.
    for (const [sitio, detallesSitio] of grupos.entries()) {
      const esSitio = sitio === 'CLIENTE';
      const detallesOT = desdoblarDetallesOT(detallesSitio, sitio);

      const hijaExistente = await tx.ordenes_trabajo.findFirst({
        where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, SITIO_CALIBRACION: sitio },
      });

      let hija: any;
      if (hijaExistente) {
        hija = await tx.ordenes_trabajo.update({
          where: { ID_ORDEN_TRABAJO: hijaExistente.ID_ORDEN_TRABAJO },
          data: {
            SITIO_CALIBRACION: sitio,
            ES_EN_SITIO: esSitio,
            ES_LAB_PERMANENTE: !esSitio,
            ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
            ID_OT_PADRE_FK: master.ID_ORDEN_TRABAJO,
          },
        });
        const estadoOT = hijaExistente.estado ?? 'Creada';
        if (estadoOT === 'Creada' || estadoOT === 'En_recepción') {
          await tx.orden_trabajo_detalles.deleteMany({
            where: { ID_ORDEN_TRABAJO_FK: hija.ID_ORDEN_TRABAJO },
          });
          await tx.orden_trabajo_detalles.createMany({
            data: detallesOT.map((d) => ({ ID_ORDEN_TRABAJO_FK: hija.ID_ORDEN_TRABAJO, ...d })),
          });
        }
      } else {
        const codigoOT = await generarConsecutivo(tx, 'OT');
        hija = await tx.ordenes_trabajo.create({
          data: {
            CODIGO_OT: codigoOT,
            ...cabeceraOT(),
            ID_OT_PADRE_FK: master.ID_ORDEN_TRABAJO,
            estado: 'Creada',
            SITIO_CALIBRACION: sitio,
            ES_EN_SITIO: esSitio,
            ES_LAB_PERMANENTE: !esSitio,
            ES_INTERNO_USC: false,
            orden_trabajo_detalles: { create: detallesOT },
          },
        });
      }

      dataOTs.push(hija);

      const rec = await upsertRecepcion(tx, {
        idCotizacion: cotizacion.ID_COTIZACION,
        idOrdenTrabajo: hija.ID_ORDEN_TRABAJO,
        sitio,
        solicitante,
        detalles: detallesSitio,
      });
      dataRecs.push(rec);
    }
  } else {
    // ==========================================================
    // HOMOGÉNEA: una única OT operativa + su recepción.
    // ==========================================================
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
          data: detallesOT.map((d) => ({ ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO, ...d })),
        });
      }
    } else {
      const codigoOT = await generarConsecutivo(tx, 'OT');
      ot = await tx.ordenes_trabajo.create({
        data: {
          CODIGO_OT: codigoOT,
          ...cabeceraOT(),
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

    const rec = await upsertRecepcion(tx, {
      idCotizacion: cotizacion.ID_COTIZACION,
      idOrdenTrabajo: ot.ID_ORDEN_TRABAJO,
      sitio,
      solicitante,
      detalles: detallesGrupo,
    });
    dataRecs.push(rec);
  }

  return { ots: dataOTs, recs: dataRecs };
}
