'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError } from '@/app/lib/api/fastifyClient';
import type { ClienteModel, OrdenTrabajoModel } from '@/tipos/entidades';

// Tipo serializable plano para el cliente (Decimal -> number)
export type FacturaModel = {
  idFactura: number;
  numero: string;
  idOrdenTrabajo: number | null;
  idCliente: number | null;
  fecha: Date | string;
  valor: number;
  estado: string;
  observacion: string | null;
  ordenTrabajo: (OrdenTrabajoModel & { cliente?: ClienteModel | null }) | null;
  cliente: ClienteModel | null;
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
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: FacturaModel[] }>(
      session,
      '/api/v1/facturas'
    );

    return { ok: true, data: res.data };
  } catch (error) {
    console.error('[obtenerFacturas_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'Error al consultar las facturas.' };
  }
}
