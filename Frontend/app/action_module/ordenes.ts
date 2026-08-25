// app/actions/ordenes.actions.ts
'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';
import type {
  OrdenTrabajoModel,
  ClienteModel,
  UsuarioModel,
  RolesModel,
  TarifaModel,
  DocumentoModel,
} from '@/tipos/entidades';

type UsuarioConRolModel = UsuarioModel & { rol: RolesModel };

export interface DatosInicialesOrdenes {
  ordenes: OrdenTrabajoModel[];
  clientes: ClienteModel[];
  usuarios: UsuarioConRolModel[];
  roles: RolesModel[];
  tarifas: TarifaModel[];
  version: DocumentoModel[];
}

export async function obtenerDatosIniciales(): Promise<DatosInicialesOrdenes> {
  try {
    const session = await auth();
    return await fastifyRequest<DatosInicialesOrdenes>(
      session,
      '/api/v1/ordenes/datos-iniciales'
    );
  } catch (error) {
    console.error('Error cargando datos iniciales:', error);
    // Devuelve arreglos vacíos explícitos en lugar de undefined o lanzar throw
    return {
      ordenes: [],
      clientes: [],
      usuarios: [],
      roles: [],
      tarifas: [],
      version: [],
    };
  }
}

import {CotizacionVinculable,ImportarOTPayload,RespuestaWorkerJob,PollingJobStatus} from "@/tipos/importaciones"

export async function obtenerCotizacionesVinculables(): Promise<CotizacionVinculable[]> {
  try {
    const session = await auth();
    // Este endpoint debería retornar las cotizaciones aprobadas/enviadas que no tienen OT
    return await fastifyRequest<CotizacionVinculable[]>(session, '/api/v1/cotizaciones/sin-ot');
  } catch (error) {
    console.error('Error cargando cotizaciones vinculables:', error);
    return [];
  }
}

// 2. Enviar la orden al Worker
export async function procesarImportacionOTAction(payload: ImportarOTPayload): Promise<RespuestaWorkerJob> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaWorkerJob>(
      session,
      '/api/v1/ordenes/importar-ote',
      {
        method: 'POST',
        body: payload,
      }
    );
  } catch (error: any) {
    console.error('Error enviando OT al worker:', error);
    return { ok: false, error: error.message };
  }
}

// 3. Polling para revisar si el Worker terminó
export async function consultarEstadoJobAction(idJob: string): Promise<PollingJobStatus> {
  try {
    const session = await auth();
    return await fastifyRequest<PollingJobStatus>(session, `/api/v1/jobs/${idJob}`);
  } catch (error) {
    return { status: 'FAILED', data: { error: 'Error de red consultando el Job' } };
  }
}

export interface InstrumentoConsolidar {
  idDetalle?: number;
  item: number;
  tipoServicio: string;
  instrumento: string;
  fabricante: string | null;
  modelo: string | null;
  serie: string | null;
  codigoInventario: string | null;
  ubicacion: string | null;
  puntosCalibrar?: string[];
  asignado: number;
  declaracionConformidad: boolean;
}

export interface ConsolidarOtPayload {
  responsableUsc: string | null;
  fechaDiligenciamiento: string | null;
  requiereAnexo: string;
  observacionesGenerales: string | null;
  lugarCalibracion: string;
  estadoOrden: string;
  instrumentos: InstrumentoConsolidar[];
}

// Reutilizamos el tipo RespuestaWorkerJob si tu endpoint de Fastify devuelve { ok, id_job }
export async function consolidarOrdenTrabajoAction(
  idOt: string | number,
  payload: ConsolidarOtPayload
): Promise<RespuestaWorkerJob> {
  try {
    const session = await auth();
    // Enviamos el PUT al endpoint de Fastify que creamos anteriormente
    return await fastifyRequest<RespuestaWorkerJob>(
      session,
      `/api/v1/ordenes/${idOt}/consolidar`,
      {
        method: 'PUT',
        body: payload,
      }
    );
  } catch (error: any) {
    console.error('Error consolidando OT:', error);
    return { ok: false, error: error.message || 'Error de conexión con el servidor' };
  }
}