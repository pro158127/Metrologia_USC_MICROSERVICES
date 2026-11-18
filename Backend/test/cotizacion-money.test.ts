import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calcularMontoTotalCotizacion,
  calcularValorDetalle,
  normalizarDinero,
} from '../src/services/cotizacion-money.service.js';

test('calcula descuento sobre servicios más viáticos y redondea a centavos', () => {
  assert.equal(calcularMontoTotalCotizacion(1_000_000, 100_000, 10).toFixed(2), '990000.00');
});

test('acepta descuento cero y descuento total', () => {
  assert.equal(calcularMontoTotalCotizacion(100, 25, 0).toFixed(2), '125.00');
  assert.equal(calcularMontoTotalCotizacion(100, 25, 100).toFixed(2), '0.00');
});

test('normaliza centavos antes del cálculo', () => {
  assert.equal(normalizarDinero(1.005).toFixed(2), '1.01');
  assert.equal(calcularMontoTotalCotizacion(0.1, 0.205, 0).toFixed(2), '0.31');
});

test('multiplica cantidades sin arrastre de precisión binaria', () => {
  assert.equal(calcularValorDetalle(3, 0.1).toFixed(2), '0.30');
  assert.equal(calcularValorDetalle(7, 1234.56).toFixed(2), '8641.92');
});
