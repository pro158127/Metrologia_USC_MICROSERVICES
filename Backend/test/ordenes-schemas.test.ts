import assert from 'node:assert/strict';
import test from 'node:test';
import { ordenTrabajoRawToDtoSchema } from '../src/routes/ordenes.schemas.js';

test('convierte detalles de instrumentos una vez y añade su estado de calibración/certificado', () => {
  const idUnidad = '8ca6e6ef-4043-4f5d-8244-5c1e6e97f311';
  const orden = ordenTrabajoRawToDtoSchema.parse({
    ID_ORDEN_TRABAJO: 7,
    CODIGO_OT: 'OT-TEST-0007',
    orden_trabajo_detalles: [{
      ID_DETALLE: 31,
      ID_ORDEN_TRABAJO_FK: 7,
      ID_UNIDAD_FK: idUnidad,
      ITEM: 1,
      TIPO_SERVICIO: 'ACREDITADO',
      INSTRUMENTO: 'Manómetro',
      asignado: null,
    }],
    recepciones_equipo: [{
      FECHA_RECEPCION: new Date('2026-11-20'),
      NOMBRE_ENTREGA: 'Cliente',
      NOMBRE_RECIBE: 'Laboratorio',
      recepcion_equipo_detalles: [{
        ID_UNIDAD_FK: idUnidad,
        ESTAMPILLA: 'USC-4',
        ESTADO_IBC: { entrada: { E: true, T: false, D: true, A: false } },
        calibraciones: {
          certificados: { ID_CERTIFICADO: 4, ESTADO_REVISION: 'APROBADO' },
        },
      }],
    }],
  });

  assert.equal(orden.instrumentos.length, 1);
  assert.equal(orden.instrumentos[0].idDetalle, 31);
  assert.equal(orden.instrumentos[0].instrumento, 'Manómetro');
  assert.equal(orden.instrumentos[0].listoParaAsignar, true);
  assert.equal(orden.instrumentos[0].calibracionIniciada, true);
  assert.equal(orden.instrumentos[0].certificadoCreado, true);
});
