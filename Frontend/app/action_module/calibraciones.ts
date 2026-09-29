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

export interface GuardarDatosCalibracionResult {
  ok: boolean;
  error?: string;
}

/** Guarda/actualiza los datos técnicos (JSON) de la calibración. */
export async function guardarDatosCalibracion(
  idInstrumento: number,
  datosTecnicos: Record<string, unknown>,
  observaciones?: string
): Promise<GuardarDatosCalibracionResult> {
  try {
    const session = await auth();
    await fastifyRequest(session, `/api/v1/calibraciones/${idInstrumento}`, {
      method: 'PUT',
      body: { datosTecnicos, observaciones },
    });
    return { ok: true };
  } catch (error) {
    console.error('Error al guardar datos de calibración:', error);
    return { ok: false, error: (error as Error).message };
  }
}

export interface SubirCertificadoResult {
  ok: boolean;
  error?: string;
  idCertificado?: number;
  rutaUrl?: string;
}

/** Sube el PDF del certificado y registra documento/versión/certificado. */
export async function subirCertificadoCalibracion(
  idInstrumento: number,
  file: File,
  meta?: {
    datosTecnicos?: Record<string, unknown>;
    observaciones?: string;
    estampilla?: string;
  }
): Promise<SubirCertificadoResult> {
  try {
    const session = await auth();
    const form = new FormData();
    form.append('certificado', file, file.name);
    if (meta?.datosTecnicos) form.append('datosTecnicos', JSON.stringify(meta.datosTecnicos));
    if (meta?.observaciones) form.append('observaciones', meta.observaciones);
    if (meta?.estampilla) form.append('estampilla', meta.estampilla);

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
