'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";
import type { ParametroSistemaModel } from "@/tipos/entidades";

/**
 * Obtiene todos los parámetros del sistema (tabla `parametros_sistema`).
 */
export async function obtenerParametrosSistema(): Promise<{
  success: boolean;
  data?: ParametroSistemaModel[];
  error?: string;
}> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: ParametroSistemaModel[] }>(
      session,
      '/api/v1/parametros-sistema'
    );
    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerParametrosSistema:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar los parámetros' };
  }
}
