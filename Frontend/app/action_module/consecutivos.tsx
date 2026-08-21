"use server";

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest } from "@/app/lib/api/fastifyClient";

type TipoEntidad = "COT" | "OT" | "REC";

interface GenerarCodigoParams {
  tipo: TipoEntidad;
  codigoBaseExistente?: string; // Pasar solo si se desea generar una NUEVA VERSIÓN de un código previo
}

/**
 * Genera consecutivos con formato: PREFIJO-AA-XXXXZ
 * Ejemplo: COT-26-0001A -> Nueva versión: COT-26-0001B
 */
export async function generarConsecutivo({
  tipo,
  codigoBaseExistente,
}: GenerarCodigoParams): Promise<string> {
  const session = await auth();
  const res = await fastifyRequest<{ codigo: string }>(
    session,
    '/api/v1/consecutivos',
    {
      method: 'POST',
      body: { tipo, codigoBaseExistente },
    }
  );

  return res.codigo;
}
