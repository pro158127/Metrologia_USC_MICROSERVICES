'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';
import type { InstrumentoAsignado } from '@/tipos/calibracion';

/** Instrumentos asignados al técnico autenticado (únicamente). */
export async function getMisInstrumentos(): Promise<InstrumentoAsignado[]> {
  try {
    const session = await auth();
    return await fastifyRequest<InstrumentoAsignado[]>(
      session,
      '/api/v1/calibraciones/mis-instrumentos'
    );
  } catch (error) {
    console.error('Error al obtener instrumentos asignados:', error);
    return [];
  }
}

export interface SubirCertificadoResult {
  ok: boolean;
  error?: string;
  idCertificado?: number;
  rutaUrl?: string;
}

/**
 * Sube el PDF del técnico. Ese mismo PDF es el que el worker sellará al aprobar
 * el certificado.
 */
export async function subirCertificadoCalibracion(
  idInstrumento: number,
  file: File
): Promise<SubirCertificadoResult> {
  try {
    const session = await auth();
    const form = new FormData();
    form.append('certificado', file, file.name);

    const res = await fastifyRequest<{
      ok: boolean;
      data: { idCalibracion: number; idCertificado: number; rutaUrl: string };
    }>(session, `/api/v1/calibraciones/${idInstrumento}/certificado`, {
      method: 'POST',
      body: form,
    });

    return { ok: true, idCertificado: res.data?.idCertificado, rutaUrl: res.data?.rutaUrl };
  } catch (error) {
    console.error('Error al subir certificado de calibración:', error);
    return { ok: false, error: (error as Error).message };
  }
}
