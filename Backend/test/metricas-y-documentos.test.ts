import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import cotizacionesRoutes from '../src/routes/cotizaciones.routes.js';
import { obtenerDatosReporte } from '../src/services/reportes.service.js';

const fecha = new Date('2026-11-20T20:00:00Z');

test('el perfil enlaza solo los códigos vigentes y deja los documentos anteriores en trazabilidad', async () => {
  const version = (id: number, ruta: string) => ({ ID_VERSION: id, VERSION: id, RUTA_URL: ruta, CREATED_AT: fecha });
  const doc = (id: number, ruta: string, cambios: object) => ({
    ID_DOCUMENTO: id, NOMBRE: 'nombre-obsoleto.pdf', RUTA_URL: ruta,
    MIME_TYPE: 'application/pdf', CREATED_AT: fecha, ordenPagoId: null, ...cambios,
  });
  const ot = (id: number, codigo: string, vigente: boolean, sitio: string) => ({
    ID_ORDEN_TRABAJO: id, CODIGO_OT: codigo, VIGENTE: vigente, SITIO_CALIBRACION: sitio,
    ID_OT_RAIZ: 2, ID_OT_PADRE_FK: null, VERSION: id, CREATED_AT: fecha,
  });
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', {
    cotizaciones: { findUnique: async () => ({ CODIGO_COTIZACION: 'COT-26-0001C' }) },
    ordenes_trabajo: { findMany: async () => [ot(2, 'OT-26-0002B', false, 'LABORATORIO'), ot(3, 'OT-26-0002C', true, 'LABORATORIO')] },
    recepciones_equipo: { findMany: async () => [{
      ID_RECEPCION: 5, CODIGO_RECEPCION: 'REC-26-0005B', VIGENTE: true, activacion: true,
      ID_ORDEN_TRABAJO_FK: 3, VERSION: 1, CREATED_AT: fecha,
    }] },
    documentos: { findMany: async () => [
      doc(1, 'cotizaciones_generadas/COT-26-0001B.pdf', { ID_COTIZACION_FK: 1,
        ID_ORDEN_TRABAJO_FK: null, ID_RECEPCION_FK: null, version_documentos: [] }),
      doc(2, 'ordenes_trabajo_generadas/OT-26-0002B.pdf', { ID_ORDEN_TRABAJO_FK: 2,
        ID_RECEPCION_FK: null, version_documentos: [version(12, 'ordenes_trabajo_generadas/OT-26-0002C.pdf')] }),
      doc(3, 'ordenes_trabajo_generadas/job-3/OT-26-0002C.pdf', { ID_ORDEN_TRABAJO_FK: 3,
        ID_RECEPCION_FK: null, version_documentos: [] }),
    ] },
    certificados: { findMany: async () => [{
      ID_CERTIFICADO: 11, CODIGO_CERTIFICADO: 'CERT-11', ID_DOCUMENTO_FK: 24,
      ESTADO_REVISION: 'RECHAZADO', certificado_sellos: [],
      documentos: doc(24, 'certificados/archivo-cliente.pdf', { version_documentos: [version(24, 'certificados/archivo-cliente.pdf')] }),
    }, {
      ID_CERTIFICADO: 12, CODIGO_CERTIFICADO: 'CERT-12', ID_DOCUMENTO_FK: 25,
      ESTADO_REVISION: 'APROBADO', REVISADO_AT: fecha, certificado_sellos: [],
      calibraciones: { recepcion_equipo_detalles: { ID_RECEPCION_FK: 5, activacion: true } },
      documentos: doc(25, 'certificados/sin-sello.pdf', { version_documentos: [version(25, 'certificados/sin-sello.pdf')] }),
    }, {
      ID_CERTIFICADO: 13, CODIGO_CERTIFICADO: 'CERT-13', ID_DOCUMENTO_FK: 26,
      ESTADO_REVISION: 'APROBADO', REVISADO_AT: fecha, certificado_sellos: [],
      calibraciones: { recepcion_equipo_detalles: { ID_RECEPCION_FK: 5, activacion: true } },
      documentos: doc(26, 'certificados-generados/revision-26/CERT-13.pdf',
        { version_documentos: [version(26, 'certificados-generados/revision-26/CERT-13.pdf')] }),
    }] },
  });
  await app.register(cotizacionesRoutes);
  try {
    const response = await app.inject('/api/v1/cotizaciones/1/documentos');
    assert.equal(response.statusCode, 200, response.body);
    const { data } = response.json();
    assert.deepEqual(data.categorias.cotizacion, []);
    assert.deepEqual(data.pendientes.cotizacion, ['COT-26-0001C']);
    assert.equal(data.archivados.cotizacion[0].versiones[0].nombre, 'COT-26-0001B.pdf');
    assert.deepEqual(data.categorias.ordenTrabajo.map((item: { idDocumento: number; nombre: string }) =>
      [item.idDocumento, item.nombre]), [[3, 'OT-26-0002C.pdf']]);
    assert.equal(data.archivados.ordenTrabajo[0].versiones.length, 2);
    assert.deepEqual(data.pendientes.certificados, ['CERT-12']);
    assert.deepEqual(data.categorias.certificados.map((cert: { nombre: string }) => cert.nombre), ['CERT-13.pdf']);
    assert.equal(data.archivados.certificados[0].nombre, 'CERT-11.pdf');
  } finally {
    await app.close();
  }
});

