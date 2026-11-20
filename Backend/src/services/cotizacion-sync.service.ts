import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { calcularMontoTotalCotizacion, calcularValorDetalle } from './cotizacion-money.service.js';

type Tx = Prisma.TransactionClient;
type Sitio = 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC';
type UnidadRecibida = { instrumento: string; idUnidad?: string | null; tipoServicio?: string | null };

const normalizar = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizarServicioCotizado = (s: string): string => normalizar(s).replace(/[_\s]+/g, ' ');

function claveComercial(fila: Omit<DetalleCotizacionExistente, 'idDetalle' | 'idsUnidades'>): string {
  return JSON.stringify([
    normalizar(fila.nombre), normalizarServicioCotizado(fila.tipoServicio), normalizar(fila.magnitud),
    normalizar(fila.norma ?? ''), new Prisma.Decimal(fila.valorUnitario).toFixed(2), fila.sitio,
  ]);
}

interface TarifaInfo {
  magnitud: string;
  tipoServicio: string;
  precioUnitario: number;
  norma: string;
}

interface DetalleCotizacionExistente {
  idDetalle: number;
  idsUnidades: string[];
  nombre: string;
  valorUnitario: number | Prisma.Decimal;
  magnitud: string;
  tipoServicio: string;
  norma: string | null;
  sitio: Sitio;
}

/**
 * Reconstruye las líneas de cotización del `sitio` indicado a partir de los
 * instrumentos de la recepción (agrupando por nombre → CANTIDAD) y recalcula
 * el MONTO_TOTAL con viáticos y descuento.
 *
 * - Agrupa por instrumento y sitio, preservando la tarifa de cotización cuando
 *   ya existe una única línea comercial equivalente.
 * - Para líneas nuevas exige una tarifa activa con nombre exacto y no ambiguo.
 */
