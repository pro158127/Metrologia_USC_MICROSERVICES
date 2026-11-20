import type { Prisma, sitio_calibracion as Sitio } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { generarConsecutivo } from './consecutivo.service.js';
import { ajustarIdsUnidades } from './instrument-identity.service.js';
import { normalizarServicioCotizado } from './cotizacion-sync.service.js';
import { evaluarTransicionesOT } from './ot-fsm.service.js';
import { calcularEstadoRecepcion } from './recepcion-entrega.service.js';
import { datosSitioOT, sincronizarOTMaestraDesdeRecepcion, verificarGruposOperativos } from './recepcion-ot-sync.service.js';

type Tx = Prisma.TransactionClient;

type DetalleCotizado = {
  ID_DETALLE: number;
  EQUIPO_DESCRIPCION: string;
  TIPO_SERVICIO: string;
  CANTIDAD: number;
  ID_UNIDADES: string[];
  sitio: Sitio | null;
  activacion: boolean | null;
};

interface CotizacionAprobacion {
  ID_COTIZACION: number;
  CODIGO_COTIZACION: string;
  ID_CLIENTE_FK: number | null;
  clientes?: { RAZON_SOCIAL: string; NIT: string; dirrecion: string; ciudad: string | null } | null;
  cotizacion_detalles: DetalleCotizado[];
}

interface UnidadCotizada {
  id: string;
  nombre: string;
  servicio: string;
}

const detalleVigente = { OR: [{ activacion: true }, { activacion: null }] };

function agruparUnidades(detalles: DetalleCotizado[]) {
  const grupos = new Map<Sitio, UnidadCotizada[]>();
  const ids = new Set<string>();
  for (const detalle of detalles.filter((linea) => linea.activacion !== false)) {
    const sitio = detalle.sitio ?? 'LABORATORIO';
    const grupo = grupos.get(sitio) ?? [];
    if (detalle.CANTIDAD < 1 || detalle.ID_UNIDADES.length !== detalle.CANTIDAD) {
      throw new AppError(409, 'La cotización tiene instrumentos sin identidad. Revisa y guarda sus detalles antes de aprobar.');
    }
    for (const id of detalle.ID_UNIDADES) {
      if (!id || ids.has(id)) throw new AppError(409, 'La cotización contiene instrumentos con identidad duplicada o incompleta.');
      ids.add(id);
      grupo.push({ id, nombre: detalle.EQUIPO_DESCRIPCION, servicio: detalle.TIPO_SERVICIO });
    }
    grupos.set(sitio, grupo);
  }
  if (!grupos.size) throw new AppError(409, 'La cotización debe tener al menos un instrumento.');
  return grupos;
}

function indexarUnidades<T extends { ID_UNIDAD_FK: string | null }>(filas: T[], modulo: string) {
  const indice = new Map<string, T>();
  for (const fila of filas) {
    if (!fila.ID_UNIDAD_FK || indice.has(fila.ID_UNIDAD_FK)) {
      throw new AppError(409, `Hay instrumentos sin identidad o duplicados en ${modulo}. Consolida sus datos antes de continuar.`);
    }
    indice.set(fila.ID_UNIDAD_FK, fila);
  }
  return indice;
}

function sitioOrden(orden: {
  SITIO_CALIBRACION: Sitio | null;
  ES_INTERNO_USC: boolean | null;
  ES_EN_SITIO: boolean | null;
}): Sitio {
  return orden.SITIO_CALIBRACION ?? (orden.ES_INTERNO_USC ? 'INTERNO_USC' : orden.ES_EN_SITIO ? 'CLIENTE' : 'LABORATORIO');
}

