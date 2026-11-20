import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { sincronizarOTMaestraDesdeRecepcion } from '../src/services/recepcion-ot-sync.service.js';

function unidad(id: number, codigo: string, item: number, instrumento = 'Manómetro') {
  return {
    ID_DETALLE: id, ID_UNIDAD_FK: codigo, ITEM: item, INSTRUMENTO: instrumento,
    TIPO_SERVICIO: 'ACREDITADO', FABRICANTE: null, MODELO: null, SERIE: null,
    CODIGO_INVENTARIO: null, RESOLUCION: null, activacion: true,
  };
}

function escenario(hijas: Array<{ ID_ORDEN_TRABAJO: number; orden_trabajo_detalles: ReturnType<typeof unidad>[] }>) {
  const maestra = {
    CODIGO_OT: 'OT-26-0001A', VIGENTE: true,
    orden_trabajo_detalles: [unidad(1, 'lab', 1), unidad(2, 'cliente', 2)],
  };
  const ordenesActualizadas: Array<{ where: { ID_ORDEN_TRABAJO: number }; data: Record<string, unknown> }> = [];
  const detallesActualizados: number[] = [];
  const tx = {
    ordenes_trabajo: {
      findUnique: async () => maestra,
      findMany: async () => hijas,
      update: async (args: (typeof ordenesActualizadas)[number]) => { ordenesActualizadas.push(args); },
    },
    orden_trabajo_detalles: {
      update: async ({ where }: { where: { ID_DETALLE: number } }) => { detallesActualizados.push(where.ID_DETALLE); },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, ordenesActualizadas, detallesActualizados };
}

test('editar una hija mantiene intactas las unidades de las otras hijas', async () => {
  const caso = escenario([
    { ID_ORDEN_TRABAJO: 10, orden_trabajo_detalles: [unidad(5, 'lab', 1, 'Vacuómetro')] },
    { ID_ORDEN_TRABAJO: 11, orden_trabajo_detalles: [unidad(6, 'cliente', 1)] },
  ]);
  assert.equal(await sincronizarOTMaestraDesdeRecepcion(caso.tx, 3), true);
  assert.deepEqual(caso.detallesActualizados, [1]);
  assert.equal(caso.ordenesActualizadas[0].data.CODIGO_OT, 'OT-26-0001B');
});

test('si queda un solo grupo, la hija conserva el consecutivo y deja de depender de la maestra', async () => {
  const caso = escenario([{ ID_ORDEN_TRABAJO: 11, orden_trabajo_detalles: [unidad(6, 'cliente', 1)] }]);
  assert.equal(await sincronizarOTMaestraDesdeRecepcion(caso.tx, 3), false);
  assert.deepEqual(caso.ordenesActualizadas, [
    { where: { ID_ORDEN_TRABAJO: 3 }, data: { VIGENTE: false } },
    { where: { ID_ORDEN_TRABAJO: 11 }, data: { ID_OT_PADRE_FK: null } },
  ]);
});
