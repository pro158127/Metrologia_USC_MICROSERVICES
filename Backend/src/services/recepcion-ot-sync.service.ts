import type { Prisma, sitio_calibracion } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { siguienteVersionOT } from './versionado-ot.service.js';

type Tx = Prisma.TransactionClient;

export function datosSitioOT(sitio: 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC') {
  return {
    SITIO_CALIBRACION: sitio,
    ES_LAB_PERMANENTE: sitio === 'LABORATORIO',
    ES_EN_SITIO: sitio === 'CLIENTE',
    ES_INTERNO_USC: sitio === 'INTERNO_USC',
  };
}

/** Una familia vigente tiene una maestra o una sola orden operativa. */
export function ordenPrincipalVigente<T extends { ID_ORDEN_TRABAJO: number; ID_OT_PADRE_FK: number | null }>(
  ordenes: readonly T[],
): T | undefined {
  if (ordenes.length === 1) return ordenes[0];
  const padres = new Set(ordenes.map((orden) => orden.ID_OT_PADRE_FK));
  const maestras = ordenes.filter((orden) => padres.has(orden.ID_ORDEN_TRABAJO));
  return maestras.length === 1 ? maestras[0] : undefined;
}

/** Actualiza el resumen de la maestra con todas sus hijas vigentes. */
export async function sincronizarOTMaestraDesdeRecepcion(tx: Tx, idMaestra: number, esNueva = false): Promise<boolean> {
  const maestra = await tx.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idMaestra },
    include: { orden_trabajo_detalles: true },
  });
  if (!maestra) return false;

  const hijas = await tx.ordenes_trabajo.findMany({
    where: { ID_OT_PADRE_FK: idMaestra, VIGENTE: true },
    orderBy: { ID_ORDEN_TRABAJO: 'asc' },
    include: {
      orden_trabajo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        orderBy: [{ ITEM: 'asc' }, { ID_DETALLE: 'asc' }],
      },
    },
  });
  if (hijas.length < 2) {
    if (maestra.VIGENTE) await tx.ordenes_trabajo.update({
      where: { ID_ORDEN_TRABAJO: idMaestra },
      data: { VIGENTE: false },
    });
    if (hijas[0]) await tx.ordenes_trabajo.update({
      where: { ID_ORDEN_TRABAJO: hijas[0].ID_ORDEN_TRABAJO },
      data: { ID_OT_PADRE_FK: null },
    });
    return false;
  }

  const unidades = hijas.flatMap((hija) => hija.orden_trabajo_detalles.map((unidad) => ({
    ...unidad, sitio_calibracion: hija.SITIO_CALIBRACION ?? unidad.sitio_calibracion,
  })));
  // No retirar filas de una maestra antigua si alguna hija todavía carece de ID de unidad.
  const puedeRetirar = unidades.every((unidad) => Boolean(unidad.ID_UNIDAD_FK));
  const ids = new Set<string>();
  let cambio = false;
  for (const [indice, unidad] of unidades.entries()) {
    const idUnidad = unidad.ID_UNIDAD_FK;
    if (!idUnidad) continue;
    ids.add(idUnidad);
    const anterior = maestra.orden_trabajo_detalles.find((detalle) => detalle.ID_UNIDAD_FK === idUnidad);
    const datos = {
      ITEM: indice + 1,
      ID_UNIDAD_FK: idUnidad,
      INSTRUMENTO: unidad.INSTRUMENTO,
      TIPO_SERVICIO: unidad.TIPO_SERVICIO,
      sitio_calibracion: unidad.sitio_calibracion,
      FABRICANTE: unidad.FABRICANTE,
      MODELO: unidad.MODELO,
      SERIE: unidad.SERIE,
      CODIGO_INVENTARIO: unidad.CODIGO_INVENTARIO,
      RESOLUCION: unidad.RESOLUCION,
      UBICACION: unidad.UBICACION,
      PUNTOS_CALIBRAR: unidad.PUNTOS_CALIBRAR,
      UNIDAD: unidad.UNIDAD,
      INTERVALO_RANGO: unidad.INTERVALO_RANGO,
      DECLARACION_CONFORMIDAD: unidad.DECLARACION_CONFORMIDAD,
      LIMITE_CONTROL_EMC: unidad.LIMITE_CONTROL_EMC,
      DOC_ESPECIFICACION: unidad.DOC_ESPECIFICACION,
      REGLA_DECISION: unidad.REGLA_DECISION,
      activacion: true,
    };
    if (!anterior) {
      await tx.orden_trabajo_detalles.create({ data: { ...datos, ID_ORDEN_TRABAJO_FK: idMaestra } });
      cambio = true;
    } else if (Object.entries(datos).some(([campo, valor]) => JSON.stringify(anterior[campo as keyof typeof datos]) !== JSON.stringify(valor))) {
      await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: anterior.ID_DETALLE }, data: datos });
      cambio = true;
    }
  }

  const retirar = maestra.orden_trabajo_detalles.filter((detalle) =>
    puedeRetirar && detalle.activacion !== false && detalle.ID_UNIDAD_FK && !ids.has(detalle.ID_UNIDAD_FK),
  );
  if (retirar.length) {
    await tx.orden_trabajo_detalles.updateMany({
      where: { ID_DETALLE: { in: retirar.map((detalle) => detalle.ID_DETALLE) } },
      data: { activacion: false },
    });
    cambio = true;
  }
  if (cambio && !esNueva) await tx.ordenes_trabajo.update({
    where: { ID_ORDEN_TRABAJO: idMaestra },
    data: await siguienteVersionOT(tx, maestra),
  });
  return cambio;
}


