'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError, BASE_URL } from '@/app/lib/api/fastifyClient';
import { generarTokenBackend } from '@/app/lib/auth-token';
import type {
  MapeoExcel,
  MappingConfig,
  InputSchema,
  SnapshotResponse,
  MapeoConfigTarifas,
  ConsolidarTarifasResponse,
  EstadoJobTarifasResponse,
  GeneracionPlantillaPayload,
  GeneracionPlantillaResponse,GeneracionPlantillatest
} from '@/tipos/plantillas';
import type { RespuestaVersion, } from 'backend/src/routes/plantillas.schemas';
import type {generarUrlResponseSchema} from 'backend/src/routes/schema.sign_document'
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

// ============================================================================
// PIPELINE DE TARIFAS: CONSOLIDAR (dispara worker) + ESTADO DEL JOB (polling)
// ============================================================================

export async function consolidarTarifas(
  versionId: number,
  mapeoConfig: MapeoConfigTarifas
): Promise<ConsolidarTarifasResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<ConsolidarTarifasResponse>(
      session,
      `/api/v1/plantillas/version/${versionId}/consolidar`,
      { method: 'POST', body: { mapeoConfig } }
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - consolidarTarifas]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al consolidar las tarifas.' };
  }
}
type tipos = 'cotizacion' | 'recepcion' | 'ordenes';

export async function consultar_outputshema(tipo: tipos): Promise<{response: RespuestaVersion}> {
  let plantillaId: number;

  // 1. Asignar el ID de plantilla según el tipo requerido
  switch (tipo) {
    case 'cotizacion':
      plantillaId = 1;
      break;
    case 'ordenes':
      plantillaId = 2;
      break;
    case 'recepcion':
      plantillaId = 3;
      break;
    default:
      // Salvaguarda por si TypeScript es ignorado en runtime
      throw new Error(`Tipo de plantilla no reconocido: ${tipo}`); 
  }

  // 2. Ejecutar la llamada HTTP al endpoint
  const session = await auth();
  
  // CORRECCIÓN 1: El genérico ahora refleja lo que realmente envía el backend
  const response = await fastifyRequest<RespuestaVersion>(
    session,
    `/api/v1/plantillas/${plantillaId}/version`,
    { method: 'GET' } 
  );

  if (!response) {
    throw new Error(`Fallo al obtener la versión de la plantilla. Status: 400`);
  }

  // CORRECCIÓN 2: Leemos directamente data y success de la respuesta
  return {
    response: {
      data: response.data,
      success: response.success
      
    }
  };
}
export async function consultarEstadoJob(
  versionId: number
): Promise<EstadoJobTarifasResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<EstadoJobTarifasResponse>(
      session,
      `/api/v1/plantillas/version/${versionId}/estado-job`
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - consultarEstadoJob]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al consultar el estado del job.' };
  }
}




// ============================================================================
// 1. ENDPOINT DE TEST / REVIEW
// ============================================================================
export async function testReviewGeneracionPlantilla(
  payload: GeneracionPlantillatest
): Promise<GeneracionPlantillaResponse> {
  try {
    const session = await auth();
    return await fastifyRequest<GeneracionPlantillaResponse>(
      session,
      // Define la ruta exacta que tendrá tu controlador en Fastify
      `/api/v1/plantillas/generacion/test-review`, 
      { method: 'POST', body: payload }
    );
  } catch (error) {
    console.error('[SERVER ACTION ERROR - testReviewGeneracionPlantilla]:', error);
    if (error instanceof FastifyHttpError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Error interno al generar el review de la plantilla.' };
  }
}

// ============================================================================
// 2. ENDPOINT DE GENERACIÓN REAL (PRODUCCIÓN)
// ============================================================================

import type { GenerarExcelBody, RespuestaGeneracionEncolada } from 'backend/src/routes/plantillas-generacion.schemas';
export async function generarExcelPlantilla(
  payload: GenerarExcelBody
): Promise<RespuestaGeneracionEncolada> {
  try {
    const session = await auth();
    const response = await fastifyRequest<RespuestaGeneracionEncolada>(
      session,
      '/api/v1/plantillas/generar-excel',
      { method: 'POST', body: payload }
    );
    return { 
      mensaje: response.mensaje, 
      ok: true, 
      id_job: response.id_job 
    };
  } catch (error) {
    console.error('[SERVER ACTION ERROR - generarExcelPlantilla]:', error);
    
    // Capturamos el mensaje exacto que viene de tu backend en data.error
    const mensajeError = error instanceof FastifyHttpError 
      ? error.message 
      : 'Error interno al encolar la generación del Excel.';

    // Retornamos la misma estructura (caja azul) para no romper la UI
    return { 
      ok: false, 
      mensaje: mensajeError 
    } as RespuestaGeneracionEncolada; 
  }
}
import type {responseQuote} from 'backend/src/routes/schema-checkStatus'
export async function getQuoteStatus(id: number | string): Promise<responseQuote> {
  try {
    const session = await auth();
    const response = await fastifyRequest<responseQuote>(
      session,
      `/api/quotes/${id}/status`,
      { method: 'GET' }
    );
    console.log("DATA",response)
    return response;
  } catch (error) {
    console.error('[SERVER ACTION ERROR - getQuoteStatus]:', error);
    if (error instanceof FastifyHttpError) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: 'Error interno al consultar el estado de la cotización.' };
  }
}

export async function firmador(s3Key: string): Promise<{ succes: boolean; url: string | null; error?: string | unknown }> {
  try {
    // 1. Guard clause para evitar solicitudes innecesarias si la clave viene vacía
    if (!s3Key || typeof s3Key !== 'string' || s3Key.trim() === '') {
      return { succes: false, url: null, error: 'La clave s3Key no es válida' };
    }

    const session = await auth();

    // 2. Inyección correcta del body en la petición
    const response = await fastifyRequest<generarUrlResponseSchema>(
      session,
      `/api/v1/archivos/generar-url`,
      { 
        method: 'POST',
        body: { s3Key } // ✅ Ahora sí enviamos el objeto esperado por Zod
      }
    );

    console.log("DATA FIRMA:", response);
    return { succes: true, url: response.url ?? "" };
  } catch (error) {
    console.error('[SERVER ACTION ERROR - firmador]:', error);
    if (error instanceof FastifyHttpError) {
      return { succes: false, error: error.message, url: null };
    }
    return { succes: false, error: error, url: null };
  }
}