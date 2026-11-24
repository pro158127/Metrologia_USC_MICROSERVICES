import assert from 'node:assert/strict';
import test from 'node:test';
import { AppError } from '../src/lib/errors.js';
import { validarClienteActivoParaOperacion } from '../src/services/cliente-operacion.service.js';

test('permite iniciar una operación con cliente activo', async () => {
  const cliente = { ID_CLIENTE: 7, status: 'ACTIVO' as const };
  const resultado = await validarClienteActivoParaOperacion({
    clientes: { findUnique: async () => cliente },
  } as never, 7);
  assert.equal(resultado.ID_CLIENTE, 7);
});

test('bloquea el inicio de operaciones para clientes inactivos o inexistentes', async () => {
  for (const lookup of [
    async () => ({ ID_CLIENTE: 7, status: 'INACTIVO' as const }),
    async () => null,
  ]) {
    await assert.rejects(
      validarClienteActivoParaOperacion({ clientes: { findUnique: lookup } } as never, 7),
      (error: unknown) => error instanceof AppError && error.statusCode === 409,
    );
  }
});

test('rechaza un inicio de operación sin cliente asociado', async () => {
  await assert.rejects(
    validarClienteActivoParaOperacion({ clientes: { findUnique: async () => null } } as never, null),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
});
