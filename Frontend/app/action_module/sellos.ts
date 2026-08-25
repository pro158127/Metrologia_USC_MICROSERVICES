'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError, BASE_URL } from "@/app/lib/api/fastifyClient";
import { generarTokenBackend } from "@/app/lib/auth-token";
import type { SelloModel } from "@/tipos/entidades";
import type { SealConfig, PlantillaSelloDTO } from "@/tipos/sellos";

/**
 * Obtiene todos los sellos registrados (tabla `sellos`).
 */
export async function obtenerSellos(): Promise<{ success: boolean; data?: SelloModel[]; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: SelloModel[] }>(
      session,
      '/api/v1/sellos/catalogo'
    );
    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerSellos:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar los sellos' };
  }
}

// ============================================================================
// Plantillas de Sello (modelo plantillas_sellos)
// ============================================================================

function dtoToSealConfig(d: PlantillaSelloDTO): SealConfig {
  return {
    id: Number(d.id),
    nombre: d.nombre ?? '',
    descripcion: d.descripcion ?? undefined,
    templatePdfKey: d.templatePdfKey ?? null,
    templatePdfUrl: d.templatePdfUrl ?? null,
    templatePdfWidth: d.templatePdfWidth ?? null,
    templatePdfHeight: d.templatePdfHeight ?? null,
    documentArea: d.documentArea ?? null,
    watermarkAreas: Array.isArray(d.watermarkAreas) ? d.watermarkAreas : [],
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString().slice(0, 10) : undefined,
  };
}

/**
 * Envía un multipart autenticado al backend (mismo patrón que crearNuevaVersion en template.ts).
 */
async function multipartFetch<T = unknown>(
  path: string,
  method: 'POST' | 'PUT',
  formData: FormData
): Promise<T> {
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

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new FastifyHttpError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

function buildPlantillaFormData(config: SealConfig, file?: File): FormData {
  const formData = new FormData();
  formData.append('nombre', config.nombre ?? '');
  if (config.descripcion) formData.append('descripcion', config.descripcion);
  formData.append('documentArea', config.documentArea ? JSON.stringify(config.documentArea) : 'null');
  formData.append('watermarkAreas', JSON.stringify(config.watermarkAreas ?? []));
  if (file) formData.append('file', file);
  return formData;
}

export async function obtenerPlantillasSellos(): Promise<{ success: boolean; data?: SealConfig[]; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: PlantillaSelloDTO[] }>(
      session,
      '/api/v1/sellos'
    );
    const data = (Array.isArray(res.data) ? res.data : [])
      .filter((d) => typeof d?.id === 'number')
      .map(dtoToSealConfig);
    return { success: true, data };
  } catch (error) {
    console.error('Error en obtenerPlantillasSellos:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al consultar las plantillas de sello' };
  }
}

export async function obtenerPlantillaSello(id: number): Promise<{ success: boolean; data?: SealConfig; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: PlantillaSelloDTO }>(
      session,
      `/api/v1/sellos/${id}`
    );
    return { success: true, data: dtoToSealConfig(res.data) };
  } catch (error) {
    console.error('Error en obtenerPlantillaSello:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al consultar la plantilla de sello' };
  }
}

export async function crearPlantillaSello(
  config: SealConfig,
  file?: File
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const formData = buildPlantillaFormData(config, file);
    const data = await multipartFetch('/api/v1/sellos', 'POST', formData);
    return { success: true, data };
  } catch (error) {
    console.error('Error en crearPlantillaSello:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al crear la plantilla de sello' };
  }
}

export async function actualizarPlantillaSello(
  id: number,
  config: SealConfig,
  file?: File
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const formData = buildPlantillaFormData(config, file);
    const data = await multipartFetch(`/api/v1/sellos/${id}`, 'PUT', formData);
    return { success: true, data };
  } catch (error) {
    console.error('Error en actualizarPlantillaSello:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al actualizar la plantilla de sello' };
  }
}

export async function eliminarPlantillaSello(id: number): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    await fastifyRequest<{ success: boolean }>(session, `/api/v1/sellos/${id}`, { method: 'DELETE' });
    return { success: true };
  } catch (error) {
    console.error('Error en eliminarPlantillaSello:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al eliminar la plantilla de sello' };
  }
}

// ============================================================================
// Pipeline asíncrono de sellado (BullMQ worker)
// ============================================================================

export interface EstamparPdfParams {
  selloId: number;
  file: File;
  outputDocumentName?: string;
}

export interface JobSelloInfo {
  status: string;
  outputKey?: string | null;
  error?: string;
}

export async function estamparPdf(params: EstamparPdfParams): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    const formData = new FormData();
    formData.append('selloId', String(params.selloId));
    formData.append('file', params.file);
    formData.append('outputDocumentName', params.outputDocumentName ?? params.file.name);

    const res = await multipartFetch<{ success: boolean; data?: { jobId?: string; status?: string } }>(
      '/api/v1/sellos/stamp',
      'POST',
      formData
    );

    const jobId = res.data?.jobId;
    if (!jobId) {
      return { success: false, error: 'No se recibió jobId del servidor' };
    }
    return { success: true, jobId };
  } catch (error) {
    console.error('Error en estamparPdf:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al encolar el sellado del PDF' };
  }
}

export async function consultarJobSello(jobId: string): Promise<{ success: boolean; data?: JobSelloInfo; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: JobSelloInfo }>(
      session,
      `/api/v1/sellos/job/${jobId}`
    );
    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en consultarJobSello:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno al consultar el estado del sellado' };
  }
}