test('el reporte cuenta grupos internos operativos y calcula la conversión con cotizaciones emitidas', async () => {
  const interna = { ID_COTIZACION_FK: 12, ID_OT_RAIZ: 1, ID_ORDEN_TRABAJO: 8,
    SITIO_CALIBRACION: 'INTERNO_USC', ES_INTERNO_USC: true, ES_EN_SITIO: false, CREATED_AT: fecha };
  const prisma = {
    certificados: { findMany: async () => [] },
    calibraciones: { findMany: async () => [] },
    facturas: { findMany: async () => [{ NUMERO_FACTURA: 'FAC-1', FECHA: fecha, VALOR: 201, clientes: { RAZON_SOCIAL: 'Laboratorio' } }] },
    cotizaciones: { findMany: async () => [
      { ESTADO: 'BORRADOR', CREATED_AT: fecha, historial_estado_cotizacion: [] },
      { ESTADO: 'EN_SEGUIMIENTO', CREATED_AT: fecha, historial_estado_cotizacion: [
        { ESTADO_NUEVO: 'ENVIADA', CREATED_AT: fecha }, { ESTADO_NUEVO: 'APROBADA', CREATED_AT: fecha },
      ] },
      { ESTADO: 'ENVIADA', CREATED_AT: fecha, historial_estado_cotizacion: [] },
    ] },
    ordenes_trabajo: { findMany: async ({ where }: { where: object }) => {
      assert.deepEqual(where, {
        VIGENTE: true, estado: { not: 'Certificado_enviado' }, orden_trabajo_hijas: { none: {} },
        recepciones_equipo: { some: { VIGENTE: true, activacion: true } },
      });
      return [interna, { ...interna, ID_ORDEN_TRABAJO: 7 }];
    } },
  } as unknown as PrismaClient;
  const datos = await obtenerDatosReporte(prisma, { fechaInicio: '2026-11-01', fechaFin: '2026-11-30' });
  assert.deepEqual(datos.kpis, { cotizacionesEmitidas: 2, tasaConversion: 50, ingresos: 201, ordenesInternas: 1 });
  assert.deepEqual(datos.series.at(-1), { mes: datos.series.at(-1)?.mes, interno: 1, externo: 0, tasa: 50 });
});

test('las métricas del dashboard abarcan todas las cotizaciones y conservan la fecha de aprobación', async () => {
  const app = Fastify();
  app.decorate('authenticate', async () => {});
  app.decorate('prisma', {
    cotizaciones: { findMany: async (query: { take?: number }) => {
      assert.equal(query.take, undefined);
      return [
        ...Array.from({ length: 11 }, () => ({ ESTADO: 'BORRADOR', CREATED_AT: fecha, historial_estado_cotizacion: [] })),
        { ESTADO: 'EN_SEGUIMIENTO', CREATED_AT: fecha, historial_estado_cotizacion: [
          { ESTADO_NUEVO: 'ENVIADA', CREATED_AT: fecha }, { ESTADO_NUEVO: 'APROBADA', CREATED_AT: fecha },
        ] },
      ];
    } },
  });
  await app.register(cotizacionesRoutes);
  try {
    const response = await app.inject('/api/v1/cotizaciones/metricas-dashboard');
    assert.equal(response.statusCode, 200, response.body);
    const datos = response.json();
    assert.equal(datos.length, 12);
    assert.equal(datos[0].emitidaAt, null);
    assert.equal(datos[11].aprobadaAt, fecha.toISOString());
  } finally {
    await app.close();
  }
});
