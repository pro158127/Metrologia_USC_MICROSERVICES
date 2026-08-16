'use server';

import { prisma } from "@/app/lib/data_base/prisma";
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
    const parametros = await prisma.parametroSistema.findMany({
      orderBy: { idParametro: 'asc' },
    });
    return { success: true, data: parametros };
  } catch (error) {
    console.error('Error en obtenerParametrosSistema:', error);
    return { success: false, error: 'Error interno del servidor al consultar los parámetros' };
  }
}
