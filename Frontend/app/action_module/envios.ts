'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';

export interface CertificadoEnvio {
  idCertificado: number;
  codigo: string;
  instrumento: string;
  estampilla: string | null;
  estadoRevision: string;
  rutaUrl: string | null;
  idDocumento: number;
}

export interface ComprobanteEnvio {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
}

export interface DocumentosEnvio {
  idOrdenTrabajo: number;
  codigoOT: string;
  cliente: string;
  correo: string | null;
  todosAprobados: boolean;
  certificados: CertificadoEnvio[];
  comprobantes: ComprobanteEnvio[];
}

export async function getDocumentosEnvio(idOT: number): Promise<DocumentosEnvio | null> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: DocumentosEnvio }>(
      session,
      `/api/v1/ordenes/${idOT}/documentos-envio`
    );
    return res.data ?? null;
  } catch (error) {
    console.error('Error al obtener documentos de envío:', error);
    return null;
  }
}

export interface RespuestaEnvio {
  ok: boolean;
  message?: string;
  error?: string;
  id_job?: string;
  rutaUrl?: string;
}

export async function subirComprobante(
  idOT: number,
  file: File
): Promise<RespuestaEnvio> {
  try {
    const session = await auth();
    const form = new FormData();
    form.append('comprobante', file, file.name);
    const res = await fastifyRequest<{ ok: boolean; data: { rutaUrl: string } }>(
      session,
      `/api/v1/ordenes/${idOT}/comprobante`,
      { method: 'POST', body: form }
    );
    return { ok: true, rutaUrl: res.data?.rutaUrl };
  } catch (error) {
    console.error('Error al subir comprobante:', error);
    return { ok: false, error: (error as Error).message };
  }
}

export async function enviarCertificados(idOT: number): Promise<RespuestaEnvio> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaEnvio>(
      session,
      `/api/v1/ordenes/${idOT}/enviar-certificados`,
      { method: 'POST' }
    );
  } catch (error) {
    console.error('Error al enviar certificados:', error);
    return { ok: false, error: (error as Error).message };
  }
}

// ============================================================================
// Cotización (agrupa hijas)
// ============================================================================

export interface OTEnvioCotizacion {
  idOrdenTrabajo: number;
  codigo: string;
  sitioCalibracion: string | null;
}

export interface CertificadoEnvioCotizacion extends CertificadoEnvio {
  codigoOT: string;
}

export interface DocumentosEnvioCotizacion {
  idCotizacion: number;
  codigoCotizacion: string | null;
  masterCodigo: string | null;
  cliente: string;
  correo: string | null;
  todosAprobados: boolean;
  ots: OTEnvioCotizacion[];
  certificados: CertificadoEnvioCotizacion[];
  comprobantes: ComprobanteEnvio[];
}

export async function getDocumentosEnvioCotizacion(
  idCotizacion: number
): Promise<DocumentosEnvioCotizacion | null> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: DocumentosEnvioCotizacion }>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/documentos-envio`
    );
    return res.data ?? null;
  } catch (error) {
    console.error('Error al obtener documentos de envío por cotización:', error);
    return null;
  }
}

export async function subirComprobanteCotizacion(
  idCotizacion: number,
  file: File
): Promise<RespuestaEnvio> {
  try {
    const session = await auth();
    const form = new FormData();
    form.append('comprobante', file, file.name);
    const res = await fastifyRequest<{ ok: boolean; data: { rutaUrl: string } }>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/comprobante`,
      { method: 'POST', body: form }
    );
    return { ok: true, rutaUrl: res.data?.rutaUrl };
  } catch (error) {
    console.error('Error al subir comprobante por cotización:', error);
    return { ok: false, error: (error as Error).message };
  }
}

export async function enviarCertificadosCotizacion(idCotizacion: number): Promise<RespuestaEnvio> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaEnvio>(
      session,
      `/api/v1/cotizaciones/${idCotizacion}/enviar-certificados`,
      { method: 'POST' }
    );
  } catch (error) {
    console.error('Error al enviar certificados por cotización:', error);
    return { ok: false, error: (error as Error).message };
  }
}
