import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { AppError } from '../src/lib/errors.js';
import { cotizacionDesalineadaConRecepcion, retirarUnidadesDeCotizacion, sincronizarCotizacionDesdeRecepcion } from '../src/services/cotizacion-sync.service.js';

type Detail = {
  ID_DETALLE: number;
  ID_COTIZACION_FK: number;
  EQUIPO_DESCRIPCION: string;
  TIPO_SERVICIO: string;
  MAGNITUD: string;
  NORMA_TECNICA: string | null;
  CANTIDAD: number;
  VALOR_UNITARIO: Prisma.Decimal;
  VALOR_TOTAL: Prisma.Decimal;
  sitio: string;
  activacion: boolean;
  ID_UNIDADES?: string[];
};

function fakeTx(options: { details?: Detail[]; tarifas?: object[]; viaticos?: number; descuento?: number } = {}) {
  const details = [...(options.details ?? [])];
  const tarifas = options.tarifas ?? [{
    Instrumento: 'Manómetro',
    MAGNITUD: 'Presión',
    TIPO_SERVICIO: 'Calibración',
    Norma: 'NTC-1',
    historial_tarifas: [{ PRECIO_U: new Prisma.Decimal(1234.56) }],
  }];
  let nextId = 100;
  let quoteUpdate: Record<string, unknown> | undefined;
  const tx = {
    cotizacion_detalles: {
      findMany: async ({ where }: { where: { activacion?: boolean } }) =>
        details.filter((d) => where.activacion === undefined || d.activacion === where.activacion),
      update: async ({ where, data }: { where: { ID_DETALLE: number }; data: Partial<Detail> }) => {
        const row = details.find((d) => d.ID_DETALLE === where.ID_DETALLE)!;
        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: Omit<Detail, 'ID_DETALLE'> }) => {
        const row = { ...data, ID_DETALLE: nextId++ } as Detail;
        details.push(row);
        return row;
      },
    },
    certificados: { findMany: async () => [] },
    tarifas: { findMany: async () => tarifas },
    cotizaciones: {
      findUniqueOrThrow: async () => ({ viaticos: new Prisma.Decimal(options.viaticos ?? 100), descuento: options.descuento ?? 10 }),
      findUnique: async () => ({ viaticos: new Prisma.Decimal(options.viaticos ?? 100), descuento: options.descuento ?? 10 }),
      update: async ({ data }: { data: Record<string, unknown> }) => { quoteUpdate = data; return data; },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, details, getQuoteUpdate: () => quoteUpdate };
}

function detalle(overrides: Partial<Detail> = {}): Detail {
  return {
    ID_DETALLE: 1,
    ID_COTIZACION_FK: 4,
    EQUIPO_DESCRIPCION: 'Manómetro',
    TIPO_SERVICIO: 'Calibración',
    MAGNITUD: 'Presión',
    NORMA_TECNICA: 'NTC-1',
    CANTIDAD: 3,
    VALOR_UNITARIO: new Prisma.Decimal(500),
    VALOR_TOTAL: new Prisma.Decimal(1500),
    sitio: 'LABORATORIO',
    activacion: true,
    ...overrides,
  };
}

test('agrupa instrumentos repetidos y completa la línea con su tarifa exacta', async () => {
  const mock = fakeTx();
  await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [{ instrumento: 'Manómetro' }, { instrumento: ' Manómetro ' }], 'LABORATORIO');
  const active = mock.details.filter((d) => d.activacion);
  assert.equal(active.length, 1);
  assert.equal(active[0].CANTIDAD, 2);
  assert.equal(active[0].VALOR_TOTAL.toFixed(2), '2469.12');
  assert.equal((mock.getQuoteUpdate()?.MONTO_TOTAL as Prisma.Decimal).toFixed(2), '2312.21');
});

test('al quitar una unidad actualiza la línea y conserva la identidad de las unidades restantes', async () => {
  const mock = fakeTx({ details: [detalle()], viaticos: 100, descuento: 10 });
  await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [{ instrumento: 'Manómetro' }, { instrumento: 'Manómetro' }], 'LABORATORIO');
  assert.equal(mock.details[0].activacion, true);
  const current = mock.details.find((d) => d.activacion)!;
  assert.equal(current.CANTIDAD, 2);
  assert.equal(current.VALOR_TOTAL.toFixed(2), '1000.00');
  assert.equal((mock.getQuoteUpdate()?.MONTO_TOTAL as Prisma.Decimal).toFixed(2), '990.00');
});

