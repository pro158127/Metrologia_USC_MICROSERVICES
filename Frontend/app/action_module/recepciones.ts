'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';
import type { RecepcionConInfo } from '@/tipos/recepciones';
import type {
  RecepcionEquipoModel,
  ClienteModel,
  CotizacionModel,
  OrdenTrabajoModel,
  TarifaModel,
} from '@/tipos/entidades';

interface InitialDataResponse {
  recepciones: RecepcionEquipoModel[];
  clientes: ClienteModel[];
  cotizaciones: CotizacionModel[];
  ordenes: OrdenTrabajoModel[];
  tarifas: TarifaModel[];
}

/**
 * Obtiene todas las recepciones de equipo enriquecidas con datos de cliente,
 * cotización, orden de trabajo y cantidad de instrumentos.
 * @returns Promise<RecepcionConInfo[]>
 */
export async function getRecepcionesEnriquecidas(): Promise<RecepcionConInfo[]> {
  try {
    const session = await auth();
    return await fastifyRequest<RecepcionConInfo[]>(
      session,
      '/api/v1/recepciones/enriquecidas'
    );
  } catch (error) {
    console.error('Error al obtener recepciones enriquecidas:', error);
    throw new Error('No se pudieron cargar las recepciones');
  }
}

export async function getInitialData(): Promise<InitialDataResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<InitialDataResponse>(session, '/api/v1/recepciones');
  } catch (error) {
    console.error('❌ Error en getInitialData:', error);
    throw new Error('No se pudieron cargar los datos iniciales');
  }
}

// ============================================================
// Mutaciones
// ============================================================

export interface InstrumentoRecepcionPayload {
  idLocal?: string;
  instrumento: string;
  marca?: string;
  modelo?: string;
  serie?: string;
  codigoInventario?: string;
  resolucion?: string;
  sensorInt?: boolean;
  sensorExt?: boolean;
  estampilla?: string;
  observaciones?: string;
  estadoIBC?: unknown;
}

export interface RecepcionMutationPayload {
  estado?: string;
  isNueva?: boolean;
  solicitante: string;
  nombreEntrega?: string;
  cotizacionCodigo?: string;
  ordenTrabajoCodigo?: string;
  sitioCalibracion?: string;
  fechaRecepcion: string;
  fechaSalida?: string;
  nombreRecibe?: string;
  nombreEmpaca?: string;
  accesorios?: string;
  pruebasCompletas?: boolean;
  observacionesPruebas?: string;
  nombreCalibra?: string;
  nombreRecibeServicio?: string;
  instrumentos: InstrumentoRecepcionPayload[];
}

export interface RespuestaRecepcionMutacion {
  ok: boolean;
  data?: RecepcionEquipoModel;
  message?: string;
  id_job?: string;
  error?: string;
}

export async function crearRecepcion(
  payload: RecepcionMutationPayload
): Promise<RespuestaRecepcionMutacion> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaRecepcionMutacion>(session, '/api/v1/recepciones', {
      method: 'POST',
      body: payload,
    });
  } catch (error) {
    console.error('Error al crear recepción:', error);
    return { ok: false, error: (error as Error).message || 'Error al crear la recepción' };
  }
}

export async function actualizarRecepcion(
  idRecepcion: number,
  payload: RecepcionMutationPayload
): Promise<RespuestaRecepcionMutacion> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaRecepcionMutacion>(
      session,
      `/api/v1/recepciones/${idRecepcion}`,
      { method: 'PUT', body: payload }
    );
  } catch (error) {
    console.error('Error al actualizar recepción:', error);
    return { ok: false, error: (error as Error).message || 'Error al actualizar la recepción' };
  }
}

export interface RespuestaSoftDelete {
  ok: boolean;
  message?: string;
  error?: string;
}

export async function eliminarInstrumentoRecepcion(
  idRecepcion: number,
  idInstrumento: number
): Promise<RespuestaSoftDelete> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaSoftDelete>(
      session,
      `/api/v1/recepciones/${idRecepcion}/instrumentos/${idInstrumento}`,
      { method: 'DELETE' }
    );
  } catch (error) {
    console.error('Error al eliminar instrumento:', error);
    return { ok: false, error: (error as Error).message || 'Error al eliminar el instrumento' };
  }
}

export interface HistorialCambioItem {
  id: string;
  numeroVersion: string;
  fechaCambio: string;
  descripcion: string;
  observaciones: string | null;
  aprobo: string;
  idCotizacion: number;
  createdAt: string;
}

export async function getHistorialRecepcion(
  idRecepcion: number
): Promise<HistorialCambioItem[]> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: HistorialCambioItem[] }>(
      session,
      `/api/v1/recepciones/${idRecepcion}/historial`
    );
    return res.data ?? [];
  } catch (error) {
    console.error('Error al obtener historial de recepción:', error);
    return [];
  }
}
