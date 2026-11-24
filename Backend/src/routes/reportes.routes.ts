import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { FastifyInstance, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { obtenerDatosReporte, obtenerReporteAuditoriaFactura } from '../services/reportes.service.js';
import { getReportesQueue } from '../lib/queue/queue.js';
import { deleteObject, uploadBuffer } from '../lib/minioClient.js';
import { randomUUID } from 'node:crypto';
import { idTrabajoPdfFactura } from '../services/factura-pago.service.js';
import { AppError } from '../lib/errors.js';
import { assertAnyPermission, assertPermission } from '../lib/permissions.js';
import { getObjectStream } from '../lib/minioClient.js';
import {
  exportarReporteBodySchema,
  reporteDescargaQuerySchema,
  reporteJobParamsSchema,
  reporteTrazabilidadFacturaBodySchema,
  reportesQuerySchema,
  respuestaExportacionEncoladaSchema,
  respuestaReportesDataSchema,
  respuestaReporteJobSchema,
} from './reportes.schemas.js';

export default async function reportesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/reportes',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: reportesQuerySchema,
        response: { 200: respuestaReportesDataSchema },
      },
    },
    async (request) => {
      assertAnyPermission(request, [
        ['reportes_y_consolidados', 'ver_tablero_indicadores'],
        ['reportes_y_consolidados', 'exportar_base_de_datos'],
        ['reportes_y_consolidados', 'generar_consolidado_ventas'],
      ]);
      const data = await obtenerDatosReporte(fastify.prisma, request.query ?? {});
      return { ok: true as const, data };
    }
  );

  app.post(
    '/api/v1/reportes/exportar-pdf',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: exportarReporteBodySchema,
        response: { 202: respuestaExportacionEncoladaSchema },
      },
    },
    async (request, reply) => {
      assertPermission(request, 'reportes_y_consolidados', 'exportar_base_de_datos');
      const datos = await fastify.prisma.$transaction(
        (tx) => obtenerDatosReporte(tx, request.body ?? {}),
        { isolationLevel: 'RepeatableRead' },
      );
      const snapshotKey = `reportes/snapshots/${randomUUID()}.json`;
      await uploadBuffer(snapshotKey, Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), data: datos })), 'application/json');
      const queue = getReportesQueue();
      let job;
      try {
        job = await queue.add('exportar-reporte-pdf', {
          tipo: 'consolidado', formato: 'pdf', filtros: request.body ?? {}, snapshotKey,
          usuarioId: Number(request.user?.sub ?? 0),
        });
      } catch (error) {
        await deleteObject(snapshotKey).catch(() => undefined);
        throw error;
      }
      return reply.code(202).send({ ok: true as const, data: { jobId: String(job.id) } });
    }
  );

  app.post(
    '/api/v1/reportes/exportar-excel',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: exportarReporteBodySchema,
        response: { 202: respuestaExportacionEncoladaSchema },
      },
    },
    async (request, reply) => {
      assertPermission(request, 'reportes_y_consolidados', 'exportar_base_de_datos');
      const datos = await fastify.prisma.$transaction(
        (tx) => obtenerDatosReporte(tx, request.body ?? {}),
        { isolationLevel: 'RepeatableRead' },
      );
      const snapshotKey = `reportes/snapshots/${randomUUID()}.json`;
      await uploadBuffer(snapshotKey, Buffer.from(JSON.stringify({ generatedAt: new Date().toISOString(), data: datos })), 'application/json');
      const queue = getReportesQueue();
      let job;
      try {
        job = await queue.add('exportar-reporte-excel', {
          tipo: 'consolidado', formato: 'excel', filtros: request.body ?? {}, snapshotKey,
          usuarioId: Number(request.user?.sub ?? 0),
        });
      } catch (error) {
        await deleteObject(snapshotKey).catch(() => undefined);
        throw error;
      }
      return reply.code(202).send({ ok: true as const, data: { jobId: String(job.id) } });
    }
  );

  const validarConsultaFacturas = async (request: FastifyRequest) => {
    assertPermission(request, 'reportes_y_consolidados', 'generar_consolidado_ventas');
    const usuario = await fastify.prisma.usuarios.findUnique({
      where: { ID_USUARIO_AUTO_INCREMENT: Number(request.user?.sub ?? 0) },
      select: { roles: { select: { NOMBRE_ROL: true } } },
    });
    if (!['Director Técnico', 'Coordinadora'].includes(usuario?.roles.NOMBRE_ROL ?? '')) {
      throw new AppError(403, 'La consulta de facturas está disponible solo para Director Técnico y Coordinadora.');
    }
  };

  const facturaArchivada = async (request: FastifyRequest, numeroFactura: string) => {
    await validarConsultaFacturas(request);
    const factura = await fastify.prisma.facturas.findUnique({
      where: { NUMERO_FACTURA: numeroFactura },
      select: { ID_FACTURA: true, documentos: { select: { RUTA_URL: true, MIME_TYPE: true } } },
    });
    if (!factura) throw new AppError(404, 'No existe una factura con el número indicado.');
    return factura;
  };

  app.get('/api/v1/reportes/facturas', {
    preHandler: [fastify.authenticate],
    schema: { querystring: z.object({
      numero: z.string().trim().max(80).optional(),
      cotizacion: z.string().trim().max(80).optional(),
      orden: z.string().trim().max(80).optional(),
      cliente: z.string().trim().max(150).optional(),
    }) },
  }, async (request) => {
    await validarConsultaFacturas(request);
    const { numero, cotizacion, orden, cliente } = request.query;
    const contiene = (valor: string) => ({ contains: valor, mode: 'insensitive' as const });
    const condiciones: Prisma.facturasWhereInput[] = [];
    if (numero) condiciones.push({ NUMERO_FACTURA: contiene(numero) });
    if (cotizacion) condiciones.push({ OR: [
      { NUMERO_FACTURA: contiene(`FAC-${cotizacion}`) },
      { ordenes_trabajo: { cotizaciones: { CODIGO_COTIZACION: contiene(cotizacion) } } },
    ] });
    if (orden) condiciones.push({ OR: [
      { ordenes_trabajo: { CODIGO_OT: contiene(orden) } },
      { ordenes_trabajo: { cotizaciones: { ordenes_trabajo: { some: { CODIGO_OT: contiene(orden) } } } } },
    ] });
    if (cliente) condiciones.push({ OR: [
      { clientes: { OR: [{ RAZON_SOCIAL: contiene(cliente) }, { NIT: contiene(cliente) }] } },
      { ordenes_trabajo: { Razon_social: contiene(cliente) } },
    ] });
    const facturas = await fastify.prisma.facturas.findMany({
      where: { AND: condiciones },
      orderBy: [{ FECHA: 'desc' }, { ID_FACTURA: 'desc' }],
      select: {
        ID_FACTURA: true, NUMERO_FACTURA: true, FECHA: true, VALOR: true,
        clientes: { select: { RAZON_SOCIAL: true, NIT: true } },
        documentos: { select: { MIME_TYPE: true, RUTA_URL: true } },
        ordenes_trabajo: { select: { CODIGO_OT: true, Razon_social: true, cotizaciones: {
          select: { CODIGO_COTIZACION: true, ordenes_trabajo: {
            where: { VIGENTE: true }, select: { CODIGO_OT: true },
          } },
        } } },
      },
    });
    const trabajos = await fastify.prisma.quote.findMany({
      where: { id: { in: facturas.filter((factura) => !factura.documentos).map((factura) => idTrabajoPdfFactura(factura.ID_FACTURA)) } },
      select: { id: true, status: true },
    });
    const estados = new Map(trabajos.map(({ id, status }) => [id, status]));
    return { ok: true, data: facturas.map((factura) => {
      const ot = factura.ordenes_trabajo;
      const estado = estados.get(idTrabajoPdfFactura(factura.ID_FACTURA));
      const estadoPdf = factura.documentos?.MIME_TYPE === 'application/pdf' && factura.documentos.RUTA_URL ? 'disponible'
        : estado === 'FAILED' ? 'fallido' : estado === 'PENDING' || estado === 'PROCESSING' ? 'pendiente' : 'sin_pdf';
      return {
        numero: factura.NUMERO_FACTURA, fecha: factura.FECHA.toISOString(), valor: Number(factura.VALOR), estadoPdf,
        cliente: factura.clientes?.RAZON_SOCIAL ?? ot?.Razon_social ?? null, nit: factura.clientes?.NIT ?? null,
        cotizacion: ot?.cotizaciones?.CODIGO_COTIZACION ?? null,
        ordenes: [...new Set([...(ot ? [ot.CODIGO_OT] : []), ...(ot?.cotizaciones?.ordenes_trabajo.map(({ CODIGO_OT }) => CODIGO_OT) ?? [])])],
      };
    }) };
  });

  app.get(
    '/api/v1/reportes/facturas/:numeroFactura',
    { preHandler: [fastify.authenticate], schema: { params: reporteTrazabilidadFacturaBodySchema } },
    async (request) => {
      const { numeroFactura } = request.params;
      const factura = await facturaArchivada(request, numeroFactura);
      const datos = await obtenerReporteAuditoriaFactura(fastify.prisma, numeroFactura);
      if (!datos) throw new AppError(404, 'No existe una factura con el número indicado.');
      const disponible = factura.documentos?.MIME_TYPE === 'application/pdf' && Boolean(factura.documentos.RUTA_URL);
      const trabajo = !disponible && !factura.documentos ? await fastify.prisma.quote.findUnique({
        where: { id: idTrabajoPdfFactura(factura.ID_FACTURA) },
        select: { status: true },
      }) : null;
      const estadoPdf = disponible ? 'disponible'
        : trabajo?.status === 'FAILED' ? 'fallido'
        : trabajo && trabajo.status !== 'COMPLETED' ? 'pendiente' : 'sin_pdf';
      return {
        ok: true as const,
        data: {
          estadoPdf,
          resumen: {
            factura: datos.numeroFactura, cliente: datos.cliente, fecha: datos.fecha, valor: datos.valor,
            ots: [...new Set(datos.filas.map((fila) => fila.orden))].join(', ') || datos.ordenFactura,
            equipos: datos.filas.length,
            cert: [...new Set(datos.filas.map((fila) => fila.certificado).filter((codigo) => codigo !== '—'))].join(', ') || null,
          },
        },
      };
    },
  );

  app.get(
    '/api/v1/reportes/facturas/:numeroFactura/download',
    { preHandler: [fastify.authenticate], schema: { params: reporteTrazabilidadFacturaBodySchema } },
    async (request, reply) => {
      const { numeroFactura } = request.params;
      const factura = await facturaArchivada(request, numeroFactura);
      const documento = factura.documentos;
      if (documento?.MIME_TYPE !== 'application/pdf' || !documento.RUTA_URL) {
        throw new AppError(404, 'Esta factura aún no tiene un PDF archivado.');
      }
      const stream = await getObjectStream(documento.RUTA_URL);
      const nombre = numeroFactura.replace(/[^a-zA-Z0-9_-]/g, '_');
      return reply.header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${nombre}.pdf"`)
        .header('Cache-Control', 'private, no-store')
        .send(stream);
    },
  );

  app.get(
    '/api/v1/reportes/job/:jobId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: reporteJobParamsSchema,
        response: { 200: respuestaReporteJobSchema },
      },
    },
    async (request) => {
      assertAnyPermission(request, [
        ['reportes_y_consolidados', 'exportar_base_de_datos'],
        ['reportes_y_consolidados', 'generar_consolidado_ventas'],
      ]);
      const queue = getReportesQueue();
      const job = await queue.getJob(request.params.jobId);
      if (!job) throw new AppError(404, 'Job no encontrado');
      if (job.data?.usuarioId != null && Number(job.data.usuarioId) !== Number(request.user?.sub ?? 0)) {
        throw new AppError(403, 'No tienes acceso a este reporte.');
      }

      const state = await job.getState();

      if (state === 'completed') {
        const rv = job.returnvalue as {
          key?: string;
          tipo?: string;
          resumen?: { factura: string; cliente: string; fecha: string | null; valor: number; ots: string; equipos: number; cert: string | null };
          archivos?: { pdf?: { key?: string }; excel?: { key?: string } };
        } | undefined;
        const baseUrl = `/api/reportes/${encodeURIComponent(request.params.jobId)}/download`;
        return {
          ok: true as const,
          data: {
            status: 'completed',
            url: rv?.key ? baseUrl : null,
            ...(rv?.tipo === 'trazabilidad_factura' ? {
              archivos: {
                pdf: rv.archivos?.pdf?.key ? `${baseUrl}?formato=pdf` : null,
                excel: rv.archivos?.excel?.key ? `${baseUrl}?formato=excel` : null,
              },
              ...(rv.resumen ? { resumen: rv.resumen } : {}),
            } : {}),
            error: rv?.key || rv?.archivos?.pdf?.key || rv?.archivos?.excel?.key
              ? null
              : 'El reporte terminó sin registrar su archivo. Genérelo nuevamente.',
          },
        };
      }
      if (state === 'failed') {
        return {
          ok: true as const,
          data: { status: 'failed', url: null, error: job.failedReason || 'Procesamiento fallido' },
        };
      }
      return {
        ok: true as const,
        data: {
          status: state === 'active' ? 'processing' : state || 'pending',
          url: null,
          error: null,
        },
      };
    }
  );

  // La descarga se sirve desde el backend: MinIO se consulta internamente y
  // nunca se expone al navegador una URL firmada cuyo host cruce el túnel.
  app.get(
    '/api/v1/reportes/job/:jobId/download',
    {
      preHandler: [fastify.authenticate],
      schema: { params: reporteJobParamsSchema, querystring: reporteDescargaQuerySchema },
    },
    async (request, reply) => {
      assertAnyPermission(request, [
        ['reportes_y_consolidados', 'exportar_base_de_datos'],
        ['reportes_y_consolidados', 'generar_consolidado_ventas'],
      ]);
      const job = await getReportesQueue().getJob(request.params.jobId);
      if (!job) throw new AppError(404, 'Reporte no encontrado o expirado. Genérelo nuevamente.');
      if (job.data?.usuarioId != null && Number(job.data.usuarioId) !== Number(request.user?.sub ?? 0)) {
        throw new AppError(403, 'No tienes acceso a este reporte.');
      }
      if (await job.getState() !== 'completed') {
        throw new AppError(409, 'El reporte todavía no está listo para descargar.');
      }

      const resultado = job.returnvalue as {
        key?: string; filename?: string; mime?: string;
        archivos?: { pdf?: { key: string; filename: string; mime: string }; excel?: { key: string; filename: string; mime: string } };
      } | undefined;
      const archivo = resultado?.archivos
        ? resultado.archivos[request.query.formato ?? 'pdf']
        : resultado;
      if (!archivo?.key || !archivo.filename || !archivo.mime) {
        throw new AppError(404, 'El archivo del reporte no está disponible. Genérelo nuevamente.');
      }

      const stream = await getObjectStream(archivo.key);
      return reply
        .header('Content-Type', archivo.mime)
        .header('Content-Disposition', `attachment; filename="${archivo.filename}"`)
        .header('Cache-Control', 'private, no-store')
        .send(stream);
    }
  );
}
