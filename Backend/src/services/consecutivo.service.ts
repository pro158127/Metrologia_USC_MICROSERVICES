import { AppError } from '../lib/errors.js';
// Importa el tipo de Prisma si lo tienes disponible, o usa any si tu linter te lo exige rápido
import { Prisma } from '@prisma/client'; 

function obtenerSiguienteLetra(letraActual: string): string {
  const charCode = letraActual.charCodeAt(0);
  if (charCode >= 90) {
    throw new AppError(400, 'Se ha alcanzado el límite máximo de versiones permitidas (Z).');
  }
  return String.fromCharCode(charCode + 1);
}

export type TipoConsecutivo = 'COT' | 'OT' | 'REC';

/**
 * Genera el siguiente código consecutivo.
 * @param tx Cliente de Prisma (o un Prisma Transaction)
 * @param tipo Tipo de documento (COT, OT, REC)
 * @param codigoBaseExistente (Opcional) Código para incrementar versión (Ej: A -> B)
 */
export async function generarConsecutivo(
  tx: Prisma.TransactionClient, 
  tipo: TipoConsecutivo, 
  codigoBaseExistente?: string
): Promise<string> {
  // 1. Si enviaron código base, solo aumentamos la letra
  if (codigoBaseExistente) {
    const match = codigoBaseExistente.match(/^([A-Z]+-\d{2}-\d{4})([A-Z])$/);
    if (!match) {
      throw new AppError(400, 'El código base proporcionado no cumple con el formato requerido (PRE-AA-XXXXZ).');
    }
    const [, raiz, letraActual] = match;
    return `${raiz}${obtenerSiguienteLetra(letraActual)}`;
  }

  // 2. Lógica normal de incremento numérico
  const yearSuffix = new Date().getFullYear().toString().slice(-2);
  const prefijoAnno = `${tipo}-${yearSuffix}-`;
  let ultimoCodigo: string | null = null;

  if (tipo === 'COT') {
    const ult = await tx.cotizaciones.findFirst({
      where: { CODIGO_COTIZACION: { startsWith: prefijoAnno } },
      orderBy: { CODIGO_COTIZACION: 'desc' },
      select: { CODIGO_COTIZACION: true },
    });
    ultimoCodigo = ult?.CODIGO_COTIZACION ?? null;
  } else if (tipo === 'OT') {
    const ult = await tx.ordenes_trabajo.findFirst({
      where: { CODIGO_OT: { startsWith: prefijoAnno } },
      orderBy: { CODIGO_OT: 'desc' },
      select: { CODIGO_OT: true },
    });
    ultimoCodigo = ult?.CODIGO_OT ?? null;
  } else if (tipo === 'REC') {
    const ult = await tx.recepciones_equipo.findFirst({
      where: { CODIGO_RECEPCION: { startsWith: prefijoAnno } },
      orderBy: { CODIGO_RECEPCION: 'desc' },
      select: { CODIGO_RECEPCION: true },
    });
    ultimoCodigo = ult?.CODIGO_RECEPCION ?? null;
  }

  // Si no hay nada en este año, arrancamos en 1
  if (!ultimoCodigo) {
    return `${prefijoAnno}0001A`;
  }

  // Extraer el número y sumarle 1
  const matchNumero = ultimoCodigo.match(/^[A-Z]+-\d{2}-(\d{4})[A-Z]$/);
  const numeroSecuencial = matchNumero ? parseInt(matchNumero[1], 10) + 1 : 1;
  const numeroFormateado = numeroSecuencial.toString().padStart(4, '0');

  return `${prefijoAnno}${numeroFormateado}A`;
}