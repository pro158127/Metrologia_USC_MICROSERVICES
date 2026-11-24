import { calcularEstadoRecepcion } from '../src/services/recepcion-entrega.service.js';
import { cabeceraRecepcionLista } from '../src/services/ot-fsm.service.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma } from '@prisma/client';
import { sincronizarOTMaestraDesdeRecepcion, verificarGruposOperativos } from '../src/services/recepcion-ot-sync.service.js';
import { instrumentoRecepcionInputSchema } from '../src/routes/recepciones.schemas.js';

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

test('al consolidar, una fila nueva requiere un nombre de instrumento válido', () => {
  assert.equal(instrumentoRecepcionInputSchema.safeParse({ instrumento: '   ' }).success, false);
  assert.equal(instrumentoRecepcionInputSchema.parse({ instrumento: '  Manómetro  ' }).instrumento, 'Manómetro');
});

const gruposDelCaso = new Map([
  ['LABORATORIO', ['equipo-lab']],
  ['INTERNO_USC', ['equipo-interno']],
] as const);

function cotizacionConDosSitios() {
  const maestra = {
    ID_ORDEN_TRABAJO: 10, ID_OT_PADRE_FK: null, SITIO_CALIBRACION: null,
    orden_trabajo_detalles: [], recepciones_equipo: [],
  };
  const operativas = [...gruposDelCaso].map(([sitio, [id]], indice) => ({
    ID_ORDEN_TRABAJO: 11 + indice, ID_OT_PADRE_FK: 10, SITIO_CALIBRACION: sitio,
    orden_trabajo_detalles: [{ ID_UNIDAD_FK: id, sitio_calibracion: sitio }],
    recepciones_equipo: [{ SITIO_CALIBRACION: sitio, recepcion_equipo_detalles: [{ ID_UNIDAD_FK: id }] }],
  }));
  return {
    operativas,
    tx: { ordenes_trabajo: { findMany: async () => [maestra, ...operativas] } } as unknown as Prisma.TransactionClient,
  };
}

test('Laboratorio e Interno USC tienen una OT y una recepción con su propia unidad', async () => {
  const { tx } = cotizacionConDosSitios();
  await verificarGruposOperativos(tx, 25, gruposDelCaso);
});

test('rechaza una OT sin equipos o una recepción marcada con el sitio equivocado', async () => {
  const { tx, operativas } = cotizacionConDosSitios();
  const interno = operativas[1];
  interno.orden_trabajo_detalles.length = 0;
  await assert.rejects(verificarGruposOperativos(tx, 25, gruposDelCaso), /grupo INTERNO_USC/);
  interno.orden_trabajo_detalles.push({ ID_UNIDAD_FK: 'equipo-interno', sitio_calibracion: 'INTERNO_USC' });
  interno.recepciones_equipo[0].SITIO_CALIBRACION = 'LABORATORIO';
  await assert.rejects(verificarGruposOperativos(tx, 25, gruposDelCaso), /grupo INTERNO_USC/);
});
