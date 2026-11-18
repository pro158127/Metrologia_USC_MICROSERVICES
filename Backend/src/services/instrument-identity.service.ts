import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export function crearIdsUnidades(cantidad: number): string[] {
  return Array.from({ length: Math.max(0, cantidad) }, () => randomUUID());
}

export async function obtenerIdsUnidadesCertificadas(tx: Tx, idCotizacion: number): Promise<Set<string>> {
  const certificados = await tx.certificados.findMany({
    where: {
      calibraciones: {
        recepcion_equipo_detalles: {
          recepciones_equipo: { ID_COTIZACION_FK: idCotizacion },
        },
      },
    },
    select: {
      calibraciones: {
        select: {
          recepcion_equipo_detalles: { select: { ID_UNIDAD_FK: true } },
        },
      },
    },
  });
  return new Set(certificados
    .map((certificado) => certificado.calibraciones.recepcion_equipo_detalles.ID_UNIDAD_FK)
    .filter((id): id is string => id !== null));
}

export function ajustarIdsUnidades(
  actuales: string[],
  cantidad: number,
  protegidos: ReadonlySet<string>,
): string[] {
  const ids = [...actuales];
  while (ids.length > cantidad) {
    let indice = -1;
    for (let i = ids.length - 1; i >= 0; i--) {
      if (!protegidos.has(ids[i])) { indice = i; break; }
    }
    if (indice < 0) break;
    ids.splice(indice, 1);
  }
  while (ids.length < cantidad) ids.push(...crearIdsUnidades(cantidad - ids.length));
  return ids;
}
