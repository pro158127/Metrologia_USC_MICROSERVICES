'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";
import type {
  CotizacionModel,
  OrdenTrabajoModel,
  CertificadoModel,
  FacturaModel,
  UsuarioModel,
} from "@/tipos/entidades";

export interface DatosReportes {
  cotizaciones: CotizacionModel[];
  ordenes: OrdenTrabajoModel[];
  certificados: CertificadoModel[];
  facturas: FacturaModel[];
  usuarios: UsuarioModel[];
}

/**
 * Obtiene los datos agregados necesarios para el módulo de Reportes
 * usando concurrencia (Promise.all).
 */
export async function obtenerDatosReportes(): Promise<{
  success: boolean;
  data?: DatosReportes;
  error?: string;
}> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: DatosReportes }>(
      session,
      '/api/v1/reportes'
    );

    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerDatosReportes:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar los reportes' };
  }
}
