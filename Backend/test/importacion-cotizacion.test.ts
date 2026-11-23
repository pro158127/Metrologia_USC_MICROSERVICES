import test from 'node:test';
import assert from 'node:assert/strict';
import { cotizacionAdmiteImportacionVinculada } from '../src/services/importacion-cotizacion.service.js';

test('solo cotizaciones aprobadas admiten una importación OT vinculada', () => {
  assert.equal(cotizacionAdmiteImportacionVinculada('APROBADA'), true);
  for (const estado of ['BORRADOR', 'ENVIADA', 'RECHAZADA', 'EN_SEGUIMIENTO']) {
    assert.equal(cotizacionAdmiteImportacionVinculada(estado), false, `${estado} no debe ser elegible`);
  }
});
