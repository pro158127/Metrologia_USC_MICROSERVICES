import { Prisma } from '@prisma/client';

type DecimalInput = Prisma.Decimal.Value;

/** Normaliza un importe a la precisión de los campos monetarios de Prisma. */
export function normalizarDinero(valor: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(valor).toDecimalPlaces(2);
}

/** Calcula el total de una línea y lo redondea a la precisión monetaria persistida. */
export function calcularValorDetalle(cantidad: number, valorUnitario: DecimalInput): Prisma.Decimal {
  return normalizarDinero(new Prisma.Decimal(valorUnitario).mul(cantidad));
}

/**
 * Regla actual del negocio: aplicar el porcentaje de descuento al subtotal de
 * servicios más viáticos. Devuelve el mismo valor de dos decimales que admite
 * MONTO_TOTAL (Decimal(12,2)).
 */
export function calcularMontoTotalCotizacion(
  subtotalServicios: DecimalInput,
  viaticos: DecimalInput,
  descuentoPorcentaje: DecimalInput,
): Prisma.Decimal {
  const porcentajeNeto = new Prisma.Decimal(100).minus(descuentoPorcentaje);
  return new Prisma.Decimal(subtotalServicios)
    .plus(normalizarDinero(viaticos))
    .mul(porcentajeNeto)
    .div(100)
    .toDecimalPlaces(2);
}
