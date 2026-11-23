import type { Prisma } from '@prisma/client';
import { generarConsecutivo } from './consecutivo.service.js';

type Tx = Prisma.TransactionClient;

/** Avanza juntos el sufijo del código OT y su contador numérico de versión. */
export async function siguienteVersionOT(
  tx: Tx,
  ot: { CODIGO_OT: string; VERSION: number | null },
): Promise<{ CODIGO_OT: string; VERSION: number }> {
  return {
    CODIGO_OT: await generarConsecutivo(tx, 'OT', ot.CODIGO_OT),
    VERSION: (ot.VERSION ?? 1) + 1,
  };
}
