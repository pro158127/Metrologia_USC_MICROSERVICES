import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { obtenerDatosReporte } from '../services/reportes.service.js';
import { getReportesQueue } from '../lib/queue/queue.js';
import { AppError } from '../lib/errors.js';
import { assertAnyPermission, assertPermission } from '../lib/permissions.js';
import { getObjectBuffer } from '../lib/minioClient.js';
import {
  exportarReporteBodySchema,
  reporteJobParamsSchema,
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
      const queue = getReportesQueue();
      const job = await queue.add('exportar-reporte-pdf', {
        formato: 'pdf',
        filtros: request.body ?? {},
        usuarioId: Number(request.user?.sub ?? 0),
      });
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
      const queue = getReportesQueue();
      const job = await queue.add('exportar-reporte-excel', {
        formato: 'excel',
        filtros: request.body ?? {},
        usuarioId: Number(request.user?.sub ?? 0),
      });
      return reply.code(202).send({ ok: true as const, data: { jobId: String(job.id) } });
    }
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
        const rv = job.returnvalue as { key?: string } | undefined;
        return {
          ok: true as const,
          data: {
            status: 'completed',
            url: rv?.key ? `/api/reportes/${encodeURIComponent(request.params.jobId)}/download` : null,
            error: rv?.key ? null : 'El reporte terminó sin registrar su archivo. Genérelo nuevamente.',
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
      schema: { params: reporteJobParamsSchema },
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

      const archivo = job.returnvalue as { key?: string; filename?: string; mime?: string } | undefined;
      if (!archivo?.key || !archivo.filename || !archivo.mime) {
        throw new AppError(404, 'El archivo del reporte no está disponible. Genérelo nuevamente.');
      }

      const buffer = await getObjectBuffer(archivo.key);
      return reply
        .header('Content-Type', archivo.mime)
        .header('Content-Disposition', `attachment; filename="${archivo.filename}"`)
        .header('Cache-Control', 'private, no-store')
        .send(buffer);
    }
  );
}
