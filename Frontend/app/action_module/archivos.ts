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