export async function sincronizarCotizacionDesdeRecepcion(
  tx: Tx,
  idCotizacion: number,
  instrumentos: UnidadRecibida[],
  sitio: Sitio,
  modo: 'reconciliar' | 'agregar' = 'reconciliar',
): Promise<{ cambio: boolean; serviciosPorUnidad: ReadonlyMap<string, string> }> {
  // 1. Detalles activos existentes de la cotización.
  const detalles = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
    orderBy: { ID_DETALLE: 'asc' },
  });

  const existentesPorInstrumento = new Map<string, DetalleCotizacionExistente[]>();
  for (const d of detalles) {
    const key = normalizar(d.EQUIPO_DESCRIPCION);
    const list = existentesPorInstrumento.get(key) ?? [];
    list.push({
      idDetalle: d.ID_DETALLE,
      idsUnidades: d.ID_UNIDADES ?? [],
      nombre: d.EQUIPO_DESCRIPCION,
      valorUnitario: d.VALOR_UNITARIO,
      magnitud: d.MAGNITUD,
      tipoServicio: d.TIPO_SERVICIO,
      norma: d.NORMA_TECNICA,
      sitio: (d.sitio ?? 'LABORATORIO') as Sitio,
    });
    existentesPorInstrumento.set(key, list);
  }

  const instantanea = (filas: typeof detalles) => JSON.stringify(filas.map((d) =>
    [d.ID_DETALLE, d.EQUIPO_DESCRIPCION, d.TIPO_SERVICIO, d.CANTIDAD, String(d.VALOR_UNITARIO),
      String(d.VALOR_TOTAL), d.sitio, [...(d.ID_UNIDADES ?? [])].sort()],
  ).sort());
  const antes = instantanea(detalles);

  // 2. Tarifas activas con su precio vigente.
  const tarifas = await tx.tarifas.findMany({
    where: { ESTADO: 'ACTIVO' },
    include: {
      historial_tarifas: {
        where: { FECHA_FIN: null },
        orderBy: { FECHA_INICIO: 'desc' },
        take: 1,
      },
    },
  });

  const tarifasPorInstrumento = tarifas.map((t) => ({
    instrumento: t.Instrumento,
    info: {
      magnitud: t.MAGNITUD,
      tipoServicio: t.TIPO_SERVICIO,
      precioUnitario: t.historial_tarifas[0] ? Number(t.historial_tarifas[0].PRECIO_U) : 0,
      norma: t.Norma,
    },
  }));

  const resolverTarifa = (nombre: string, tipoServicio?: string | null, existente?: DetalleCotizacionExistente): TarifaInfo | null => {
    const n = normalizar(nombre);
    if (!n) return null;
    let matches = tarifasPorInstrumento.filter(({ instrumento }) => normalizar(instrumento) === n);
    if (tipoServicio) matches = matches.filter(({ info }) => normalizarServicioCotizado(info.tipoServicio) === normalizarServicioCotizado(tipoServicio));
    if (existente) {
      matches = matches.filter(({ info }) =>
        normalizarServicioCotizado(info.tipoServicio) === normalizarServicioCotizado(existente.tipoServicio) &&
        info.magnitud.toLocaleLowerCase() === existente.magnitud.toLocaleLowerCase() &&
        (info.norma ?? '').toLocaleLowerCase() === (existente.norma ?? '').toLocaleLowerCase()
      );
    }
    if (matches.length > 1) {
      throw new AppError(409, `El instrumento "${nombre}" tiene varias tarifas activas. Seleccione o corrija una tarifa única antes de actualizar la recepción.`);
    }
    return matches[0]?.info ?? null;
  };

  const lineas = [...existentesPorInstrumento.values()].flat();
  const unidadesOtrosSitios = new Set(lineas.filter((linea) => linea.sitio !== sitio)
    .flatMap((linea) => linea.idsUnidades));
  const unidadesVigentes = new Set(lineas.flatMap((linea) => linea.idsUnidades));
  // Resolver primero el servicio y el precio de cada unidad. Una fila sin tipo
  // explícito y otra con el tipo canónico pueden pertenecer a la misma línea.
  const grupos = new Map<string, {
    nombre: string; tipoServicio: string; magnitud: string; norma: string | null;
    valorUnitario: number | Prisma.Decimal; sitio: Sitio; cantidad: number; idsUnidades: string[];
  }>();
  const clavePorUnidad = new Map<string, string>();
  const serviciosPorUnidad = new Map<string, string>();
  for (const inst of instrumentos) {
    const nombre = inst.instrumento.trim();
    if (!nombre) continue;
    if (modo === 'agregar' && (!inst.idUnidad || unidadesVigentes.has(inst.idUnidad))) {
      throw new AppError(409, `La unidad de «${nombre}» ya está cotizada o no tiene un identificador válido.`);
    }
    if (inst.idUnidad && unidadesOtrosSitios.has(inst.idUnidad)) {
      throw new AppError(409, `La unidad de "${nombre}" ya pertenece a otro sitio de la cotización.`);
    }
    const compatibles = (existentesPorInstrumento.get(normalizar(nombre)) ?? [])
      .filter((linea) => linea.sitio === sitio &&
        (!inst.tipoServicio || normalizarServicioCotizado(linea.tipoServicio) === normalizarServicioCotizado(inst.tipoServicio)));
    const propias = inst.idUnidad ? compatibles.filter((linea) => linea.idsUnidades.includes(inst.idUnidad!)) : [];
    const candidatas = propias.length ? propias : compatibles;
    if (new Set(candidatas.map(claveComercial)).size > 1) {
      throw new AppError(409, `La cotización tiene varias tarifas para "${nombre}" en el mismo sitio. Selecciona su servicio antes de guardar.`);
    }
    const existente = candidatas[0];
    const tienePrecio = existente && new Prisma.Decimal(existente.valorUnitario).gt(0);
    const tarifa = tienePrecio ? null : resolverTarifa(nombre, inst.tipoServicio, existente);
    if (!existente && !tarifa) {
      throw new AppError(409, `No existe una tarifa activa con el nombre exacto "${nombre}". No se guardó el cambio en la cotización.`);
    }
    const valorUnitario = tienePrecio ? existente.valorUnitario : tarifa?.precioUnitario ?? 0;
    if (!new Prisma.Decimal(valorUnitario).gt(0)) {
      throw new AppError(409, `La tarifa de "${nombre}" no tiene un precio vigente mayor que cero.`);
    }
    const datos = {
      nombre: existente?.nombre ?? nombre,
      tipoServicio: existente?.tipoServicio ?? tarifa?.tipoServicio ?? inst.tipoServicio ?? 'Calibración',
      magnitud: existente?.magnitud ?? tarifa?.magnitud ?? '',
      norma: existente?.norma ?? tarifa?.norma ?? null,
      valorUnitario,
      sitio,
    };
    const clave = claveComercial(datos);
    if (inst.idUnidad) {
      const anterior = clavePorUnidad.get(inst.idUnidad);
      if (anterior !== undefined) {
        if (anterior !== clave) throw new AppError(409, `La unidad de "${nombre}" tiene datos comerciales incompatibles.`);
        continue;
      }
      clavePorUnidad.set(inst.idUnidad, clave);
      serviciosPorUnidad.set(inst.idUnidad, datos.tipoServicio);
    }
    const grupo = grupos.get(clave) ?? { ...datos, cantidad: 0, idsUnidades: [] };
    grupo.cantidad++;
    if (inst.idUnidad) grupo.idsUnidades.push(inst.idUnidad);
    grupos.set(clave, grupo);
  }

  const lineasDelSitio = lineas.filter((fila) => fila.sitio === sitio);
  const unidadesAnteriores = [...new Set(lineasDelSitio.flatMap((fila) => fila.idsUnidades))];
  const certificados = modo === 'reconciliar' && unidadesAnteriores.length ? await tx.certificados.findMany({
    where: { calibraciones: { recepcion_equipo_detalles: { ID_UNIDAD_FK: { in: unidadesAnteriores } } } },
    select: { calibraciones: { select: { recepcion_equipo_detalles: { select: { ID_UNIDAD_FK: true } } } } },
  }) : [];
  for (const certificado of certificados) {
    const id = certificado.calibraciones.recepcion_equipo_detalles.ID_UNIDAD_FK;
    if (id && !lineasDelSitio.some((linea) =>
      linea.idsUnidades.includes(id) && clavePorUnidad.get(id) === claveComercial(linea))) {
      throw new AppError(409, 'No se puede retirar ni cambiar el servicio o precio de una unidad con certificado creado.');
    }
  }

  const idsVigentes = new Set<number>();
  const detallesPorId = new Map(detalles.map((detalle) => [detalle.ID_DETALLE, detalle]));
  for (const [clave, fila] of grupos) {
    const existente = lineasDelSitio.find((linea) => claveComercial(linea) === clave) ??
      (modo === 'reconciliar' ? lineasDelSitio.find((linea) =>
        !idsVigentes.has(linea.idDetalle) && new Prisma.Decimal(linea.valorUnitario).lte(0) &&
        claveComercial({ ...linea, valorUnitario: fila.valorUnitario }) === clave) : undefined);
    const cantidad = fila.cantidad + (modo === 'agregar' && existente ? detallesPorId.get(existente.idDetalle)!.CANTIDAD : 0);
    const idsUnidades = modo === 'agregar' && existente
      ? [...existente.idsUnidades, ...fila.idsUnidades]
      : fila.idsUnidades;
    const datos = {
      EQUIPO_DESCRIPCION: fila.nombre,
      TIPO_SERVICIO: fila.tipoServicio,
      MAGNITUD: fila.magnitud,
      NORMA_TECNICA: fila.norma,
      CANTIDAD: cantidad,
      ID_UNIDADES: idsUnidades.sort(),
      VALOR_UNITARIO: fila.valorUnitario,
      VALOR_TOTAL: calcularValorDetalle(cantidad, fila.valorUnitario),
      activacion: true,
    };
    if (existente) {
      const previo = detallesPorId.get(existente.idDetalle)!;
      if (previo.CANTIDAD !== datos.CANTIDAD ||
          JSON.stringify([...existente.idsUnidades].sort()) !== JSON.stringify(datos.ID_UNIDADES) ||
          !previo.VALOR_UNITARIO.eq(datos.VALOR_UNITARIO) || !previo.VALOR_TOTAL.eq(datos.VALOR_TOTAL)) {
        await tx.cotizacion_detalles.update({ where: { ID_DETALLE: existente.idDetalle }, data: datos });
      }
      idsVigentes.add(existente.idDetalle);
    } else {
      const creada = await tx.cotizacion_detalles.create({ data: { ...datos, sitio, ID_COTIZACION_FK: idCotizacion } });
      idsVigentes.add(creada.ID_DETALLE);
    }
  }
  for (const linea of lineasDelSitio) {
    if (modo === 'reconciliar' && !idsVigentes.has(linea.idDetalle)) {
      await tx.cotizacion_detalles.update({ where: { ID_DETALLE: linea.idDetalle }, data: { activacion: false } });
    }
  }

  // 6. Recalcular MONTO_TOTAL con viáticos y descuento.
  const activos = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });
  const subtotal = activos.reduce(
    (acc, d) => acc.plus(d.VALOR_TOTAL),
    new Prisma.Decimal(0),
  );
  const cot = await tx.cotizaciones.findUnique({
    where: { ID_COTIZACION: idCotizacion },
  });
  const viaticos = cot?.viaticos ?? new Prisma.Decimal(0);
  const descuento = Number(cot?.descuento ?? 0);
  const montoTotal = calcularMontoTotalCotizacion(subtotal, viaticos, descuento);

  const changed = antes !== instantanea(activos) || !new Prisma.Decimal(cot?.MONTO_TOTAL ?? 0).eq(montoTotal);
  if (changed) await tx.cotizaciones.update({
    where: { ID_COTIZACION: idCotizacion },
    data: { MONTO_TOTAL: montoTotal, UPDATED_AT: new Date() },
  });
  return { cambio: changed, serviciosPorUnidad };
}

