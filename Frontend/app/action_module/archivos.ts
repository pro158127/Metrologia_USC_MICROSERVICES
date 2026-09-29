'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';

/** Genera una URL firmada (15 min) para descargar/visualizar un objeto de MinIO. */
export async function generarUrlArchivo(s3Key: string): Promise<string | null> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; url?: string }>(
      session,
      '/api/v1/archivos/generar-url',
      { method: 'POST', body: { s3Key } }
    );
    return res.url ?? null;
  } catch (error) {
    console.error('Error al generar URL firmada:', error);
    return null;
  }
}

export interface SubirArchivoResult {
  ok: boolean;
  rutaUrl?: string;
  error?: string;
}

/** Sube un archivo a MinIO (con autenticación) y devuelve su key. */
export async function subirArchivoDocumento(
  file: File,
  nombreArchivo?: string
): Promise<SubirArchivoResult> {
  try {
    const session = await auth();
    const form = new FormData();
    form.append('file', file, file.name);
    if (nombreArchivo) form.append('nombreArchivo', nombreArchivo);

    const res = await fastifyRequest<{
      rutaUrl?: string;
      url?: string;
      data?: { rutaUrl?: string };
    }>(session, '/api/v1/documentos/upload', { method: 'POST', body: form });

    const rutaUrl = res.rutaUrl ?? res.url ?? res.data?.rutaUrl;
    return { ok: true, rutaUrl };
  } catch (error) {
    console.error('Error al subir archivo:', error);
    return { ok: false, error: (error as Error).message };
  }
}
