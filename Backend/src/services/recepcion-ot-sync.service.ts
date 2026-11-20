import type { Prisma } from '@prisma/client';
import { generarConsecutivo } from './consecutivo.service.js';

type Tx = Prisma.TransactionClient;

export function datosSitioOT(sitio: 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC') {
  return {
    SITIO_CALIBRACION: sitio,
    ES_LAB_PERMANENTE: sitio === 'LABORATORIO',
    ES_EN_SITIO: sitio === 'CLIENTE',
    ES_INTERNO_USC: sitio === 'INTERNO_USC',
  };
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
      activacion: true,
    };
    if (!anterior) {
      await tx.orden_trabajo_detalles.create({ data: { ...datos, ID_ORDEN_TRABAJO_FK: idMaestra } });
      cambio = true;
    } else if (Object.entries(datos).some(([campo, valor]) => anterior[campo as keyof typeof datos] !== valor)) {
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
    data: { CODIGO_OT: await generarConsecutivo(tx, 'OT', maestra.CODIGO_OT) },
  });
  return cambio;
}
