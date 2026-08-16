'use server';

import { prisma } from "@/app/lib/data_base/prisma";
import type { SelloModel } from "@/tipos/entidades";

/**
 * Obtiene todos los sellos registrados (tabla `sellos`).
 */
export async function obtenerSellos(): Promise<{ success: boolean; data?: SelloModel[]; error?: string }> {
  try {
    const sellos = await prisma.sello.findMany({
      orderBy: { idSello: 'asc' },
    });
    return { success: true, data: sellos };
  } catch (error) {
    console.error('Error en obtenerSellos:', error);
    return { success: false, error: 'Error interno del servidor al consultar los sellos' };
  }
}