/** Retira las unidades indicadas y conserva las demás líneas y sus precios. */
export async function retirarUnidadesDeCotizacion(
  tx: Tx,
  idCotizacion: number,
  idsUnidades: readonly string[],
): Promise<boolean> {
  if (!idsUnidades.length) return false;
  const ids = new Set(idsUnidades);
  const detalles = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });
  let cambio = false;
  let subtotal = new Prisma.Decimal(0);
  for (const detalle of detalles) {
    const unidades = detalle.ID_UNIDADES ?? [];
    const restantes = [...new Set(unidades.filter((unidad) => !ids.has(unidad)))];
    if (!unidades.some((unidad) => ids.has(unidad))) {
      subtotal = subtotal.plus(detalle.VALOR_TOTAL);
      continue;
    }
    const cantidad = restantes.length + Math.max(0, detalle.CANTIDAD - unidades.length);
    const valor = calcularValorDetalle(Math.max(0, cantidad), detalle.VALOR_UNITARIO);
    await tx.cotizacion_detalles.update({
      where: { ID_DETALLE: detalle.ID_DETALLE },
      data: { CANTIDAD: Math.max(0, cantidad), ID_UNIDADES: restantes, VALOR_TOTAL: valor, activacion: cantidad > 0 },
    });
    subtotal = subtotal.plus(valor);
    cambio = true;
  }
  if (cambio) {
    const cotizacion = await tx.cotizaciones.findUniqueOrThrow({ where: { ID_COTIZACION: idCotizacion } });
    await tx.cotizaciones.update({
      where: { ID_COTIZACION: idCotizacion },
      data: {
        MONTO_TOTAL: calcularMontoTotalCotizacion(subtotal, cotizacion.viaticos ?? 0, cotizacion.descuento ?? 0),
        UPDATED_AT: new Date(),
      },
    });
  }
  return cambio;
}

