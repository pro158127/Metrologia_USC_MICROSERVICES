'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";
import type { SelloModel } from "@/tipos/entidades";

/**
 * Obtiene todos los sellos registrados (tabla `sellos`).
 */
export async function obtenerSellos(): Promise<{ success: boolean; data?: SelloModel[]; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: SelloModel[] }>(
      session,
      '/api/v1/sellos'
    );
    return { success: true, data: res.data };
  } catch (error) {
    console.error('Error en obtenerSellos:', error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: 'Error interno del servidor al consultar los sellos' };
  }
}
