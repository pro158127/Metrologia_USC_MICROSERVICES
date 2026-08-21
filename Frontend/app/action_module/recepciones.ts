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
