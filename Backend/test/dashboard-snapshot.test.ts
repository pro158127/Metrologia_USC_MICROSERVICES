import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import dashboardRoutes from '../src/routes/dashboard.routes.js';

test('dashboard lee todo desde la misma transacción repeatable read y no consulta bandeja sin permiso', async () => {
  const app = Fastify();
  const lecturas: string[] = [];
  const tx = Object.fromEntries(['cotizaciones', 'ordenes_trabajo', 'certificados', 'facturas', 'clientes'].map((tabla) => [tabla, {
    findMany: async () => { lecturas.push(tabla); return []; },
  }]));
  const generatedAt = new Date('2026-11-23T12:00:00Z');
  Object.assign(tx, { $queryRaw: async () => [{ generatedAt }] });
  app.decorate('authenticate', async (request: { user: unknown }) => { request.user = { sub: '5' }; });
  app.decorate('prisma', { $transaction: async (fn: (db: typeof tx) => Promise<unknown>, opciones: { isolationLevel: string }) => {
    assert.equal(opciones.isolationLevel, 'RepeatableRead');
    return fn(tx);
  } });
  await app.register(dashboardRoutes);
  try {
    const respuesta = await app.inject('/api/v1/dashboard/snapshot');
    assert.equal(respuesta.statusCode, 200, respuesta.body);
    assert.equal(respuesta.json().generatedAt, generatedAt.toISOString());
    assert.deepEqual(lecturas, ['cotizaciones', 'ordenes_trabajo', 'certificados', 'facturas', 'clientes']);
    assert.deepEqual(respuesta.json().bandeja, []);
    assert.deepEqual(respuesta.json().metricas, []);
  } finally { await app.close(); }
});
