import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarNombresImportados, cotizacionAdmiteImportacionVinculada } from '../src/services/importacion-cotizacion.service.js';

test('solo cotizaciones aprobadas admiten una importación OT vinculada', () => {
  assert.equal(cotizacionAdmiteImportacionVinculada('APROBADA'), true);
  for (const estado of ['BORRADOR', 'ENVIADA', 'RECHAZADA', 'EN_SEGUIMIENTO']) {
    assert.equal(cotizacionAdmiteImportacionVinculada(estado), false, `${estado} no debe ser elegible`);
  }
});

test('reconoce el nombre de Excel con espacios no separables, saltos y caracteres invisibles', () => {
  const nombres = ['Termómetro digital', 'Termómetro analógico'];
  assert.deepEqual(buscarNombresImportados(' TERMÓMETRO\u00a0\nDI\u200bGITAL ', nombres, (n) => n), ['Termómetro digital']);
  assert.deepEqual(buscarNombresImportados('termómetro  digital', nombres, (n) => n), ['Termómetro digital']);
});

test('prioriza el nombre exacto y devuelve todas las coincidencias si el espacio omitido genera ambigüedad', () => {
  const nombres = ['Equipo AB', 'Equipo A B'];
  assert.deepEqual(buscarNombresImportados('Equipo AB', nombres, (n) => n), ['Equipo AB']);
  assert.deepEqual(buscarNombresImportados('EquipoAB', nombres, (n) => n), nombres);
  assert.deepEqual(buscarNombresImportados('\u200b ', nombres, (n) => n), []);
});

test('resuelve la etiqueta de manómetro que trae la familia antes del nombre de catálogo', () => {
  const tarifa = 'Manómetros digitales Clase de exactitud ≥\n0,05 % de escala completa. \n(50 psi < p ≤ 300 psi)';
  const alterna = tarifa.replace('digitales', 'analógicos');
  assert.deepEqual(
    buscarNombresImportados(`Manómetro analógico o digital » ${tarifa}`, [alterna, tarifa], (nombre) => nombre),
    [tarifa],
  );
});
