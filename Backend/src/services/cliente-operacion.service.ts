import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/errors.js';

type ClienteLookup = Pick<Prisma.TransactionClient, 'clientes'>;

/** Prevents new operational mutations for inactive clients; reads/history remain available. */
export async function validarClienteActivoParaOperacion(db: ClienteLookup, idCliente: number | null | undefined) {
  if (idCliente == null) throw new AppError(409, 'La operación requiere un cliente activo vinculado.');
  const cliente = await db.clientes.findUnique({
    where: { ID_CLIENTE: idCliente },
    select: { ID_CLIENTE: true, status: true },
  });
  if (!cliente) throw new AppError(409, 'El cliente vinculado ya no existe.');
  if (cliente.status !== 'ACTIVO') {
    throw new AppError(409, 'El cliente está inactivo; no se permiten nuevas operaciones.');
  }
  return cliente;
}
