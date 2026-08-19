'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError } from '@/app/lib/api/fastifyClient';
import type { MapeoExcel } from '@/tipos/plantillas';

// Tipado estricto para el parámetro de entrada
interface GetPlantillaParams {
  idPlantilla: number;
  version?: number;
}

// Tipado explícito de la respuesta para el cliente
export interface PlantillaWithVersionResponse {
  success: boolean;
  data?: {
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versionActual: {
      idVersionPlantilla: number;
      version: number;
      mapeoExcelJson: MapeoExcel | null;
      createdAt: Date;
      documento: {
        idDocumento: number;
        nombre: string;
        rutaUrl: string;
        proveedor: string;
        mimeType: string;
      } | null;
    } | null;
  };
  error?: string;
}

/**
 * Server Action para obtener una plantilla con su versión y documento asociado.
 *
 * @param params Objetos con idPlantilla y versión opcional.
 * @returns Objeto estructurado con el estado de la operación y los datos devueltos.
 */
export async function getPlantillaConDocumento(
  params: GetPlantillaParams
): Promise<PlantillaWithVersionResponse> {
  const { idPlantilla, version } = params;

  if (!idPlantilla || typeof idPlantilla !== 'number') {
    return {
      success: false,
      error: 'El idPlantilla es requerido y debe ser un número válido.',
    };
  }

  try {
    const session = await auth();
    const path = `/api/v1/plantillas/${idPlantilla}${version ? `?version=${version}` : ''}`;

    return await fastifyRequest<PlantillaWithVersionResponse>(session, path);
  } catch (error) {
    console.error('[SERVER ACTION ERROR - getPlantillaConDocumento]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: 'Error interno del servidor al consultar la plantilla.',
    };
  }
}

// Tipado explícito para la respuesta unificada de la consulta
export interface PlantillasCompletasResponse {
  success: boolean;
  data?: Array<{
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versiones: Array<{
      idVersionPlantilla: number;
      idPlantilla: number;
      version: number;
      mapeoExcelJson: MapeoExcel | null;
      createdby: {
        nombre: string;
      };
      createdAt: Date;
      iddocumentos: number | null;
      documento: {
        idDocumento: number;
        nombre: string;
        rutaUrl: string;
        proveedor: string;
        mimeType: string;
        createdAt: Date;
      } | null;
    }>;
  }>;
  error?: string;
}

/**
 * Consulta todas las plantillas registradas, incluyendo la totalidad
 * de sus versiones y el documento físico enlazado en MinIO a cada versión.
 */
export async function getTodasLasPlantillasCompletas(): Promise<PlantillasCompletasResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<PlantillasCompletasResponse>(session, '/api/v1/plantillas');
  } catch (error) {
    console.error('[SERVER ACTION ERROR - getTodasLasPlantillasCompletas]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: 'Error interno al obtener la totalidad de plantillas y sus documentos.',
    };
  }
}