/** Detecta cantidades, unidades repetidas y líneas equivalentes heredadas. */
export async function cotizacionDesalineadaConRecepcion(
  tx: Tx,
  idCotizacion: number,
  sitio: Sitio,
  instrumentos: UnidadRecibida[],
): Promise<boolean> {
  const lineas = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });
  const delSitio = lineas.filter((linea) => (linea.sitio ?? 'LABORATORIO') === sitio);
  const esperadas = new Map(instrumentos.map((inst) => [inst.idUnidad, inst]));
  const vistas = new Set<string>();
  const claves = new Set<string>();
  for (const linea of delSitio) {
    const ids = linea.ID_UNIDADES ?? [];
    const clave = claveComercial({
      nombre: linea.EQUIPO_DESCRIPCION, tipoServicio: linea.TIPO_SERVICIO, sitio,
      valorUnitario: linea.VALOR_UNITARIO, magnitud: linea.MAGNITUD, norma: linea.NORMA_TECNICA,
    });
    if (claves.has(clave) || linea.CANTIDAD !== ids.length ||
        !linea.VALOR_TOTAL.eq(calcularValorDetalle(linea.CANTIDAD, linea.VALOR_UNITARIO))) return true;
    claves.add(clave);
    for (const id of ids) {
      const unidad = esperadas.get(id);
      if (vistas.has(id) || !unidad || normalizar(unidad.instrumento) !== normalizar(linea.EQUIPO_DESCRIPCION) ||
          (unidad.tipoServicio && normalizarServicioCotizado(unidad.tipoServicio) !== normalizarServicioCotizado(linea.TIPO_SERVICIO))) {
        return true;
      }
      vistas.add(id);
    }
  }
  return vistas.size !== esperadas.size;
}
