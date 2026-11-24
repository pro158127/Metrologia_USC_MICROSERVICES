import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { resolverClienteAltaRecepcion } from '../src/services/recepcion-cliente.service.js';

type ClientesRecepcion = Pick<Prisma.TransactionClient, 'clientes'>;

test('la selección del solicitante resuelve su cliente activo por ID', async () => {
  const cliente = { ID_CLIENTE: 21, RAZON_SOCIAL: 'Laboratorio USC', NIT: '100' };
  const tx = { clientes: { findFirst: async ({ where }: { where: unknown }) => {
    assert.deepEqual(where, { ID_CLIENTE: 21, status: 'ACTIVO' });
    return cliente;
  } } } as unknown as ClientesRecepcion;
  assert.equal(await resolverClienteAltaRecepcion(tx, 'Texto del formulario', 21), cliente);
});

test('la coincidencia por texto rechaza homónimos antes de crear una cotización', async () => {
  const tx = { clientes: { findMany: async () => [{ ID_CLIENTE: 1 }, { ID_CLIENTE: 2 }] } } as unknown as ClientesRecepcion;
  await assert.rejects(resolverClienteAltaRecepcion(tx, 'Laboratorio USC'), /varios clientes/);
});
