import assert from 'node:assert/strict';
import test from 'node:test';
import { EstadoOT, Prisma } from '@prisma/client';
import { validarIdentidadInstrumentosRecepcion } from '../src/services/ot-edit-lock.service.js';

function fakeTx(estado: EstadoOT, tieneCalibracion = false): Prisma.TransactionClient {
  return {
    ordenes_trabajo: {
      findUnique: async () => ({ CODIGO_OT: 'OT-TEST', estado }),
    },
    calibraciones: {
      findMany: async () => tieneCalibracion ? [{ ID_INSTRUMENTO_FK: 10 }] : [],
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
  OBSERVACIONES: null,
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
  estadoIBC: { entrada: { limpio: true }, salida: {} },
  estampilla: 'E-1',
  observaciones: null,
};

test('permite editar instrumentos que aún no tienen una calibración iniciada', async () => {
  await assert.doesNotReject(() => validarIdentidadInstrumentosRecepcion(
    fakeTx(EstadoOT.En_calibración), 1, [instrumentoBase], [],
  ));
});

test('bloquea identidad, estampilla e IBC de entrada al iniciar calibración, y deja editar los demás campos', async () => {
  const tx = fakeTx(EstadoOT.Certificado_en_revisión, true);
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], []));
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], [{ ...inputBase, instrumento: 'Unidad cambiada' }]));
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], [{ ...inputBase, estampilla: 'E-2' }]));
  await assert.rejects(() => validarIdentidadInstrumentosRecepcion(tx, 1, [instrumentoBase], [{ ...inputBase, estadoIBC: { entrada: { limpio: false }, salida: {} } }]));
  await assert.doesNotReject(() => validarIdentidadInstrumentosRecepcion(
    tx,
    1,
    [instrumentoBase],
    [{ ...inputBase, marca: 'Otra marca', modelo: 'M2', serie: 'S2', codigoInventario: 'INV-2', resolucion: '0.2', sensorInt: true, observaciones: 'Nota', estadoIBC: { entrada: { limpio: true }, salida: { entregado: true } } }, { ...inputBase, idInstrumento: undefined, instrumento: 'Unidad nueva', serie: 'S2' }],
  ));
});
