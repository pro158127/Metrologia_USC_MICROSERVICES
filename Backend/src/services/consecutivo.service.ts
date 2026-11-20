import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export type TipoConsecutivo = 'COT' | 'OT' | 'REC';

export async function generarConsecutivo(
  tx: Prisma.TransactionClient,
  tipo: TipoConsecutivo,
  codigoBaseExistente?: string,
): Promise<string> {
  if (codigoBaseExistente) {
    const match = codigoBaseExistente.match(/^([A-Z]+-\d{2}-\d{4,})([A-Z])$/);
    if (!match || !match[1].startsWith(`${tipo}-`)) {
      throw new AppError(409, `El código ${codigoBaseExistente} no corresponde a un consecutivo ${tipo} válido.`);
    }
    const [, raiz, letra] = match;
    if (letra === 'Z') throw new AppError(409, 'El consecutivo llegó a la versión Z. No se guardó una nueva versión.');
    return raiz + String.fromCharCode(letra.charCodeAt(0) + 1);
  }

  const anio = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Bogota' }).format(new Date());
  const prefijo = `${tipo}-${anio.slice(-2)}-`;
  // Una llave anual compartida evita invertir el orden de bloqueos cuando
  // una misma operación crea COT, OT y REC.
  await tx.$queryRaw`SELECT 1 AS reservado FROM pg_advisory_xact_lock(92173, ${Number(anio)}::integer)`;
  const patron = `^${prefijo}([0-9]{4,})[A-Z]$`;
  const [resultado] = tipo === 'COT'
    ? await tx.$queryRaw<{ ultimo: bigint }[]>`SELECT COALESCE(MAX(substring("CODIGO_COTIZACION" FROM ${patron})::bigint), 0) AS ultimo FROM cotizaciones WHERE "CODIGO_COTIZACION" LIKE ${prefijo + '%'}`
    : tipo === 'OT'
    ? await tx.$queryRaw<{ ultimo: bigint }[]>`SELECT COALESCE(MAX(substring("CODIGO_OT" FROM ${patron})::bigint), 0) AS ultimo FROM ordenes_trabajo WHERE "CODIGO_OT" LIKE ${prefijo + '%'}`
    : await tx.$queryRaw<{ ultimo: bigint }[]>`SELECT COALESCE(MAX(substring("CODIGO_RECEPCION" FROM ${patron})::bigint), 0) AS ultimo FROM recepciones_equipo WHERE "CODIGO_RECEPCION" LIKE ${prefijo + '%'}`;
  return `${prefijo}${(resultado.ultimo + 1n).toString().padStart(4, '0')}A`;
}
