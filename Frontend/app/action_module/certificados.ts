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
