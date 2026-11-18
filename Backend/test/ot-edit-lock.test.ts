import assert from 'node:assert/strict';
import test from 'node:test';
import { EstadoOT, Prisma } from '@prisma/client';
import { validarIdentidadInstrumentosRecepcion, validarOTEditableAntesDeCalibrar } from '../src/services/ot-edit-lock.service.js';

function fakeTx(estado: EstadoOT, tieneCalibracion = false): Prisma.TransactionClient {
  return {
    ordenes_trabajo: {
      findUnique: async () => ({ CODIGO_OT: 'OT-TEST', estado }),
    },
    recepciones_equipo: {
      findMany: async () => [{ ID_RECEPCION: 20 }],
    },
    calibraciones: {
      findFirst: async () => tieneCalibracion ? { ID_CALIBRACION: 30 } : null,
    },
  } as unknown as Prisma.TransactionClient;
}

const instrumentoBase = {
  ID_INSTRUMENTO: 10,
  INSTRUMENTO: 'Manómetro',
  MARCA: 'Marca',
  MODELO: 'M1',
  SERIE: 'S1',
  CODIGO_INVENTARIO: 'INV-1',
  RESOLUCION: '0.1',
  TIPO_SENSOR_TEMP_init: false,
  TIPO_SENSOR_TEMP_ext: false,
  ESTADO_IBC: { entrada: { limpio: true }, salida: {} } as Prisma.JsonValue,
  ESTAMPILLA: 'E-1',
};

const inputBase = {
  idInstrumento: 10,
  instrumento: 'Manómetro',
  marca: 'Marca',
  modelo: 'M1',
  serie: 'S1',
  codigoInventario: 'INV-1',
  resolucion: '0.1',
  sensorInt: false,
  sensorExt: false,
  estadoIBC: { entrada: { limpio: true }, salida: { embalado: true } },
  estampilla: 'E-1',
};

test('permite editar antes de que la OT empiece calibración', async () => {
  await assert.doesNotReject(() => validarOTEditableAntesDeCalibrar(fakeTx(EstadoOT.Asignada), 1, 'cotización'));
});

test('bloquea desde calibración y también detecta una calibración con estado atrasado', async () => {
  await assert.rejects(
    () => validarOTEditableAntesDeCalibrar(fakeTx(EstadoOT.En_calibración), 1, 'cotización'),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
  );
  await assert.rejects(
    () => validarOTEditableAntesDeCalibrar(fakeTx(EstadoOT.Asignada, true), 1, 'cotización'),
    (error: unknown) => (error as { statusCode?: number }).statusCode === 409,
  );
});

test('después del inicio permite cambiar salida logística sin cambiar identidad técnica', async () => {
  await assert.doesNotReject(() => validarIdentidadInstrumentosRecepcion(
    fakeTx(EstadoOT.En_calibración), 1, [instrumentoBase], [inputBase],
  ));
});

test('después del inicio rechaza alta, baja o cambio de identidad del instrumento', async () => {
  const tx = fakeTx(EstadoOT.Certificado_aprobado);
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], []));
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], [inputBase, { ...inputBase, idInstrumento: 11 }]));
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], [{ ...inputBase, serie: 'CAMBIADA' }]));
});
