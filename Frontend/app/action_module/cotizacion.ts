'use server';

import { auth } from '@/app/Login/types/auth';
import { Estados } from '@/tipos/enums';
import { CotizacionModel } from "@/tipos/entidades";
import type {
  CotizacionConDetalles,
  CrearCotizacionInput,
  ActualizarCotizacionInput,
  ObtenerCotizacionesParams,
} from "@/tipos/cotizacion";
import type { ActionResponse } from "@/tipos/comunes";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";

// ==========================================
// VALIDACIÓN DE PERMISOS (sin cambios)
// ==========================================
async function validarPermiso(accion: 'consultar' | 'desactivar' | 'crear_editar' | 'ver_historial') {
  const session = await auth();
  if (!session?.user) {
    return { autorizado: false, error: 'No autenticado' };
  }
  const permisos = session.user?.permissions?.permisos?.cotizaciones;
  if (!permisos?.[accion]) {
    return { autorizado: false, error: `Acceso denegado: No tienes permisos para ${accion} cotizaciones.` };
  }
  return { autorizado: true };
}

// ==========================================
// CREAR COTIZACIÓN (con estado)
// ==========================================
export async function crearCotizacion(
  data: CrearCotizacionInput
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const res = await fastifyRequest<ActionResponse<CotizacionConDetalles>>(
      session,
      '/api/v1/cotizaciones',
      { method: 'POST', body: data }
    );
    return res;
  } catch (error) {
    console.error('Error en crearCotizacion:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'Error al crear la cotización',
    };
  }
}

// ==========================================
// OBTENER COTIZACIÓN POR ID (sin cambios)
// ==========================================
export async function obtenerCotizacionPorId(
  idCotizacion: number
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('consultar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  try {
    const session = await auth();
    const res = await fastifyRequest<ActionResponse<CotizacionConDetalles>>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}`
    );
    return res;
  } catch (error) {
    console.error('Error en obtenerCotizacionPorId:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'Error al obtener la cotización',
    };
  }
}

// ==========================================
// ACTUALIZAR COTIZACIÓN (sin cambios)
// ==========================================
export async function actualizarCotizacion(
  data: ActualizarCotizacionInput
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const res = await fastifyRequest<ActionResponse<CotizacionConDetalles>>(
      session,
      `/api/v1/cotizaciones/${data.idCotizacion}`,
      { method: 'PUT', body: data }
    );
    return res;
  } catch (error) {
    console.error('Error en actualizarCotizacion:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'Error al actualizar la cotización',
    };
  }
}

// ==========================================
// CAMBIAR ESTADO (ya existente)
// ==========================================
export async function cambiarEstadoCotizacion(
  idCotizacion: number,
  nuevoEstado: Estados
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const res = await fastifyRequest<ActionResponse<CotizacionConDetalles>>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/estado`,
      { method: 'PATCH', body: { nuevoEstado } }
    );
    return res;
  } catch (error) {
    console.error('Error en cambiarEstadoCotizacion:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'Error al cambiar el estado',
    };
  }
}

// ==========================================
// OBTENER TODAS (sin cambios)
// ==========================================
export async function obtenerTodasLasCotizaciones(
  params?: ObtenerCotizacionesParams
): Promise<ActionResponse<CotizacionModel[]>> {
  try {
    const session = await auth();

    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.estado) query.set('estado', params.estado);
    if (params?.idCliente) query.set('idCliente', String(params.idCliente));
    if (params?.busqueda) query.set('busqueda', params.busqueda);
    const qs = query.toString();

    const res = await fastifyRequest<ActionResponse<CotizacionModel[]>>(
      session,
      `/api/v1/cotizaciones${qs ? `?${qs}` : ''}`
    );
    return res;
  } catch (error) {
    console.error('Error en obtenerTodasLasCotizaciones:', error);
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : 'Error al obtener la lista de cotizaciones',
    };
  }
}
