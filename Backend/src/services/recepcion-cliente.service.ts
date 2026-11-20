import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

export const datosClienteRecepcion = {
  ID_CLIENTE: true, RAZON_SOCIAL: true, NIT: true, dirrecion: true, ciudad: true,
  NOMBRE_CONTACTO: true, TELEFONO: true,
} as const;

export async function resolverClienteAltaRecepcion(
  tx: Pick<Prisma.TransactionClient, 'clientes'>,
  solicitante: string,
  idCliente?: number | null,
) {
  if (idCliente != null) {
    const cliente = await tx.clientes.findFirst({
      where: { ID_CLIENTE: idCliente, status: 'ACTIVO' }, select: datosClienteRecepcion,
    });
    if (!cliente) throw new AppError(409, 'El solicitante seleccionado ya no está disponible. Seleccione un cliente activo.');
    return cliente;
  }

  const identificador = solicitante.trim();
  const coincidencias = await tx.clientes.findMany({
    where: {
      status: 'ACTIVO',
      OR: [{ NIT: identificador }, { RAZON_SOCIAL: { equals: identificador, mode: 'insensitive' } }],
    },
    select: datosClienteRecepcion,
    take: 2,
  });
  if (coincidencias.length !== 1) {
    throw new AppError(409, coincidencias.length
      ? 'Hay varios clientes con ese nombre. Seleccione el solicitante por su NIT o cédula.'
      : 'Seleccione un solicitante registrado y activo antes de crear la recepción.');
  }
  return coincidencias[0];
}

export function cabeceraSolicitanteOT(cliente: Prisma.clientesGetPayload<{ select: typeof datosClienteRecepcion }> | null) {
  if (!cliente) return {};
  return {
    razon_social_solicitante: cliente.RAZON_SOCIAL,
    NIT_solicitante: cliente.NIT,
    dirrecion_solcitante: cliente.dirrecion,
    ciudad_solcitante: cliente.ciudad,
    PERSONA_CONTACT_SOLCITANTE: cliente.NOMBRE_CONTACTO,
    TELEFONO_CONTACTO_SOLICITANTE: cliente.TELEFONO,
  };
}
