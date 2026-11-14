import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { obtenerDatosReporte } from '../services/reportes.service.js';
import { getReportesQueue } from '../lib/queue/queue.js';
import { AppError } from '../lib/errors.js';
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
      const queue = getReportesQueue();
      const job = await queue.add('exportar-reporte-pdf', {
        formato: 'pdf',
        filtros: request.body ?? {},
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
      const queue = getReportesQueue();
      const job = await queue.add('exportar-reporte-excel', {
        formato: 'excel',
        filtros: request.body ?? {},
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
      const queue = getReportesQueue();
      const job = await queue.getJob(request.params.jobId);
      if (!job) throw new AppError(404, 'Job no encontrado');

      const state = await job.getState();

      if (state === 'completed') {
        const rv = job.returnvalue as { url?: string } | undefined;
        return {
          ok: true as const,
          data: { status: 'completed', url: rv?.url ?? null, error: null },
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
}
