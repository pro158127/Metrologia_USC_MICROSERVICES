import assert from 'node:assert/strict';
import test from 'node:test';
import { Prisma } from '@prisma/client';
import { AppError } from '../src/lib/errors.js';
import { sincronizarCotizacionDesdeRecepcion } from '../src/services/cotizacion-sync.service.js';

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
