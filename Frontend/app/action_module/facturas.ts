'use server';

import { Prisma } from '@prisma/client';
import { prisma } from '@/app/lib/data_base/prisma';

// Tipo serializable plano para el cliente (Decimal -> number)
export type FacturaModel = Omit<
  Prisma.FacturaGetPayload<{ include: { ordenTrabajo: true; cliente: true } }>,
  'valor'
> & {
  valor: number;
};

export type ResponseAction<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// ==========================================
// Obtener todas las facturas
// ==========================================
export async function obtenerFacturas(): Promise<ResponseAction<FacturaModel[]>> {
  try {
    const facturas = await prisma.factura.findMany({
      include: {
        ordenTrabajo: {
          include: {
            cliente: true,
          },
        },
        cliente: true,
      },
      orderBy: { fecha: 'desc' },
    });

    const facturasSerializadas: FacturaModel[] = facturas.map((f) => ({
      ...f,
      valor: f.valor ? Number(f.valor) : 0,
    }));

    return { ok: true, data: facturasSerializadas };
  } catch (error: any) {
    console.error('[obtenerFacturas_ERROR]:', error);
    return { ok: false, error: 'Error al consultar las facturas.' };
  }
}
