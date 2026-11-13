import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
type Sitio = 'LABORATORIO' | 'CLIENTE';

interface TarifaInfo {
  magnitud: string;
  tipoServicio: string;
  precioUnitario: number;
  norma: string;
}

interface DetalleCotizacionExistente {
  valorUnitario: number;
  magnitud: string;
  tipoServicio: string;
  norma: string | null;
}

/**
 * Reconstruye las líneas de cotización del `sitio` indicado a partir de los
 * instrumentos de la recepción (agrupando por nombre → CANTIDAD) y recalcula
 * el MONTO_TOTAL con viáticos y descuento.
 *
 * - Preserva el precio de las líneas existentes (match por nombre).
 * - Para líneas nuevas resuelve magnitud/tipo/precio desde tarifas.
 */
export async function sincronizarCotizacionDesdeRecepcion(
  tx: Tx,
  idCotizacion: number,
  instrumentos: { instrumento: string }[],
  sitio: Sitio,
): Promise<void> {
  // 1. Detalles activos existentes de la cotización.
  const detalles = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });

  const existentes = new Map<string, DetalleCotizacionExistente>();
  for (const d of detalles) {
    if (!existentes.has(d.EQUIPO_DESCRIPCION)) {
      existentes.set(d.EQUIPO_DESCRIPCION, {
        valorUnitario: Number(d.VALOR_UNITARIO),
        magnitud: d.MAGNITUD,
        tipoServicio: d.TIPO_SERVICIO,
        norma: d.NORMA_TECNICA,
      });
    }
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

  const tarifaMap = new Map<string, TarifaInfo>();
  for (const t of tarifas) {
    tarifaMap.set(t.Instrumento, {
      magnitud: t.MAGNITUD,
      tipoServicio: t.TIPO_SERVICIO,
      precioUnitario: t.historial_tarifas[0] ? Number(t.historial_tarifas[0].PRECIO_U) : 0,
      norma: t.Norma,
    });
  }

  const normalizar = (s: string): string => s.trim().toLowerCase();

  const resolverTarifa = (nombre: string): TarifaInfo | null => {
    const n = normalizar(nombre);
    if (!n) return null;
    // Coincidencia exacta primero.
    for (const [key, info] of tarifaMap.entries()) {
      if (normalizar(key) === n) return info;
    }
    // Fallback por prefijo.
    for (const [key, info] of tarifaMap.entries()) {
      const k = normalizar(key);
      if (k.startsWith(n) || n.startsWith(k)) return info;
    }
    return null;
  };

  // 3. Agrupar instrumentos por nombre → CANTIDAD.
  const grupos = new Map<string, number>();
  for (const inst of instrumentos) {
    const name = inst.instrumento?.trim();
    if (!name) continue;
    grupos.set(name, (grupos.get(name) ?? 0) + 1);
  }

  // 4. Soft-delete de las líneas actuales del sitio.
  for (const d of detalles) {
    if ((d.sitio ?? 'LABORATORIO') !== sitio) continue;
    await tx.cotizacion_detalles.update({
      where: { ID_DETALLE: d.ID_DETALLE },
      data: { activacion: false },
    });
  }

  // 5. Crear las líneas agrupadas.
  for (const [name, cantidad] of grupos.entries()) {
    const existente = existentes.get(name);
    const tarifa = resolverTarifa(name);
    const valorUnitario =
      existente && existente.valorUnitario > 0
        ? existente.valorUnitario
        : tarifa?.precioUnitario ?? 0;

    await tx.cotizacion_detalles.create({
      data: {
        ID_COTIZACION_FK: idCotizacion,
        EQUIPO_DESCRIPCION: name,
        TIPO_SERVICIO: existente?.tipoServicio || tarifa?.tipoServicio || 'Calibración',
        MAGNITUD: existente?.magnitud || tarifa?.magnitud || 'n/a',
        NORMA_TECNICA: existente?.norma || tarifa?.norma || null,
        CANTIDAD: cantidad,
        VALOR_UNITARIO: valorUnitario,
        VALOR_TOTAL: valorUnitario * cantidad,
        sitio,
        activacion: true,
      },
    });
  }

  // 6. Recalcular MONTO_TOTAL con viáticos y descuento.
  const activos = await tx.cotizacion_detalles.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
  });
  const subtotal = activos.reduce((acc, d) => acc + Number(d.VALOR_TOTAL), 0);
  const cot = await tx.cotizaciones.findUnique({
    where: { ID_COTIZACION: idCotizacion },
  });
  const viaticos = Number(cot?.viaticos ?? 0);
  const descuento = Number(cot?.descuento ?? 0);
  const base = subtotal + viaticos;
  const montoTotal = base - base * (descuento / 100);

  await tx.cotizaciones.update({
    where: { ID_COTIZACION: idCotizacion },
    data: { MONTO_TOTAL: montoTotal, UPDATED_AT: new Date() },
  });
}
