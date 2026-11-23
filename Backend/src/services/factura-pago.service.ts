import type { Prisma } from '@prisma/client';

/** El llamador mantiene bloqueada la cotización durante el registro del pago. */
export async function registrarFacturaPago(tx: Pick<Prisma.TransactionClient, 'facturas'>, datos: {
  idCotizacion: number; codigoCotizacion: string; idOrdenTrabajo: number; idCliente: number | null; valor: number;
}) {
  const existente = await tx.facturas.findFirst({
    where: { ordenes_trabajo: { ID_COTIZACION_FK: datos.idCotizacion } },
    orderBy: { ID_FACTURA: 'asc' },
  });
  if (existente) return existente;
  return tx.facturas.create({ data: {
    NUMERO_FACTURA: `FAC-${datos.codigoCotizacion}`,
    ID_ORDEN_TRABAJO_FK: datos.idOrdenTrabajo,
    ID_CLIENTE_FK: datos.idCliente,
    FECHA: new Date(), VALOR: datos.valor, ESTADO: 'EMITIDA',
  } });
}
