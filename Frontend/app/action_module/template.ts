'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError, BASE_URL } from '@/app/lib/api/fastifyClient';
import { generarTokenBackend } from '@/app/lib/auth-token';
import type { MapeoExcel, MappingConfig, InputSchema, SnapshotResponse } from '@/tipos/plantillas';

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
      inputSchema: InputSchema | null;
      mappingConfig: MappingConfig | null;
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

// ============================================================================
// SNAPSHOT UNIVER (generado en backend, cacheado en Redis)
// ============================================================================

export async function getSnapshot(idPlantilla: number, versionId: number): Promise<SnapshotResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<SnapshotResponse>(
      session,
      `/api/v1/plantillas/${idPlantilla}/version/${versionId}/snapshot`
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - getSnapshot]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al obtener el snapshot.' };
  }
}

export async function pollSnapshotJob(jobId: string): Promise<SnapshotResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<SnapshotResponse>(
      session,
      `/api/v1/plantillas/job/${encodeURIComponent(jobId)}`
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - pollSnapshotJob]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al consultar el estado del snapshot.' };
  }
}

// ============================================================================
// GUARDAR MAPPING CONFIG (ACID + optimistic lock)
// ============================================================================

export interface SaveMappingParams {
  versionId: number;
  version: number;
  mappingConfig: MappingConfig;
  inputSchema?: InputSchema;
}

export async function saveMappingConfig(params: SaveMappingParams): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    return await fastifyRequest<{ success: boolean; error?: string }>(
      session,
      `/api/v1/plantillas/version/${params.versionId}/mapping`,
      {
        method: 'PUT',
        body: {
          version: params.version,
          mappingConfig: params.mappingConfig,
          inputSchema: params.inputSchema,
        },
      }
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - saveMappingConfig]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al guardar el mapeo.' };
  }
}

// ============================================================================
// ACTUALIZAR FORMATO: NUEVA VERSIÓN (upload .xlsx → MinIO + nueva versión)
// ============================================================================

export interface NuevaVersionParams {
  idPlantilla: number;
  file: File;
  inputSchema?: InputSchema | null;
  templateType?: string;
}

export async function crearNuevaVersion(params: NuevaVersionParams): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new FastifyHttpError(401, 'No autenticado');
    }

    const id = session.user.id_user ?? session.user.id ?? '';
    const token = await generarTokenBackend({
      sub: String(id),
      email: session.user.email ?? '',
      user: {
        id: String(id),
        email: session.user.email ?? '',
        permissions: { permisos: session.user.permissions?.permisos ?? {} },
      },
    });

    const formData = new FormData();
    formData.append('fileName', params.file.name);
    if (params.templateType) formData.append('templateType', params.templateType);
    if (params.inputSchema) formData.append('inputSchema', JSON.stringify(params.inputSchema));
    formData.append('file', params.file);

    const res = await fetch(`${BASE_URL}/api/v1/plantillas/${params.idPlantilla}/version`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new FastifyHttpError(res.status, data.error ?? `HTTP ${res.status}`);
    }
    return data as { success: boolean; error?: string };
  } catch (error) {
    console.error('[SERVER ACTION ERROR - crearNuevaVersion]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al crear la nueva versión.' };
  }
}
