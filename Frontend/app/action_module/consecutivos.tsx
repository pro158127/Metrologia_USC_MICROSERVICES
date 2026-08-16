"use server";

import prisma from "../lib/data_base/prisma";

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
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  const prefijoAnno = `${tipo}-${yearSuffix}-`;

  return await prisma.$transaction(async (tx) => {
    // CASO 1: Generar nueva versión de un código existente (e.g., COT-26-0001A -> COT-26-0001B)
    if (codigoBaseExistente) {
      const match = codigoBaseExistente.match(/^([A-Z]+-\d{2}-\d{4})([A-Z])$/);
      if (!match) {
        throw new Error("El código base proporcionado no cumple con el formato requerido (PRE-AA-XXXXZ).");
      }

      const [, raiz, letraActual] = match;
      const siguienteLetra = obtenerSiguienteLetra(letraActual);
      const nuevoCodigoVersion = `${raiz}${siguienteLetra}`;

      return nuevoCodigoVersion;
    }

    // CASO 2: Generar un consecutivo completamente nuevo (e.g., COT-26-0002A)
    let ultimoCodigo: string | null = null;

    if (tipo === "COT") {
      const ult = await tx.cotizacion.findFirst({
        where: { codigo: { startsWith: prefijoAnno } },
        orderBy: { codigo: "desc" },
        select: { codigo: true },
      });
      ultimoCodigo = ult?.codigo ?? null;
    } else if (tipo === "OT") {
      const ult = await tx.ordenTrabajo.findFirst({
        where: { codigo: { startsWith: prefijoAnno } },
        orderBy: { codigo: "desc" },
        select: { codigo: true },
      });
      ultimoCodigo = ult?.codigo ?? null;
    } else if (tipo === "REC") {
      const ult = await tx.recepcionEquipo.findFirst({
        where: { codigo: { startsWith: prefijoAnno } },
        orderBy: { codigo: "desc" },
        select: { codigo: true },
      });
      ultimoCodigo = ult?.codigo ?? null;
    }

    if (!ultimoCodigo) {
      return `${prefijoAnno}0001A`;
    }

    // Extraer número actual e incrementar
    const matchNumero = ultimoCodigo.match(/^[A-Z]+-\d{2}-(\d{4})[A-Z]$/);
    const numeroSecuencial = matchNumero ? parseInt(matchNumero[1], 10) + 1 : 1;
    const numeroFormateado = numeroSecuencial.toString().padStart(4, "0");

    return `${prefijoAnno}${numeroFormateado}A`;
  });
}

/**
 * Incrementa el carácter ASCII de la versión ('A' -> 'B', 'Z' lanza excepción)
 */
function obtenerSiguienteLetra(letraActual: string): string {
  const charCode = letraActual.charCodeAt(0);
  if (charCode >= 90) { // ASCII 90 = 'Z'
    throw new Error("Se ha alcanzado el límite máximo de versiones permitidas (Z).");
  }
  return String.fromCharCode(charCode + 1);
}