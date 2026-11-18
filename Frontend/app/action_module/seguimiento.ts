'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError } from '@/app/lib/api/fastifyClient';
import type { SeguimientoComercialModel } from '@/tipos/entidades';
import type {
  CrearSeguimientoInput,
  ActualizarSeguimientoInput,
} from '@/tipos/seguimiento';

export interface RespuestaListaSeguimientos {
  ok: boolean;
  data: SeguimientoComercialModel[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface RespuestaSeguimiento {
  ok: boolean;
  data: SeguimientoComercialModel;
}

export async function obtenerSeguimientos(
  idCotizacion?: number
): Promise<RespuestaListaSeguimientos> {
  try {
    const session = await auth();
    const query = new URLSearchParams();
    if (idCotizacion) query.set('idCotizacion', String(idCotizacion));
    query.set('limit', '100');
    const qs = query.toString();

    const res = await fastifyRequest<RespuestaListaSeguimientos>(
      session,
      `/api/v1/seguimientos${qs ? `?${qs}` : ''}`
    );
    return res;
  } catch (error) {
    console.error('Error en obtenerSeguimientos:', error);
    if (error instanceof FastifyHttpError) {
      return { ok: false, data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
    }
    return { ok: false, data: [], meta: { total: 0, page: 1, limit: 100, totalPages: 0 } };
  }
}

export async function crearSeguimiento(
  input: CrearSeguimientoInput
): Promise<RespuestaSeguimiento> {
  try {
    const session = await auth();
    const res = await fastifyRequest<RespuestaSeguimiento>(session, '/api/v1/seguimientos', {
      method: 'POST',
      body: input,
    });
    return res;
  } catch (error) {
    console.error('Error en crearSeguimiento:', error);
    if (error instanceof FastifyHttpError) throw error;
    throw new Error('Error al crear el seguimiento');
  }
}

export async function actualizarSeguimiento(
  idSeguimiento: number,
  input: ActualizarSeguimientoInput
): Promise<RespuestaSeguimiento> {
  try {
    const session = await auth();
    const res = await fastifyRequest<RespuestaSeguimiento>(
      session,
      `/api/v1/seguimientos/${idSeguimiento}`,
      { method: 'PUT', body: input }
    );
    return res;
  } catch (error) {
    console.error('Error en actualizarSeguimiento:', error);
    if (error instanceof FastifyHttpError) throw error;
    throw new Error('Error al actualizar el seguimiento');
  }
}

export async function eliminarSeguimiento(idSeguimiento: number): Promise<{ ok: boolean }> {
  try {
    const session = await auth();
    await fastifyRequest<{ ok: boolean; message?: string }>(
      session,
      `/api/v1/seguimientos/${idSeguimiento}`,
      { method: 'DELETE' }
    );
    return { ok: true };
  } catch (error) {
    console.error('Error en eliminarSeguimiento:', error);
    if (error instanceof FastifyHttpError) throw error;
    throw new Error('Error al eliminar el seguimiento');
  }
}
