'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";
import type {
  CertificadoModel,
  CalibracionModel,
  RecepcionEquipoDetalleModel,
  OrdenTrabajoModel,
  ClienteModel,
} from "@/tipos/entidades";

export interface CertificadosConContexto {
  certificados: CertificadoModel[];
  calibraciones: CalibracionModel[];
  instrumentos: RecepcionEquipoDetalleModel[];
  ordenes: OrdenTrabajoModel[];
  clientes: ClienteModel[];
}

/**
 * Obtiene certificados junto con el contexto necesario (calibración, instrumento,
 * orden de trabajo y cliente) usando concurrencia.
 */
export async function obtenerCertificadosConContexto(): Promise<{
  success: boolean;
  data?: CertificadosConContexto;
  error?: string;
}> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: CertificadosConContexto }>(
      session,
      '/api/v1/certificados'
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerCertificadosConContexto:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar los certificados' };
  }
}

export interface CertificadoRevisionItem {
  idCertificado: number;
  codigo: string;
  estadoRevision: string;
  motivoRechazo: string | null;
  idDocumento: number;
  idPlantillaSello: number | null;
  idCalibracion: number;
  idInstrumento: number | null;
  instrumento: string;
  estampilla: string;
  serie: string | null;
  marca: string | null;
  modelo: string | null;
  idOrdenTrabajo: number | null;
  codigoOT: string;
  cliente: string;
  tecnico: string;
  tipoServicio: string | null;
  datosTecnicos: unknown;
  createdAt: string | null;
  acreditado: boolean;
}

/** Bandeja de revisión de certificados con contexto (instrumento, OT, cliente, técnico). */
export async function obtenerCertificadosRevision(): Promise<CertificadoRevisionItem[]> {
  try {
    const session = await auth();
    return await fastifyRequest<CertificadoRevisionItem[]>(
      session,
      '/api/v1/certificados/revision'
    );
  } catch (error) {
    console.error('Error en obtenerCertificadosRevision:', error);
    return [];
  }
}

export interface RespuestaMutacionCertificado {
  ok: boolean;
  message?: string;
  error?: string;
  id_job?: string;
}

/** Aprueba el certificado e infiere la plantilla de sello (acreditado/no acreditado). */
export async function aprobarCertificado(
  idCertificado: number,
  selloId?: number
): Promise<RespuestaMutacionCertificado> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaMutacionCertificado>(
      session,
      `/api/v1/certificados/${idCertificado}/aprobar`,
      { method: 'POST', body: { selloId } }
    );
  } catch (error) {
    console.error('Error al aprobar certificado:', error);
    return { ok: false, error: (error as Error).message };
  }
}

/** Rechaza el certificado (motivo obligatorio) y devuelve el flujo al técnico. */
export async function rechazarCertificado(
  idCertificado: number,
  descripcion: string
): Promise<RespuestaMutacionCertificado> {
  try {
    const session = await auth();
    return await fastifyRequest<RespuestaMutacionCertificado>(
      session,
      `/api/v1/certificados/${idCertificado}/rechazar`,
      { method: 'POST', body: { descripcion } }
    );
  } catch (error) {
    console.error('Error al rechazar certificado:', error);
    return { ok: false, error: (error as Error).message };
  }
}
