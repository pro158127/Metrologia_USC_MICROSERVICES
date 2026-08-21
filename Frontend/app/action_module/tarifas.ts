'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError } from '@/app/lib/api/fastifyClient';

// 1. Tipo serializable plano para el cliente
export interface TarifaModel {
  idTarifa: number;
  magnitud: string;
  tipoServicio: string;
  estado: string;
  Instrumento: string;
  Norma: string;
  historial: {
    idHistorial: number;
    idTarifa: number;
    fechaInicio: Date | string;
    fechaFin: Date | string | null;
    precioU: number;
  }[];
}

export type ResponseAction<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

// ==========================================
// 1. Obtener todas las tarifas
// ==========================================
export async function obtenerTodasLasTarifas(): Promise<ResponseAction<TarifaModel[]>> {
  const session = await auth();
  try {
    const res = await fastifyRequest<ResponseAction<TarifaModel[]>>(session, '/api/v1/tarifas');
    return res;
  } catch (error) {
    console.error('[obtenerTodasLasTarifas_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'Error al consultar el catálogo de tarifas.' };
  }
}

// ==========================================
// 2. Actualizar Tarifa (SCD2 + campos principales)
// ==========================================
export interface ActualizarTarifaInput {
  idTarifa: number;
  magnitud?: string;
  tipoServicio?: string;
  instrumento?: string;
  norma?: string;
  precioVigente?: number;    // Si se envía, se actualiza el precio con SCD2
  fechaInicio?: Date | string; // Fecha de inicio del nuevo precio (opcional)
  fechaFin?: Date | string | null; // Fecha de fin del nuevo precio (opcional)
}

export async function actulzar_tarifa(
  input: ActualizarTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  const session = await auth();

  if (!input.idTarifa) return { ok: false, error: 'ID de tarifa requerido.' };

  try {
    const res = await fastifyRequest<ResponseAction<TarifaModel>>(
      session,
      `/api/v1/tarifas/${input.idTarifa}`,
      { method: 'PUT', body: input }
    );
    return res;
  } catch (error) {
    console.error('[actulzar_tarifa_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'Error al actualizar la tarifa.' };
  }
}

// ==========================================
// 3. Crear una nueva Tarifa (con fechas opcionales)
// ==========================================
export interface CrearTarifaInput {
  magnitud: string;
  tipoServicio: string;
  instrumento: string;        // antes magnitudCalibrar
  precioInicial: number;
  norma?: string;
  fechaInicio?: Date | string;
  fechaFin?: Date | string | null;
}

export async function crearTarifa(
  input: CrearTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  const session = await auth();
  try {
    const res = await fastifyRequest<ResponseAction<TarifaModel>>(
      session,
      '/api/v1/tarifas',
      { method: 'POST', body: input }
    );
    return res;
  } catch (error) {
    console.error('[crearTarifa_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'No se pudo crear la tarifa metrológica.' };
  }
}

// ==========================================
// 4. Actualizar solo el precio (mantenido para compatibilidad)
// ==========================================
export interface ActualizarPrecioTarifaInput {
  idTarifa: number;
  nuevoPrecio: number;
  fechaInicio?: Date | string;
  fechaFin?: Date | string | null;
}

export async function actualizarPrecioTarifa(
  input: ActualizarPrecioTarifaInput
): Promise<ResponseAction<TarifaModel>> {
  const session = await auth();
  try {
    const res = await fastifyRequest<ResponseAction<TarifaModel>>(
      session,
      `/api/v1/tarifas/${input.idTarifa}/precio`,
      { method: 'PUT', body: input }
    );
    return res;
  } catch (error) {
    console.error('[actualizarPrecioTarifa_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'Error al actualizar el precio de la tarifa.' };
  }
}

// ==========================================
// 5. Cambiar Estado
// ==========================================
export async function cambiarEstadoTarifa(
  idTarifa: number,
  nuevoEstado: 'ACTIVO' | 'INACTIVO'
): Promise<ResponseAction<TarifaModel>> {
  const session = await auth();
  try {
    const res = await fastifyRequest<ResponseAction<TarifaModel>>(
      session,
      `/api/v1/tarifas/${idTarifa}/estado`,
      { method: 'PATCH', body: { nuevoEstado } }
    );
    return res;
  } catch (error) {
    console.error('[cambiarEstadoTarifa_ERROR]:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: 'Error al cambiar el estado de la tarifa.' };
  }
}
