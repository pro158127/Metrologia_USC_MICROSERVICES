import type { Prisma } from '@prisma/client';

export function idTrabajoPdfFactura(idFactura: number): string {
  return `factura-pdf-${idFactura}`;
}

/** El llamador mantiene bloqueada la cotización durante el registro del pago. */
export async function registrarFacturaPago(tx: Pick<Prisma.TransactionClient, 'facturas' | 'quote'>, datos: {
  idCotizacion: number; codigoCotizacion: string; idOrdenTrabajo: number; idCliente: number | null; valor: number;
}) {
  const existente = await tx.facturas.findFirst({
    where: { ordenes_trabajo: { ID_COTIZACION_FK: datos.idCotizacion } },
    orderBy: { ID_FACTURA: 'asc' },
  });
  const factura = existente ?? await tx.facturas.create({ data: {
    NUMERO_FACTURA: `FAC-${datos.codigoCotizacion}`,
    ID_ORDEN_TRABAJO_FK: datos.idOrdenTrabajo,
    ID_CLIENTE_FK: datos.idCliente,
    FECHA: new Date(), VALOR: datos.valor, ESTADO: 'EMITIDA',
  } });

  if (!factura.ID_DOCUMENTO_FK) await programarPdfFactura(tx, factura.ID_FACTURA);
  return factura;
}

export async function programarPdfFactura(tx: Pick<Prisma.TransactionClient, 'quote'>, idFactura: number) {
  const id = idTrabajoPdfFactura(idFactura);
  await tx.quote.upsert({
    where: { id },
    create: {
      id,
      data: { generacion: { nombre: 'generar_pdf_factura', payload: {
        documento: 'factura', tipo: 4, tipo_entry: 'prod', id_registro: idFactura,
      } } },
    },
    update: {},
  });
}
