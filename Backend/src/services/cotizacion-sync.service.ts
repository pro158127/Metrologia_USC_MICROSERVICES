import { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';
import { calcularMontoTotalCotizacion, calcularValorDetalle } from './cotizacion-money.service.js';

type Tx = Prisma.TransactionClient;
type Sitio = 'LABORATORIO' | 'CLIENTE';

interface TarifaInfo {
  magnitud: string;
  tipoServicio: string;
  precioUnitario: number;
  norma: string;
}

interface DetalleCotizacionExistente {
  idDetalle: number;
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
  instrumentos: { instrumento: string; idUnidad?: string | null }[],
  sitio: Sitio,
): Promise<void> {
  // 1. Detalles activos existentes de la cotización.
  const detalles = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });

  const existentesPorInstrumento = new Map<string, DetalleCotizacionExistente[]>();
  for (const d of detalles) {
    const key = d.EQUIPO_DESCRIPCION.trim().toLocaleLowerCase();
    const list = existentesPorInstrumento.get(key) ?? [];
    list.push({
      idDetalle: d.ID_DETALLE,
      valorUnitario: d.VALOR_UNITARIO,
      magnitud: d.MAGNITUD,
      tipoServicio: d.TIPO_SERVICIO,
      norma: d.NORMA_TECNICA,
      sitio: (d.sitio ?? 'LABORATORIO') as Sitio,
    });
    existentesPorInstrumento.set(key, list);
  }

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

  const normalizar = (s: string): string => s.trim().toLowerCase();

  const resolverTarifa = (nombre: string, existente?: DetalleCotizacionExistente): TarifaInfo | null => {
    const n = normalizar(nombre);
    if (!n) return null;
    let matches = tarifasPorInstrumento.filter(({ instrumento }) => normalizar(instrumento) === n);
    if (existente) {
      matches = matches.filter(({ info }) =>
        info.tipoServicio.toLocaleLowerCase() === existente.tipoServicio.toLocaleLowerCase() &&
        info.magnitud.toLocaleLowerCase() === existente.magnitud.toLocaleLowerCase() &&
        (info.norma ?? '').toLocaleLowerCase() === (existente.norma ?? '').toLocaleLowerCase()
      );
    }
    if (matches.length > 1) {
      throw new AppError(409, `El instrumento "${nombre}" tiene varias tarifas activas. Seleccione o corrija una tarifa única antes de actualizar la recepción.`);
    }
    return matches[0]?.info ?? null;
  };

  // 3. Agrupar instrumentos por nombre → CANTIDAD.
  const grupos = new Map<string, { nombre: string; unidades: string[] }>();
  for (const inst of instrumentos) {
    const name = inst.instrumento?.trim();
    if (!name) continue;
    const key = normalizar(name);
    const grupo = grupos.get(key);
    if (grupo) grupo.unidades.push(inst.idUnidad ?? '');
    else grupos.set(key, { nombre: name, unidades: [inst.idUnidad ?? ''] });
  }

  const filas = [...grupos.values()].map(({ nombre, unidades }) => {
    const existentesCompatibles = (existentesPorInstrumento.get(normalizar(nombre)) ?? [])
      .filter((detalle) => detalle.sitio === sitio);
    const clavesComerciales = new Set(existentesCompatibles.map((d) =>
      `${d.tipoServicio.toLocaleLowerCase()}|${d.magnitud.toLocaleLowerCase()}|${(d.norma ?? '').toLocaleLowerCase()}`
    ));
    if (clavesComerciales.size > 1) {
      throw new AppError(409, `La cotización tiene varias tarifas para "${nombre}" en el mismo sitio. No se puede recalcular la recepción sin identificar cuál línea corresponde.`);
    }
    const existente = existentesCompatibles[0];
    const tarifa = resolverTarifa(nombre, existente);
    if (!existente && !tarifa) {
      throw new AppError(409, `No existe una tarifa activa con el nombre exacto "${nombre}". No se guardó el cambio en la cotización.`);
    }
    const precio = existente && new Prisma.Decimal(existente.valorUnitario).gt(0)
      ? existente.valorUnitario
      : tarifa?.precioUnitario ?? 0;
    if (!new Prisma.Decimal(precio).gt(0)) {
      throw new AppError(409, `La tarifa de "${nombre}" no tiene un precio vigente mayor que cero.`);
    }
    return {
      nombre,
      cantidad: unidades.length,
      idsUnidades: unidades,
      tipoServicio: existente?.tipoServicio ?? tarifa?.tipoServicio ?? 'Calibración',
      magnitud: existente?.magnitud ?? tarifa?.magnitud ?? 'n/a',
      norma: existente?.norma ?? tarifa?.norma ?? null,
      valorUnitario: precio,
    };
  });

  // 4. Mantener la identidad de las líneas comerciales y sus unidades.
  const idsFilasVigentes = new Set<number>();
  for (const fila of filas) {
    const existente = (existentesPorInstrumento.get(normalizar(fila.nombre)) ?? [])
      .find((detalle) => detalle.sitio === sitio &&
        detalle.tipoServicio.toLocaleLowerCase() === fila.tipoServicio.toLocaleLowerCase() &&
        detalle.magnitud.toLocaleLowerCase() === fila.magnitud.toLocaleLowerCase() &&
        (detalle.norma ?? '').toLocaleLowerCase() === (fila.norma ?? '').toLocaleLowerCase());
    const idDetalle = existente?.idDetalle;
    const unidades = fila.idsUnidades.filter(Boolean);
    if (idDetalle) {
      const dbDetalle = detalles.find((d) => d.ID_DETALLE === idDetalle)!;
      const idsDetalle = dbDetalle.ID_UNIDADES ?? [];
      const idsProtegidos = idsDetalle.length ? await tx.certificados.findMany({
        where: { calibraciones: { recepcion_equipo_detalles: { ID_UNIDAD_FK: { in: idsDetalle } } } },
        select: { calibraciones: { select: { recepcion_equipo_detalles: { select: { ID_UNIDAD_FK: true } } } } },
      }) : [];
      const protegidos = new Set(idsProtegidos.map((c) => c.calibraciones.recepcion_equipo_detalles.ID_UNIDAD_FK).filter(Boolean));
      if ([...protegidos].some((id) => !unidades.includes(id as string))) {
        throw new AppError(409, `No se puede quitar una unidad de "${fila.nombre}": ya tiene un certificado creado.`);
      }
      await tx.cotizacion_detalles.update({
        where: { ID_DETALLE: idDetalle },
        data: {
          EQUIPO_DESCRIPCION: fila.nombre,
          CANTIDAD: fila.cantidad,
          ID_UNIDADES: unidades,
          VALOR_TOTAL: calcularValorDetalle(fila.cantidad, fila.valorUnitario),
          activacion: true,
        },
      });
      idsFilasVigentes.add(idDetalle);
    } else {
      const created = await tx.cotizacion_detalles.create({ data: {
        ID_COTIZACION_FK: idCotizacion,
        EQUIPO_DESCRIPCION: fila.nombre,
        TIPO_SERVICIO: fila.tipoServicio,
        MAGNITUD: fila.magnitud,
        NORMA_TECNICA: fila.norma,
        CANTIDAD: fila.cantidad,
        ID_UNIDADES: unidades,
        VALOR_UNITARIO: fila.valorUnitario,
        VALOR_TOTAL: calcularValorDetalle(fila.cantidad, fila.valorUnitario),
        sitio,
        activacion: true,
      } });
      idsFilasVigentes.add(created.ID_DETALLE);
    }
  }

  for (const d of detalles) {
    if ((d.sitio ?? 'LABORATORIO') !== sitio || idsFilasVigentes.has(d.ID_DETALLE)) continue;
    const certificados = await tx.certificados.count({
      where: { calibraciones: { recepcion_equipo_detalles: { ID_UNIDAD_FK: { in: d.ID_UNIDADES } } } },
    });
    if (certificados) throw new AppError(409, `No se puede quitar "${d.EQUIPO_DESCRIPCION}": contiene una unidad con certificado creado.`);
    await tx.cotizacion_detalles.update({ where: { ID_DETALLE: d.ID_DETALLE }, data: { activacion: false } });
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

  await tx.cotizaciones.update({
    where: { ID_COTIZACION: idCotizacion },
    data: { MONTO_TOTAL: montoTotal, UPDATED_AT: new Date() },
  });
}
