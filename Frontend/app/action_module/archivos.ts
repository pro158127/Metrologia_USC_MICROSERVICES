'use server';

import { auth } from '@/app/Login/types/auth';
import { generarTokenBackend } from '@/app/lib/auth-token';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';

/**
 * Genera una URL de visualización/descarga que sirve el archivo a través del
 * backend (GET /api/v1/documentos/stream) en lugar de exponer URLs firmadas de
 * MinIO. Evita los problemas de firma/host del túnel y de CORS.
 */
export async function generarUrlArchivo(s3Key: string): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;

    const idUsuario = session.user.id_user ?? session.user.id ?? '';
    const token = await generarTokenBackend({ sub: String(idUsuario) });

    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    return `${base}/api/v1/documentos/stream?key=${encodeURIComponent(s3Key)}&token=${encodeURIComponent(token)}`;
  } catch (error) {
    console.error('Error al generar URL de archivo:', error);
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