/** Comprueba la reconciliación antes de confirmar la nueva versión de la cotización. */
export async function verificarGruposOperativos(
  tx: Tx,
  idCotizacion: number,
  esperados: ReadonlyMap<sitio_calibracion, readonly string[]>,
): Promise<void> {
  const idsEsperados = [...esperados.values()].flat();
  if (new Set(idsEsperados).size !== idsEsperados.length) {
    throw new AppError(409, 'Una unidad figura en más de un grupo de la cotización. La versión no se guardó.');
  }
  const ordenes = await tx.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true },
    select: {
      ID_ORDEN_TRABAJO: true, ID_OT_PADRE_FK: true, SITIO_CALIBRACION: true,
      orden_trabajo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        select: { ID_UNIDAD_FK: true, sitio_calibracion: true },
      },
      recepciones_equipo: {
        where: { VIGENTE: true, activacion: true },
        select: {
          SITIO_CALIBRACION: true,
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            select: { ID_UNIDAD_FK: true },
          },
        },
      },
    },
  });
  const padres = new Set(ordenes.flatMap((orden) => orden.ID_OT_PADRE_FK == null ? [] : [orden.ID_OT_PADRE_FK]));
  const operativas = ordenes.filter((orden) => !padres.has(orden.ID_ORDEN_TRABAJO));
  const coincide = (esperadas: readonly string[], actuales: { ID_UNIDAD_FK: string | null }[]) =>
    actuales.length === esperadas.length && new Set(actuales.map((unidad) => unidad.ID_UNIDAD_FK)).size === esperadas.length &&
    esperadas.every((id) => id != null && actuales.some((unidad) => unidad.ID_UNIDAD_FK === id));
  for (const [sitio, unidades] of esperados) {
    const grupo = operativas.filter((orden) => orden.SITIO_CALIBRACION === sitio);
    const [ot] = grupo;
    const [recepcion] = ot?.recepciones_equipo ?? [];
    if (!unidades.length || grupo.length !== 1 || !ot || ot.recepciones_equipo.length !== 1 ||
        recepcion?.SITIO_CALIBRACION !== sitio || !coincide(unidades, ot.orden_trabajo_detalles) ||
        ot.orden_trabajo_detalles.some((unidad) => unidad.sitio_calibracion !== sitio) ||
        !coincide(unidades, recepcion.recepcion_equipo_detalles)) {
      throw new AppError(409, `No se pudo sincronizar el grupo ${sitio} con la OT y la recepción. La versión no se guardó.`);
    }
  }
  if (operativas.length !== esperados.size) {
    throw new AppError(409, 'Las órdenes vigentes no coinciden con los sitios de la cotización. La versión no se guardó.');
  }
}