test('mantiene líneas separadas cuando el mismo instrumento tiene tipos de servicio distintos', async () => {
  const mock = fakeTx({
    details: [detalle({ ID_UNIDADES: ['unidad-1'], CANTIDAD: 1, VALOR_TOTAL: new Prisma.Decimal(500) })],
    tarifas: [
      { Instrumento: 'Manómetro', MAGNITUD: 'Presión', TIPO_SERVICIO: 'Calibración', Norma: 'NTC-1', historial_tarifas: [{ PRECIO_U: 500 }] },
      { Instrumento: 'Manómetro', MAGNITUD: 'Presión', TIPO_SERVICIO: 'Verificación', Norma: 'NTC-2', historial_tarifas: [{ PRECIO_U: 700 }] },
    ],
  });

  await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [
    { instrumento: 'Manómetro', idUnidad: 'unidad-1', tipoServicio: 'Calibración' },
    { instrumento: 'Manómetro', idUnidad: 'unidad-2', tipoServicio: 'Verificación' },
  ], 'LABORATORIO');

  const active = mock.details.filter((d) => d.activacion);
  assert.equal(active.length, 2);
  assert.deepEqual(active.map((d) => d.TIPO_SERVICIO).sort(), ['Calibración', 'Verificación']);
  assert.deepEqual(active.map((d) => d.ID_UNIDADES?.[0]).sort(), ['unidad-1', 'unidad-2']);
});

test('rechaza tarifa inexistente o ambigua antes de reemplazar las líneas vigentes', async () => {
  const existing = detalle();
  const missing = fakeTx({ details: [existing], tarifas: [] });
  await assert.rejects(
    () => sincronizarCotizacionDesdeRecepcion(missing.tx, 4, [{ instrumento: 'Balanza' }], 'LABORATORIO'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
  assert.equal(missing.details[0].activacion, true);

  const tariff = {
    Instrumento: 'Manómetro', MAGNITUD: 'Presión', TIPO_SERVICIO: 'Calibración', Norma: 'NTC-1',
    historial_tarifas: [{ PRECIO_U: 800 }],
  };
  const ambiguous = fakeTx({ tarifas: [tariff, tariff] });
  await assert.rejects(
    () => sincronizarCotizacionDesdeRecepcion(ambiguous.tx, 4, [{ instrumento: 'Manómetro' }], 'LABORATORIO'),
    (error: unknown) => error instanceof AppError && error.statusCode === 409,
  );
  assert.equal(ambiguous.details.length, 0);
});


test('desactivar un grupo retira solo sus unidades y respeta el precio del sitio restante', async () => {
  const mock = fakeTx({ details: [
    detalle({ ID_DETALLE: 1, sitio: 'LABORATORIO', CANTIDAD: 2, ID_UNIDADES: ['lab-1', 'lab-2'], VALOR_TOTAL: new Prisma.Decimal(1000) }),
    detalle({ ID_DETALLE: 2, sitio: 'CLIENTE', CANTIDAD: 1, ID_UNIDADES: ['cliente-1'], VALOR_TOTAL: new Prisma.Decimal(500) }),
  ] });
  assert.equal(await retirarUnidadesDeCotizacion(mock.tx, 4, ['cliente-1']), true);
  assert.equal(mock.details[1].activacion, false);
  assert.deepEqual(mock.details[0].ID_UNIDADES, ['lab-1', 'lab-2']);
  assert.equal((mock.getQuoteUpdate()?.MONTO_TOTAL as Prisma.Decimal).toFixed(2), '990.00');
  assert.equal(await retirarUnidadesDeCotizacion(mock.tx, 4, ['cliente-1']), false);
});

test('agrupa el servicio inferido y el explícito sin sobrescribir cantidad ni cobrar dos veces una unidad', async () => {
  const mock = fakeTx({ details: [detalle({
    TIPO_SERVICIO: 'No acreditado', ID_UNIDADES: ['unidad-1'], CANTIDAD: 1,
    VALOR_TOTAL: new Prisma.Decimal(500),
  })] });
  const entrada = [
    { instrumento: 'Manómetro', idUnidad: 'unidad-1', tipoServicio: 'NO_ACREDITADO' },
    { instrumento: ' Manómetro ', idUnidad: 'unidad-2' },
    { instrumento: 'Manómetro', idUnidad: 'unidad-2', tipoServicio: 'No acreditado' },
  ];
  const resultado = await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, entrada, 'LABORATORIO');
  assert.equal(resultado.cambio, true);
  assert.equal(resultado.serviciosPorUnidad.get('unidad-2'), 'No acreditado');
  const activas = mock.details.filter((linea) => linea.activacion);
  assert.equal(activas.length, 1);
  assert.deepEqual(activas[0].ID_UNIDADES, ['unidad-1', 'unidad-2']);
  assert.equal(activas[0].CANTIDAD, 2);
  assert.equal(activas[0].VALOR_TOTAL.toFixed(2), '1000.00');
  assert.equal(await cotizacionDesalineadaConRecepcion(mock.tx, 4, 'LABORATORIO', entrada), false);
});

test('al retirar un equipo se reconstruye la línea desde la recepción y se reparan duplicados anteriores', async () => {
  const mock = fakeTx({ details: [
    detalle({ ID_DETALLE: 1, ID_UNIDADES: ['conservar', 'retirar'], CANTIDAD: 2, VALOR_TOTAL: new Prisma.Decimal(1000) }),
    detalle({ ID_DETALLE: 2, ID_UNIDADES: ['conservar'], CANTIDAD: 1, VALOR_TOTAL: new Prisma.Decimal(500) }),
    detalle({ ID_DETALLE: 3, ID_UNIDADES: ['otro-sitio'], sitio: 'CLIENTE', CANTIDAD: 1, VALOR_TOTAL: new Prisma.Decimal(500) }),
  ] });
  const restantes = [{ instrumento: 'Manómetro', idUnidad: 'conservar' }];
  assert.equal(await cotizacionDesalineadaConRecepcion(mock.tx, 4, 'LABORATORIO', restantes), true);
  assert.equal((await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, restantes, 'LABORATORIO')).cambio, true);
  assert.equal(await cotizacionDesalineadaConRecepcion(mock.tx, 4, 'LABORATORIO', restantes), false);
  assert.deepEqual(mock.details.filter((linea) => linea.activacion).map((linea) => linea.ID_UNIDADES), [['conservar'], ['otro-sitio']]);
  assert.equal(mock.details[0].CANTIDAD, 1);
  assert.equal(mock.details[0].VALOR_TOTAL.toFixed(2), '500.00');
  assert.equal((mock.getQuoteUpdate()?.MONTO_TOTAL as Prisma.Decimal).toFixed(2), '990.00');
});

