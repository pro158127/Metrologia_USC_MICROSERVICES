import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { Prisma } from '@prisma/client';
import enviosRoutes from '../src/routes/envios.routes.js';
import { cerrarSeguimientoSiCompleto } from '../src/services/seguimiento-cierre.service.js';

for (const primero of ['certificados', 'recepción'] as const) {
  test(`el cierre se registra una vez si se completa primero ${primero}`, async () => {
    const recepcion = { ESTADO: primero === 'recepción' ? 'ENTREGADO' : 'RECIBIDO' };
    const ot = {
      ID_ORDEN_TRABAJO: 2, ID_OT_PADRE_FK: 1,
      estado: primero === 'certificados' ? 'Certificado_enviado' : 'Certificado_aprobado',
      estado_pago: 'PAGADO', recepciones_equipo: [recepcion],
    };
    let estado = 'APROBADA';
    const eventos: string[] = [];
    const tx = {
      ordenes_trabajo: { findMany: async () => [{ ID_ORDEN_TRABAJO: 1, ID_OT_PADRE_FK: null }, ot] },
      cotizaciones: {
        findUnique: async () => ({ ESTADO: estado, CODIGO_COTIZACION: 'COT-26-0001C' }),
        updateMany: async () => {
          if (estado !== 'APROBADA') return { count: 0 };
          estado = 'EN_SEGUIMIENTO';
          return { count: 1 };
        },
      },
      historial_estado_cotizacion: { create: async () => eventos.push('historial') },
      seguimientos_comerciales: { create: async () => eventos.push('seguimiento') },
    } as unknown as Prisma.TransactionClient;
    assert.equal(await cerrarSeguimientoSiCompleto(tx, 1, 9), false);
    recepcion.ESTADO = 'ENTREGADO';
    ot.estado = 'Certificado_enviado';
    ot.estado_pago = 'PENDINDE';
    assert.equal(await cerrarSeguimientoSiCompleto(tx, 1, 9), false);
    ot.estado_pago = 'PAGADO';
    assert.equal(await cerrarSeguimientoSiCompleto(tx, 1, 9), true);
    assert.equal(await cerrarSeguimientoSiCompleto(tx, 1, 9), false);
    assert.deepEqual(eventos, ['historial', 'seguimiento']);
  });
}

test('documentos de envío distingue el cierre y rechaza el envío de un PDF sin sello vigente', async () => {
  const revisado = new Date('2026-11-20T10:00:00Z');
  const documento = {
    RUTA_URL: 'certificados/original.pdf',
    version_documentos: [{ RUTA_URL: 'certificados-generados/anterior/CERT-2.pdf', CREATED_AT: new Date('2026-11-19') }],
  };
  const recepcion = {
    CODIGO_RECEPCION: 'REC-26-0001B', ESTADO: 'BORRADOR', FECHA_SALIDA: new Date(),
    NOMBRE_RECIBE: 'Cristian', NOMBRE_EMPACA: 'Metrología', NOMBRE_RECIBE_SERVICIO: 'Solicitante',
    ACCESORIOS: 'Accesorios: Bueno - cable',
    recepcion_equipo_detalles: [{
      ID_UNIDAD_FK: 'unidad-2', ITEM: 1, INSTRUMENTO: 'Balanza', ESTAMPILLA: null, activacion: true,
      ESTADO_IBC: { salida: { E: true, T: false, D: true, A: true } },
      calibraciones: { certificados: {
        ID_CERTIFICADO: 2, ID_DOCUMENTO_FK: 3, CODIGO_CERTIFICADO: 'CERT-2',
        ESTADO_REVISION: 'APROBADO', REVISADO_AT: revisado, documentos: documento,
      } },
    }],
  };
  const ot = {
    ID_ORDEN_TRABAJO: 2, ID_COTIZACION_FK: 1, CODIGO_OT: 'OT-26-0001B', ID_OT_PADRE_FK: null,
    estado: 'Certificado_aprobado', estado_pago: 'PAGADO', VIGENTE: true, SITIO_CALIBRACION: 'LABORATORIO',
    CORREO_CERTIFICADO: 'cliente@example.invalid', orden_trabajo_detalles: [{ ID_UNIDAD_FK: 'unidad-2', ITEM: 1 }],
    recepciones_equipo: [recepcion],
  };
  const db = {
    correo_envios: { findFirst: async () => null },
    $queryRaw: async () => [],
    ordenes_trabajo: { findUnique: async () => ot, findMany: async () => [ot] },
    documentos: { findMany: async () => [{ ID_DOCUMENTO: 8, NOMBRE: 'Pago.pdf', RUTA_URL: 'comprobantes/Pago.pdf' }] },
  };
  const app = Fastify();
  app.decorate('authenticate', async (request: { user?: unknown }) => {
    request.user = { sub: '9', user: { permissions: { permisos: { entrega_y_envio: {
      previsualizar_antes_de_envio: true, enviar_certificados_lotes: true,
    } } } } };
  });
  app.decorate('prisma', { ...db, $transaction: async (operacion: (tx: typeof db) => Promise<unknown>) => operacion(db) });
  await app.register(enviosRoutes);
  try {
    const lectura = await app.inject('/api/v1/cotizaciones/1/documentos-envio');
    assert.equal(lectura.statusCode, 200, lectura.body);
    assert.equal(lectura.json().data.entregaCompleta, false);
    assert.deepEqual(lectura.json().data.selladoPendiente, ['CERT-2']);
    for (const url of ['/api/v1/cotizaciones/1/enviar-certificados', '/api/v1/ordenes/2/enviar-certificados']) {
      const rechazo = await app.inject({ method: 'POST', url });
      assert.equal(rechazo.statusCode, 409, rechazo.body);
      assert.match(rechazo.body, /PDF sellado pendiente/);
    }

    documento.version_documentos.unshift({ RUTA_URL: 'certificados-generados/revision/CERT-2.pdf', CREATED_AT: new Date('2026-11-20T11:00:00Z') });
    recepcion.ESTADO = 'ENTREGADO';
    const final = await app.inject('/api/v1/cotizaciones/1/documentos-envio');
    assert.equal(final.json().data.entregaCompleta, true);
    assert.deepEqual(final.json().data.selladoPendiente, []);
    assert.equal(final.json().data.certificados[0].rutaUrl, 'certificados-generados/revision/CERT-2.pdf');
    ot.estado = 'Certificado_enviado';
    const repetido = await app.inject({ method: 'POST', url: '/api/v1/cotizaciones/1/enviar-certificados' });
    assert.equal(repetido.statusCode, 409, repetido.body);
    assert.match(repetido.body, /órdenes enviadas/);
  } finally {
    await app.close();
  }
});
