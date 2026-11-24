import assert from 'node:assert/strict';
import test from 'node:test';
import { registrarFacturaPago } from '../src/services/factura-pago.service.js';

test('cambiar el código cotizado y la OT de pago conserva la factura original', async () => {
  const filas: { NUMERO_FACTURA: string; ID_ORDEN_TRABAJO_FK: number; ID_FACTURA: number; ID_DOCUMENTO_FK: number | null }[] = [];
  const trabajos = new Map<string, object>();
  const tx = { facturas: {
    findFirst: async ({ where }: { where: { ordenes_trabajo: { ID_COTIZACION_FK: number } } }) => {
      assert.equal(where.ordenes_trabajo.ID_COTIZACION_FK, 12);
      return filas[0] ?? null;
    },
    create: async ({ data }: { data: typeof filas[number] }) => {
      const fila = { ...data, ID_FACTURA: 7, ID_DOCUMENTO_FK: null };
      filas.push(fila);
      return fila;
    },
  }, quote: {
    upsert: async ({ where, create }: { where: { id: string }; create: object }) => {
      if (!trabajos.has(where.id)) trabajos.set(where.id, create);
    },
  } };
  const datos = { idCotizacion: 12, codigoCotizacion: 'COT-26-001A', idOrdenTrabajo: 23, idCliente: 4, valor: 100 };
  await registrarFacturaPago(tx as never, datos);
  const factura = await registrarFacturaPago(tx as never, { ...datos, codigoCotizacion: 'COT-26-001B', idOrdenTrabajo: 24 });
  assert.equal(filas.length, 1);
  assert.equal(factura.NUMERO_FACTURA, 'FAC-COT-26-001A');
  assert.equal(factura.ID_ORDEN_TRABAJO_FK, 23);
  assert.deepEqual([...trabajos], [['factura-pdf-7', {
    id: 'factura-pdf-7',
    data: { generacion: { nombre: 'generar_pdf_factura', payload: {
      documento: 'factura', tipo: 4, tipo_entry: 'prod', id_registro: 7,
    } } },
  }]]);
});