test('agregar y retirar una unidad conserva el precio pactado y las líneas de los demás sitios', async () => {
  const mock = fakeTx({ details: [
    detalle({ ID_UNIDADES: ['original'], CANTIDAD: 1, VALOR_TOTAL: new Prisma.Decimal(500) }),
    detalle({ ID_DETALLE: 2, sitio: 'CLIENTE', ID_UNIDADES: ['externa'], CANTIDAD: 1, VALOR_TOTAL: new Prisma.Decimal(500) }),
  ], viaticos: 0, descuento: 0 });
  const original = { instrumento: 'Manómetro', idUnidad: 'original' };
  const agregado = await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [
    original, { instrumento: 'Manómetro', idUnidad: 'nueva' },
  ], 'LABORATORIO');
  assert.equal(agregado.serviciosPorUnidad.get('nueva'), 'Calibración');
  assert.equal(mock.details[0].CANTIDAD, 2);
  assert.equal(mock.details[0].VALOR_TOTAL.toFixed(2), '1000.00');
  assert.deepEqual(mock.details[1].ID_UNIDADES, ['externa']);

  await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [original], 'LABORATORIO');
  assert.deepEqual(mock.details[0].ID_UNIDADES, ['original']);
  assert.equal(mock.details[0].VALOR_TOTAL.toFixed(2), '500.00');
  assert.deepEqual(mock.details[1].ID_UNIDADES, ['externa']);
  assert.equal((mock.getQuoteUpdate()?.MONTO_TOTAL as Prisma.Decimal).toFixed(2), '1000.00');
});

test('un alta sin servicio explícito devuelve el servicio de la tarifa resuelta', async () => {
  const mock = fakeTx({ tarifas: [{ Instrumento: 'Manómetro', MAGNITUD: 'Presión', TIPO_SERVICIO: 'No acreditado', Norma: 'NTC-1', historial_tarifas: [{ PRECIO_U: 500 }] }] });
  const resultado = await sincronizarCotizacionDesdeRecepcion(mock.tx, 4, [
    { instrumento: 'Manómetro', idUnidad: 'nueva' },
  ], 'INTERNO_USC');
  assert.equal(resultado.serviciosPorUnidad.get('nueva'), 'No acreditado');
  assert.equal(mock.details[0].TIPO_SERVICIO, 'No acreditado');
  assert.deepEqual(mock.details[0].ID_UNIDADES, ['nueva']);
});
