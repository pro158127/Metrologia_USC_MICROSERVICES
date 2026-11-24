import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { Prisma } from '@prisma/client';
import cotizacionesRoutes from '../src/routes/cotizaciones.routes.js';
import { ordenPrincipalVigente } from '../src/services/recepcion-ot-sync.service.js';
import type { GeneracionExcelJob } from '../src/services/generacion-pendiente.service.js';

test('la actualización aprobada guarda la cotización y solo pide correo para la OT principal', async () => {
  const app = Fastify();
  const cotizacion = {
    ID_COTIZACION: 7, CODIGO_COTIZACION: 'COT-26-0007A', ID_CLIENTE_FK: 5,
    ESTADO: 'APROBADA', CREATED_AT: new Date('2026-11-20'), viaticos: new Prisma.Decimal(0),
    cotizacion_detalles: [], recepciones_equipo: [], enviar: false,
  };
  const orden = (id: number, padre: number | null) => ({
    ID_ORDEN_TRABAJO: id, ID_OT_PADRE_FK: padre, CODIGO_OT: `OT-26-00${id}A`,
    ID_CLIENTE_FK: 5, estado: 'Creada', estado_pago: 'PENDIENTE', recepciones_equipo: [],
  });
  const ordenes = [orden(12, 13), orden(13, null), orden(14, 13)];
  const trabajos: GeneracionExcelJob[] = [];
  const ruta = 'plantillas/formato.xlsx';
  const tx = {
    $queryRaw: async () => [],
    cotizaciones: {
      findUnique: async () => ({ ...cotizacion, ordenes_trabajo: ordenes }),
      findUniqueOrThrow: async () => cotizacion,
      update: async ({ data }: { data: Partial<typeof cotizacion> }) => Object.assign(cotizacion, data),
    },
    ordenes_trabajo: {
      findMany: async () => ordenes,
      findUniqueOrThrow: async ({ where }: { where: { ID_ORDEN_TRABAJO: number } }) =>
        ordenes.find((fila) => fila.ID_ORDEN_TRABAJO === where.ID_ORDEN_TRABAJO),
      update: async ({ where, data }: { where: { ID_ORDEN_TRABAJO: number }; data: { CODIGO_OT: string } }) =>
        Object.assign(ordenes.find((fila) => fila.ID_ORDEN_TRABAJO === where.ID_ORDEN_TRABAJO)!, data),
    },
    historial_cambios: { findFirst: async () => null, create: async () => ({}) },
    audit_logs: { create: async () => ({}) },
    version_plantillas: { findMany: async () => [{
      ID_VERSION_PLANTILLA: 2, documentos: { RUTA_URL: ruta }, INPUT_SCHEMA: { fields: {} },
      MAPPING_CONFIG: {
        templateId: 2, templateType: 'ORDEN_TRABAJO', version: '1', fileRef: ruta,
        mappings: { scalars: [], tables: [] },
      },
    }] },
    quote: { create: async ({ data }: { data: { data: { generacion: { payload: GeneracionExcelJob } } } }) => {
      trabajos.push(data.data.generacion.payload);
      return { id: String(trabajos.length) };
    } },
  };
  app.decorate('prisma', { ...tx, $transaction: async (run: (client: typeof tx) => unknown) => run(tx) } as unknown as typeof app.prisma);
  app.decorate('authenticate', async (request) => {
    request.user = {
      sub: '1', user: { permissions: { permisos: { cotizaciones: { crear_editar: true } } } },
    } as typeof request.user;
  });
  await app.register(cotizacionesRoutes);
  const guardar = (viaticos: number) => app.inject({
    method: 'PUT', url: '/api/v1/cotizaciones/7',
    payload: { idCotizacion: 7, viaticos, cambios: { descripcion: 'Ajuste de viáticos', aprobo: 'Supervisión' } },
  });
  try {
    const respuesta = await guardar(500);
    assert.equal(respuesta.statusCode, 200, respuesta.body);
    assert.deepEqual(trabajos.map(({ tipo, id_registro, action, codigo_actual }) => [tipo, id_registro, action, codigo_actual]), [
      [1, 7, undefined, 'COT-26-0007B'],
      [2, 13, 'ot_actualizar', 'OT-26-0013B'],
    ]);
    const sinCambios = await guardar(500);
    assert.equal(sinCambios.statusCode, 200, sinCambios.body);
    assert.equal(trabajos.length, 2);
  } finally {
    await app.close();
  }
});

test('una cotización homogénea usa su única orden y un grupo sin maestra no elige una hija arbitraria', () => {
  const unica = { ID_ORDEN_TRABAJO: 12, ID_OT_PADRE_FK: null };
  const otra = { ID_ORDEN_TRABAJO: 14, ID_OT_PADRE_FK: null };
  assert.equal(ordenPrincipalVigente([unica]), unica);
  assert.equal(ordenPrincipalVigente([unica, otra]), undefined);
  assert.equal(ordenPrincipalVigente([]), undefined);
});
