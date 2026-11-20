'use server';

import { auth } from '@/app/Login/types/auth';
import { Estados } from '@/tipos/enums';
import { CotizacionModel } from "@/tipos/entidades";
import type {
  CotizacionConDetalles,
  CrearCotizacionInput,
  ObtenerCotizacionesParams,
} from "@/tipos/cotizacion";
import type { ActionResponse } from "@/tipos/comunes";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";

export interface EnvioCorreoCotizacion {
  id: number;
  tipo: string;
  destinatario: string;
  asunto: string;
  estado: string;
  ultimoError: string | null;
  intentos: number;
  creadoAt: string | Date;
  enviadoAt: string | Date | null;
}

export async function obtenerEnviosCorreoCotizacion(
  idCotizacion: number,
): Promise<ActionResponse<EnvioCorreoCotizacion[]>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'No autenticado' };
  try {
    return await fastifyRequest<ActionResponse<EnvioCorreoCotizacion[]>>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/envios-correo`,
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo cargar el estado de los correos' };
  }
}

export async function reintentarEnvioCorreoCotizacion(
  idCotizacion: number,
  idEnvio: number,
  correo?: string,
): Promise<ActionResponse<{ idEnvio: number; idJob: string; destinatario: string }>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };
  const session = await auth();
  if (!session?.user) return { ok: false, error: 'No autenticado' };
  try {
    return await fastifyRequest<ActionResponse<{ idEnvio: number; idJob: string; destinatario: string }>>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/envios-correo/${idEnvio}/reintentar`,
      { method: 'POST', body: correo ? { correo } : {} },
    );
  } catch (error) {
    if (error instanceof FastifyHttpError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo reintentar el correo' };
  }
}

// ==========================================
// VALIDACIÓN DE PERMISOS (sin cambios)
// ==========================================
async function validarPermiso(
  accion: 'consultar' | 'desactivar' | 'crear_editar' | 'ver_historial' | 'aprobar_rechazar' | 'enviar_al_cliente'
) {
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

  if (data.detalles && data.detalles.length > 0) {
    const tuplasVistas = new Set<string>();
    for (const d of data.detalles) {
      const sitio = d.sitio ?? 'LABORATORIO';
      const clave = `${d.equipoDescripcion.trim().toLowerCase()}|${d.tipoServicio.trim().toLowerCase()}|${sitio}`;
      if (tuplasVistas.has(clave)) {
        return {
          ok: false,
          error: `El instrumento "${d.equipoDescripcion}" con servicio "${d.tipoServicio}" en sitio "${sitio}" ya está agregado. Aumente la cantidad en una sola fila.`,
        };
      }
      tuplasVistas.add(clave);
    }
  }

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
export interface ActualizarCotizacionBody {
  idCotizacion: number;
  codigo?: string;
  idCliente?: number;
  estado?: Estados;
  viaticos?: number;
  descuento?: number;
  detalles?: Array<{
    idDetalle?: number;
    equipoDescripcion: string;
    tipoServicio: string;
    magnitud: string;
    normaTecnica?: string | null;
    cantidad: number;
    valorUnitario: number;
    sitio?: "LABORATORIO" | "CLIENTE" | "INTERNO_USC";
  }>;
  cambios: {
    descripcion: string;
    aprobo: string;
    observaciones?: string | null;
  };
}

export async function actualizarCotizacion(
  data: ActualizarCotizacionBody
): Promise<ActionResponse<CotizacionConDetalles>> {
  const perm = await validarPermiso('crear_editar');
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  if (data.detalles && data.detalles.length > 0) {
    const tuplasVistas = new Set<string>();
    for (const d of data.detalles) {
      const sitio = d.sitio ?? 'LABORATORIO';
      const clave = `${d.equipoDescripcion.trim().toLowerCase()}|${d.tipoServicio.trim().toLowerCase()}|${sitio}`;
      if (tuplasVistas.has(clave)) {
        return {
          ok: false,
          error: `El instrumento "${d.equipoDescripcion}" con servicio "${d.tipoServicio}" en sitio "${sitio}" ya está agregado. Aumente la cantidad en una sola fila.`,
        };
      }
      tuplasVistas.add(clave);
    }
  }

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
  nuevoEstado: Estados,
  motivoRechazo?: string,
  codigo?: string,
): Promise<ActionResponse<CotizacionConDetalles>> {
  const accion = nuevoEstado === Estados.ENVIADA ? 'enviar_al_cliente'
    : nuevoEstado === Estados.EN_SEGUIMIENTO ? 'crear_editar' : 'aprobar_rechazar';
  const perm = await validarPermiso(accion);
  if (!perm.autorizado) return { ok: false, error: perm.error };

  const session = await auth();
  const idUsuario = session?.user?.id_user;
  if (!idUsuario) return { ok: false, error: 'No se pudo identificar al usuario' };

  try {
    const res = await fastifyRequest<ActionResponse<CotizacionConDetalles>>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/estado`,
      { method: 'PATCH', body: { nuevoEstado, motivoRechazo: motivoRechazo ?? null, codigo } }
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

export async function obtenerMetricasCotizacionesDashboard(): Promise<{
  estado: string; emitidaAt: string | null; aprobadaAt: string | null;
}[] | null> {
  try {
    const session = await auth();
    return await fastifyRequest(session, '/api/v1/cotizaciones/metricas-dashboard');
  } catch (error) {
    console.error('No se pudieron consultar las métricas de cotizaciones:', error);
    return null;
  }
}

export async function obtenerCotizacionesEnSeguimiento(): Promise<ActionResponse<CotizacionModel[]>> {
  try {
    return await fastifyRequest(await auth(), '/api/v1/cotizaciones/en-seguimiento');
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo cargar Seguimiento Comercial.' };
  }
}
