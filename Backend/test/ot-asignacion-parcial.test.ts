import assert from 'node:assert/strict';
import test from 'node:test';
import { EstadoOT, type Prisma } from '@prisma/client';
import { evaluarTransicionesOT, validarAsignacionPermitida } from '../src/services/ot-fsm.service.js';

const entrada = { entrada: { E: true, T: false, D: true, A: false } };

function escenario() {
  const unidades = [
    { ID_DETALLE: 21, ID_UNIDAD_FK: 'unidad-1', ITEM: 1, activacion: true, asignado: null },
    { ID_DETALLE: 22, ID_UNIDAD_FK: 'unidad-2', ITEM: 2, activacion: true, asignado: null },
  ];
  const recepcion = {
    FECHA_RECEPCION: new Date('2026-11-20'),
    NOMBRE_ENTREGA: 'Cliente',
    NOMBRE_RECIBE: 'Laboratorio',
    recepcion_equipo_detalles: [
      { ID_INSTRUMENTO: 101, ID_UNIDAD_FK: 'unidad-1', ITEM: 9, activacion: true, ESTAMPILLA: 'USC-101', ESTADO_IBC: entrada },
      { ID_INSTRUMENTO: 102, ID_UNIDAD_FK: 'unidad-2', ITEM: 1, activacion: true, ESTAMPILLA: 'TEMP-102', ESTADO_IBC: { entrada: { ...entrada.entrada, A: null } } },
    ],
  };
  const certificados = new Map<number, string>();
  const calibrados = new Set<number>();
  const orden = {
    estado: EstadoOT.Creada as EstadoOT,
    orden_trabajo_detalles: unidades,
    recepciones_equipo: [recepcion],
  };
  const tx = {
    ordenes_trabajo: {
      findUnique: async () => orden,
      update: async ({ data }: { data: { estado: EstadoOT } }) => { orden.estado = data.estado; },
    },
    recepciones_equipo: { findFirst: async () => recepcion },
    calibraciones: {
      findMany: async ({ where }: { where: { ID_INSTRUMENTO_FK: { in: number[] } } }) =>
        where.ID_INSTRUMENTO_FK.in.filter((id) => calibrados.has(id)).map((id) => ({ ID_INSTRUMENTO_FK: id })),
    },
    certificados: {
      findMany: async ({ where }: { where: { calibraciones: { ID_INSTRUMENTO_FK: { in: number[] } } } }) =>
        where.calibraciones.ID_INSTRUMENTO_FK.in.filter((id) => certificados.has(id)).map((id) => ({
          ESTADO_REVISION: certificados.get(id),
          calibraciones: { ID_INSTRUMENTO_FK: id },
        })),
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, orden, recepcion, certificados, calibrados };
}

test('una unidad con estampilla e IBC permite asignar solo esa unidad', async () => {
  const { tx, recepcion } = escenario();
  const resultado = await evaluarTransicionesOT(tx, 1);
  assert.equal(resultado.estadoNuevo, EstadoOT.Asignada);
  await validarAsignacionPermitida(tx, 1, 21);
  await assert.rejects(validarAsignacionPermitida(tx, 1, 22), /estampilla.*IBC/);
  recepcion.recepcion_equipo_detalles[1].ESTAMPILLA = 'USC-102';
  await assert.rejects(validarAsignacionPermitida(tx, 1, 22), /estampilla.*IBC/);
  recepcion.recepcion_equipo_detalles[1].ESTADO_IBC = entrada;
  await validarAsignacionPermitida(tx, 1, 22);
});

test('una unidad avanza a calibración y revisión, y ambas deben aprobarse para completar la OT', async () => {
  const { tx, recepcion, certificados, calibrados } = escenario();
  calibrados.add(101);
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.En_calibración);
  certificados.set(101, 'PENDIENTE_REVISION');
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.Certificado_en_revisión);
  certificados.set(101, 'APROBADO');
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.Certificado_en_revisión);
  recepcion.recepcion_equipo_detalles[1].ESTAMPILLA = 'USC-102';
  recepcion.recepcion_equipo_detalles[1].ESTADO_IBC = entrada;
  certificados.set(102, 'APROBADO');
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.Certificado_aprobado);
});

test('una OT aprobada antes del envío vuelve a revisión cuando se incorpora un equipo sin certificado', async () => {
  const { tx, orden, certificados } = escenario();
  orden.estado = EstadoOT.Certificado_aprobado;
  certificados.set(101, 'APROBADO');
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.Certificado_en_revisión);
  orden.estado = EstadoOT.Certificado_enviado;
  assert.equal((await evaluarTransicionesOT(tx, 1)).estadoNuevo, EstadoOT.Certificado_enviado);
});