function ordenarUnidades(grupo: UnidadCotizada[], filas: { ID_UNIDAD_FK: string | null; ITEM: number | null }[]) {
  const itemsActuales = new Map(filas.map((fila) => [fila.ID_UNIDAD_FK, fila.ITEM ?? Number.MAX_SAFE_INTEGER]));
  return [...grupo].sort((a, b) => (itemsActuales.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
    (itemsActuales.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

function cambio<T extends object>(actual: T, datos: Partial<T>) {
  return Object.entries(datos).some(([campo, valor]) => actual[campo as keyof T] !== valor);
}

async function reconciliarRecepciones(
  tx: Tx,
  cotizacion: CotizacionAprobacion,
  grupos: Map<Sitio, UnidadCotizada[]>,
  ordenesPorSitio: ReadonlyMap<Sitio, { ID_ORDEN_TRABAJO: number; CODIGO_OT: string }>,
  ordenesAnteriores: { ID_ORDEN_TRABAJO: number; CODIGO_OT: string }[] = [],
) {
  const recepciones = await tx.recepciones_equipo.findMany({
    where: {
      VIGENTE: true, activacion: true,
      OR: [
        { ID_COTIZACION_FK: cotizacion.ID_COTIZACION },
        { ID_COTIZACION_FK: null, ID_ORDEN_TRABAJO_FK: { in: ordenesAnteriores.map((ot) => ot.ID_ORDEN_TRABAJO) } },
      ],
    },
    include: {
      recepcion_equipo_detalles: {
        where: detalleVigente,
        include: { calibraciones: { select: { ID_CALIBRACION: true } } },
      },
    },
    orderBy: { ID_RECEPCION: 'asc' },
  });
  const unidades = indexarUnidades(recepciones.flatMap((rec) => rec.recepcion_equipo_detalles), 'Recepciones');
  const asignadas = new Map<Sitio, typeof recepciones[number]>();
  const usadas = new Set<number>();

  for (const sitio of grupos.keys()) {
    const idOT = ordenesPorSitio.get(sitio)?.ID_ORDEN_TRABAJO;
    const candidatas = recepciones.filter((rec) => (rec.SITIO_CALIBRACION ?? 'LABORATORIO') === sitio);
    const vinculada = candidatas.find((rec) => idOT != null && rec.ID_ORDEN_TRABAJO_FK === idOT);
    const rec = vinculada ?? candidatas[0];
    if (rec) {
      asignadas.set(sitio, rec);
      usadas.add(rec.ID_RECEPCION);
    }
  }
  for (const [sitio, grupo] of grupos) {
    if (asignadas.has(sitio)) continue;
    const origenes = new Set(grupo.map((unidad) => unidades.get(unidad.id)?.ID_RECEPCION_FK));
    const anterior = origenes.size === 1
      ? recepciones.find((rec) => origenes.has(rec.ID_RECEPCION) && !usadas.has(rec.ID_RECEPCION))
      : undefined;
    if (anterior) {
      asignadas.set(sitio, anterior);
      usadas.add(anterior.ID_RECEPCION);
    }
  }

  const destinos = new Map([...grupos].flatMap(([sitio, grupo]) => grupo.map((unidad) =>
    [unidad.id, { sitio, unidad }] as const)));
  for (const [id, fila] of unidades) {
    if (!fila.calibraciones) continue;
    const destino = destinos.get(id);
    const original = recepciones.find((rec) => rec.ID_RECEPCION === fila.ID_RECEPCION_FK)!;
    if (!destino || asignadas.get(destino.sitio)?.ID_RECEPCION !== original.ID_RECEPCION ||
        (original.SITIO_CALIBRACION ?? 'LABORATORIO') !== destino.sitio ||
        (ordenesPorSitio.size > 0 && original.ID_ORDEN_TRABAJO_FK !== ordenesPorSitio.get(destino.sitio)?.ID_ORDEN_TRABAJO) ||
        fila.INSTRUMENTO.trim().toLowerCase() !== destino.unidad.nombre.trim().toLowerCase()) {
      throw new AppError(409, `El instrumento «${fila.INSTRUMENTO}» ya está en calibración y no se puede retirar, cambiar ni mover de grupo.`);
    }
  }

  const modificadas = [];
  for (const [sitio, unidadesCotizadas] of grupos) {
    const anterior = asignadas.get(sitio);
    const grupo = ordenarUnidades(unidadesCotizadas, anterior?.recepcion_equipo_detalles ?? []);
    const origen = unidades.get(grupo[0].id)?.ID_RECEPCION_FK;
    const origenComun = origen != null && grupo.every((unidad) => unidades.get(unidad.id)?.ID_RECEPCION_FK === origen)
      ? recepciones.find((rec) => rec.ID_RECEPCION === origen)
      : undefined;
    const orden = ordenesPorSitio.get(sitio);
    const datos = {
      ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
      SITIO_CALIBRACION: sitio,
      ID_ORDEN_TRABAJO_FK: orden?.ID_ORDEN_TRABAJO ?? null,
    };
    const codigoOTAnterior = ordenesAnteriores.find((ot) => ot.ID_ORDEN_TRABAJO === anterior?.ID_ORDEN_TRABAJO_FK)?.CODIGO_OT;
    const nueva = anterior ?? await tx.recepciones_equipo.create({
      data: {
        ...datos,
        CODIGO_RECEPCION: await generarConsecutivo(tx, 'REC'),
        SOLICITANTE: origenComun?.SOLICITANTE ?? cotizacion.clientes?.RAZON_SOCIAL ?? '',
        NOMBRE_ENTREGA: origenComun?.NOMBRE_ENTREGA,
        NOMBRE_RECIBE: origenComun?.NOMBRE_RECIBE,
        FECHA_RECEPCION: origenComun?.FECHA_RECEPCION,
        ESTADO: 'BORRADOR',
      },
    });
    let filasCambiaron = (anterior?.recepcion_equipo_detalles.length ?? 0) !== grupo.length;
    for (const [indice, unidad] of grupo.entries()) {
      const fila = unidades.get(unidad.id);
      const detalle = {
        ITEM: indice + 1, INSTRUMENTO: unidad.nombre, ID_UNIDAD_FK: unidad.id,
        ID_RECEPCION_FK: nueva.ID_RECEPCION, activacion: true,
      };
      if (!fila) {
        await tx.recepcion_equipo_detalles.create({ data: detalle });
        filasCambiaron = true;
      } else if (cambio(fila, { ...detalle, activacion: fila.activacion })) {
        await tx.recepcion_equipo_detalles.update({ where: { ID_INSTRUMENTO: fila.ID_INSTRUMENTO }, data: detalle });
        filasCambiaron = true;
      }
    }
    const idsNuevos = new Set(grupo.map((unidad) => unidad.id));
    const pierdeUnidades = anterior?.recepcion_equipo_detalles.some((fila) => !idsNuevos.has(fila.ID_UNIDAD_FK!));
    const cambioFormato = filasCambiaron || pierdeUnidades || cambio(nueva, datos) ||
      (codigoOTAnterior != null && codigoOTAnterior !== orden?.CODIGO_OT);
    if (cambioFormato || !anterior) {
      const estado = filasCambiaron || pierdeUnidades ? calcularEstadoRecepcion(grupo.map((unidad) => {
        const fila = unidades.get(unidad.id);
        return { instrumento: unidad.nombre, marca: fila?.MARCA, modelo: fila?.MODELO, serie: fila?.SERIE,
          codigoInventario: fila?.CODIGO_INVENTARIO, resolucion: fila?.RESOLUCION, estadoIBC: fila?.ESTADO_IBC };
      }), {
        nombreEntrega: nueva.NOMBRE_ENTREGA,
        fechaRecepcion: nueva.FECHA_RECEPCION.toISOString(),
        fechaSalida: nueva.FECHA_SALIDA?.toISOString(),
        nombreRecibe: nueva.NOMBRE_RECIBE,
        nombreEmpaca: nueva.NOMBRE_EMPACA,
        accesorios: nueva.ACCESORIOS,
        nombreRecibeServicio: nueva.NOMBRE_RECIBE_SERVICIO,
      }, '') : nueva.ESTADO;
      modificadas.push(await tx.recepciones_equipo.update({
        where: { ID_RECEPCION: nueva.ID_RECEPCION },
        data: {
          ...datos, ESTADO: estado,
          ...(anterior ? { CODIGO_RECEPCION: await generarConsecutivo(tx, 'REC', anterior.CODIGO_RECEPCION),
            VERSION: anterior.VERSION + 1 } : {}),
        },
      }));
    }
  }

  const retiradas = [...unidades].flatMap(([id, fila]) => destinos.has(id) ? [] : [fila.ID_INSTRUMENTO]);
  if (retiradas.length) await tx.recepcion_equipo_detalles.updateMany({
    where: { ID_INSTRUMENTO: { in: retiradas } }, data: { activacion: false },
  });
  const gruposRetirados = recepciones.filter((rec) => !usadas.has(rec.ID_RECEPCION)).map((rec) => rec.ID_RECEPCION);
  if (gruposRetirados.length) await tx.recepciones_equipo.updateMany({
    where: { ID_RECEPCION: { in: gruposRetirados } }, data: { VIGENTE: false, activacion: false },
  });
  return modificadas;
}

/** Reorganiza las recepciones existentes de un borrador sin crear ninguna OT. */
export function reconciliarRecepcionesPendientes(tx: Tx, cotizacion: CotizacionAprobacion) {
  return reconciliarRecepciones(tx, cotizacion, agruparUnidades(cotizacion.cotizacion_detalles), new Map());
}

/** Materializa los grupos aprobados y conserva los datos operativos de los registros reutilizados. */
export async function generarOrdenesTrabajoAprobacion(tx: Tx, cotizacion: CotizacionAprobacion) {
  const idCotizacion = cotizacion.ID_COTIZACION;
  const familia = await tx.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true },
    include: { orden_trabajo_detalles: { where: detalleVigente } },
    orderBy: { ID_ORDEN_TRABAJO: 'asc' },
  });
  const idsMaestras = new Set(familia.map((orden) => orden.ID_OT_PADRE_FK));
  const maestras = familia.filter((orden) => idsMaestras.has(orden.ID_ORDEN_TRABAJO));
  const operativas = familia.filter((orden) => !idsMaestras.has(orden.ID_ORDEN_TRABAJO));
  const unidadesOT = indexarUnidades(operativas.flatMap((orden) => orden.orden_trabajo_detalles), 'Órdenes de Trabajo');
  const recibidas = await tx.recepcion_equipo_detalles.findMany({
    where: { ...detalleVigente, recepciones_equipo: { VIGENTE: true, activacion: true, OR: [
      { ID_COTIZACION_FK: idCotizacion },
      { ID_COTIZACION_FK: null, ID_ORDEN_TRABAJO_FK: { in: operativas.map((orden) => orden.ID_ORDEN_TRABAJO) } },
    ] } },
    include: { calibraciones: { select: { ID_CALIBRACION: true } } },
  });
  const detalles = cotizacion.cotizacion_detalles.filter((linea) => linea.activacion !== false);
  if (!familia.length && !recibidas.length) {
    // Las cotizaciones emitidas antes de introducir el ID por unidad se pueden aprobar si aún no tienen registros operativos.
    for (const linea of detalles) {
      if (linea.ID_UNIDADES.length >= linea.CANTIDAD) continue;
      linea.ID_UNIDADES = ajustarIdsUnidades(linea.ID_UNIDADES, linea.CANTIDAD, new Set());
      await tx.cotizacion_detalles.update({
        where: { ID_DETALLE: linea.ID_DETALLE }, data: { ID_UNIDADES: linea.ID_UNIDADES },
      });
    }
  }
  const grupos = agruparUnidades(detalles);
  const unidadesRec = indexarUnidades(recibidas, 'Recepciones');
  const cabecera = {
    ID_COTIZACION_FK: idCotizacion,
    ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
    razon_social_solicitante: cotizacion.clientes?.RAZON_SOCIAL ?? '',
    no_cotizacion: cotizacion.CODIGO_COTIZACION,
    NIT_solicitante: cotizacion.clientes?.NIT ?? '',
    dirrecion_solcitante: cotizacion.clientes?.dirrecion ?? '',
    ciudad_solcitante: cotizacion.clientes?.ciudad ?? '',
  };
  const maestraExistente = grupos.size > 1 ? maestras[0] : undefined;
  const maestra = grupos.size < 2 ? null : maestraExistente ?? await tx.ordenes_trabajo.create({
    data: { ...cabecera, CODIGO_OT: await generarConsecutivo(tx, 'OT'), estado: 'Creada',
      SITIO_CALIBRACION: null, ES_EN_SITIO: false, ES_LAB_PERMANENTE: false, ES_INTERNO_USC: false },
  });

  const ordenesPorSitio = new Map<Sitio, { ID_ORDEN_TRABAJO: number; CODIGO_OT: string }>();
  const ots = [];
  const procesadas = new Set<number>();
  const idsCotizados = new Set([...grupos.values()].flatMap((grupo) => grupo.map((unidad) => unidad.id)));
  for (const [sitio, unidadesCotizadas] of grupos) {
    const anterior = operativas.find((orden) => sitioOrden(orden) === sitio);
    const grupo = ordenarUnidades(unidadesCotizadas, anterior?.orden_trabajo_detalles ?? []);
    const enlace = {
      ...datosSitioOT(sitio),
      ID_OT_PADRE_FK: maestra?.ID_ORDEN_TRABAJO ?? null,
      ID_OT_RAIZ: maestra?.ID_ORDEN_TRABAJO ?? anterior?.ID_OT_RAIZ ?? null,
      ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
      no_cotizacion: cotizacion.CODIGO_COTIZACION,
    };
    const orden = anterior ?? await tx.ordenes_trabajo.create({
      data: { ...cabecera, ...enlace, CODIGO_OT: await generarConsecutivo(tx, 'OT'), estado: 'Creada' },
    });
    procesadas.add(orden.ID_ORDEN_TRABAJO);
    let cambiaDocumento = orden.ID_CLIENTE_FK !== enlace.ID_CLIENTE_FK || orden.no_cotizacion !== enlace.no_cotizacion ||
      cambio(orden, datosSitioOT(sitio));
    const grupoIds = new Set(grupo.map((unidad) => unidad.id));
    if (anterior?.orden_trabajo_detalles.some((fila) => !grupoIds.has(fila.ID_UNIDAD_FK!))) cambiaDocumento = true;
    for (const [indice, unidad] of grupo.entries()) {
      const previa = unidadesOT.get(unidad.id);
      const rec = unidadesRec.get(unidad.id);
      const detalle = {
        ITEM: indice + 1, INSTRUMENTO: unidad.nombre, TIPO_SERVICIO: unidad.servicio,
        ID_UNIDAD_FK: unidad.id, ID_ORDEN_TRABAJO_FK: orden.ID_ORDEN_TRABAJO, sitio_calibracion: sitio,
      };
      const mismoServicio = previa && normalizarServicioCotizado(previa.TIPO_SERVICIO) === normalizarServicioCotizado(unidad.servicio);
      if (rec?.calibraciones && (!previa || previa.ID_ORDEN_TRABAJO_FK !== orden.ID_ORDEN_TRABAJO ||
          sitioOrden(anterior!) !== sitio || !mismoServicio ||
          previa.INSTRUMENTO.trim().toLowerCase() !== unidad.nombre.trim().toLowerCase())) {
        throw new AppError(409, `La cotización cambia el grupo o servicio de «${unidad.nombre}», que ya está en calibración.`);
      }
      if (previa) {
        const actualizacion = { ...detalle, TIPO_SERVICIO: mismoServicio ? previa.TIPO_SERVICIO : unidad.servicio };
        if (cambio(previa, actualizacion)) {
          await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: previa.ID_DETALLE }, data: actualizacion });
          cambiaDocumento = true;
        }
      } else {
        await tx.orden_trabajo_detalles.create({
          data: { ...detalle, activacion: true,
            FABRICANTE: rec?.MARCA, MODELO: rec?.MODELO, SERIE: rec?.SERIE,
            CODIGO_INVENTARIO: rec?.CODIGO_INVENTARIO, RESOLUCION: rec?.RESOLUCION },
        });
        cambiaDocumento = true;
      }
    }

    const guardada = anterior && (cambiaDocumento || cambio(orden, enlace)) ? await tx.ordenes_trabajo.update({
      where: { ID_ORDEN_TRABAJO: orden.ID_ORDEN_TRABAJO },
      data: {
        ...enlace,
        ...(cambiaDocumento ? { CODIGO_OT: await generarConsecutivo(tx, 'OT', orden.CODIGO_OT), VERSION: (orden.VERSION ?? 1) + 1 } : {}),
      },
    }) : orden;
    ordenesPorSitio.set(sitio, guardada);
    if (!anterior || cambiaDocumento) ots.push(guardada);
  }
  const retirar = [...unidadesOT].flatMap(([id, fila]) => idsCotizados.has(id) ? [] : [fila.ID_DETALLE]);
  if (retirar.length) await tx.orden_trabajo_detalles.updateMany({
    where: { ID_DETALLE: { in: retirar } }, data: { activacion: false },
  });
  const inactivas = familia.filter((orden) => !procesadas.has(orden.ID_ORDEN_TRABAJO) &&
    orden.ID_ORDEN_TRABAJO !== maestra?.ID_ORDEN_TRABAJO).map((orden) => orden.ID_ORDEN_TRABAJO);
  if (inactivas.length) await tx.ordenes_trabajo.updateMany({
    where: { ID_ORDEN_TRABAJO: { in: inactivas } }, data: { VIGENTE: false },
  });
  const recs = await reconciliarRecepciones(tx, cotizacion, grupos, ordenesPorSitio, operativas);
  if (maestra && await sincronizarOTMaestraDesdeRecepcion(tx, maestra.ID_ORDEN_TRABAJO, !maestraExistente)) {
    ots.unshift(await tx.ordenes_trabajo.findUniqueOrThrow({ where: { ID_ORDEN_TRABAJO: maestra.ID_ORDEN_TRABAJO } }));
  }
  await verificarGruposOperativos(tx, idCotizacion, new Map([...grupos].map(([sitio, grupo]) =>
    [sitio, grupo.map((unidad) => unidad.id)])));
  for (const orden of ordenesPorSitio.values()) await evaluarTransicionesOT(tx, orden.ID_ORDEN_TRABAJO);
  return { ots, recs };
}
