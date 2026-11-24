import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import ordenesRoutes from '../src/routes/ordenes.routes.js';

test('consolidar OT conserva las unidades y versiona la recepción si cambia un campo compartido', async () => {
  const unidad = {
    ID_DETALLE: 4, ITEM: 1, TIPO_SERVICIO: 'ACREDITADO', INSTRUMENTO: 'Manómetro',
    FABRICANTE: 'Anterior', MODELO: 'M', SERIE: 'S', CODIGO_INVENTARIO: 'I',
    UBICACION: null, PUNTOS_CALIBRAR: [], UNIDAD: null, INTERVALO_RANGO: null,
    RESOLUCION: '1', DECLARACION_CONFORMIDAD: false, LIMITE_CONTROL_EMC: null,
    DOC_ESPECIFICACION: null, REGLA_DECISION: null, asignado: null, ID_UNIDAD_FK: 'unidad',
  };
  const recibida = {
    ID_INSTRUMENTO: 9, ID_UNIDAD_FK: 'unidad', ITEM: 1, MARCA: 'Anterior',
    MODELO: 'M', SERIE: 'S', CODIGO_INVENTARIO: 'I', RESOLUCION: '1', calibraciones: null,
  };
  const recepcion = { ID_RECEPCION: 8, CODIGO_RECEPCION: 'REC-26-0001A', VERSION: 1, recepcion_equipo_detalles: [recibida] };
  const orden = {
    ID_ORDEN_TRABAJO: 3, VIGENTE: true, CODIGO_OT: 'OT-26-0001A', VERSION: 1, estado: 'Creada', OBSERVACIONES: null as string | null,
    RESPONSABLE: null as string | null, FECHA_CALIBRACION: null as Date | null, HORA_CALIBRACION: null as Date | null,
    recepciones_equipo: [recepcion], orden_trabajo_detalles: [unidad],
  };
  const documentos: number[] = [];
  const tx = {
    $transaction: async (operacion: (db: unknown) => Promise<unknown>) => operacion(tx),
    $queryRaw: async () => [],
    ordenes_trabajo: {
      findUnique: async () => orden, findUniqueOrThrow: async () => orden, count: async () => 0,
      update: async ({ data }: { data: object }) => Object.assign(orden, data),
    },
    orden_trabajo_detalles: {
      findMany: async () => [unidad],
      update: async ({ data }: { data: object }) => Object.assign(unidad, data),
    },
    recepciones_equipo: {
      findMany: async () => [recepcion], findUniqueOrThrow: async () => recepcion,
      update: async ({ data }: { data: { CODIGO_RECEPCION: string; VERSION: { increment: number } } }) =>
        Object.assign(recepcion, { CODIGO_RECEPCION: data.CODIGO_RECEPCION, VERSION: recepcion.VERSION + data.VERSION.increment }),
    },
    recepcion_equipo_detalles: { update: async ({ data }: { data: object }) => Object.assign(recibida, data) },
    calibraciones: { findMany: async () => [] },
    certificados: { findMany: async () => [] },
    version_plantillas: { findMany: async () => [{
      ID_VERSION_PLANTILLA: 1, documentos: { RUTA_URL: 'fixture.xlsx' }, INPUT_SCHEMA: { fields: {} },
      MAPPING_CONFIG: { templateId: 1, templateType: 'prueba', version: '1', fileRef: 'fixture.xlsx', mappings: { scalars: [], tables: [] } },
    }] },
    quote: { create: async ({ data }: { data: { data: { generacion: { payload: { tipo: number } } } } }) => {
      documentos.push(data.data.generacion.payload.tipo);
      return { id: 'prueba' };
    } },
    audit_logs: { create: async () => {} },
  };
  const app = Fastify();
  app.decorate('prisma', tx as never);
  app.decorate('authenticate', async (request) => {
    Object.assign(request, { user: { sub: '1', user: { permissions: { permisos: { ordenes_de_trabajo: { crear_editar: true } } } } } });
  });
  await app.register(ordenesRoutes);

  const fila = {
    idDetalle: 4, item: 1, tipoServicio: 'ACREDITADO', instrumento: 'Manómetro', fabricante: 'Nuevo',
    modelo: 'M', serie: 'S', codigoInventario: 'I', ubicacion: 'Laboratorio', declaracionConformidad: false,
    resolucion: '1', asignado: 0,
  };
  const consolidar = (instrumentos: (typeof fila)[], codigoActual = orden.CODIGO_OT, observaciones?: string | null, calibracion?: {
    horaCalibracion?: string | null; fechaCalibracion?: string | null; responsableUsc?: string;
  }) => app.inject({
    method: 'PUT', url: '/api/v1/ordenes/3/consolidar',
    payload: { codigoActual, observaciones, responsableUsc: null, fechaDiligenciamiento: null, lugarCalibracion: calibracion ? 'En sitio' : 'Laboratorio', instrumentos, ...calibracion },
  });
  try {
    assert.equal((await consolidar([{ ...fila, tipoServicio: 'NO ACREDITADO' }])).statusCode, 409);
    assert.equal((await consolidar([])).statusCode, 409);
    assert.equal((await consolidar([fila], 'OT-26-0000A')).statusCode, 409);
    const resultado = await consolidar([fila]);
    assert.equal(resultado.statusCode, 200, resultado.body);
    assert.equal(unidad.UBICACION, 'Laboratorio');
    assert.equal(recibida.MARCA, 'Nuevo');
    assert.equal(recepcion.CODIGO_RECEPCION, 'REC-26-0001B');
    assert.equal(resultado.json().codigo, 'OT-26-0001B');
    assert.deepEqual(documentos, [3, 2]);

    const sinCambio = await consolidar([fila]);
    assert.equal(sinCambio.statusCode, 200, sinCambio.body);
    assert.deepEqual(documentos, [3, 2]);

    const nuevaObservacion = await consolidar([fila], orden.CODIGO_OT, '  Verificar accesorios.  ');
    assert.equal(nuevaObservacion.statusCode, 200, nuevaObservacion.body);
    assert.equal(orden.OBSERVACIONES, 'Verificar accesorios.');
    assert.equal(nuevaObservacion.json().codigo, 'OT-26-0001C');
    assert.deepEqual(documentos, [3, 2, 2]);
    assert.equal((await consolidar([fila], orden.CODIGO_OT, null)).statusCode, 200);
    assert.equal(orden.OBSERVACIONES, null);

    const datosCalibracion = { fechaCalibracion: '2026-11-24', horaCalibracion: '14:35', responsableUsc: '  Andrea Pérez  ' };
    const calibracionGuardada = await consolidar([fila], orden.CODIGO_OT, undefined, datosCalibracion);
    assert.equal(calibracionGuardada.statusCode, 200, calibracionGuardada.body);
    assert.equal(calibracionGuardada.json().responsable, 'Andrea Pérez');
    assert.equal(orden.RESPONSABLE, 'Andrea Pérez');
    assert.equal(orden.HORA_CALIBRACION?.toISOString(), '2026-11-24T14:35:00.000Z');
    assert.equal((await consolidar([fila], orden.CODIGO_OT, undefined, { horaCalibracion: '24:30' })).statusCode, 400);
    const otraHora = await consolidar([fila], orden.CODIGO_OT, undefined, { horaCalibracion: '08:10' });
    assert.equal(otraHora.statusCode, 200, otraHora.body);
    assert.equal(orden.HORA_CALIBRACION?.toISOString(), '2026-11-24T08:10:00.000Z');
    assert.equal(otraHora.json().responsable, 'Andrea Pérez');
    const sinHora = await consolidar([fila], orden.CODIGO_OT, undefined, { horaCalibracion: null });
    assert.equal(sinHora.statusCode, 200, sinHora.body);
    assert.equal(orden.HORA_CALIBRACION, null);
    assert.equal(orden.FECHA_CALIBRACION?.toISOString(), '2026-11-24T00:00:00.000Z');
  } finally {
    await app.close();
  }
});
