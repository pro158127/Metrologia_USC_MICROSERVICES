// routes/certificate-generator.routes.ts
// Encola la generación asíncrona de certificados (plantilla + documento + sellos).
// El trabajo real se ejecuta en workers/certificatePdf.worker.ts para no bloquear
// el Event Loop de la API (pdf-lib + IO de MinIO).
import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { getCertificatePdfQueue } from '../lib/queue/queue.js';

const areaBoxSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(0).max(100),
  height: z.number().min(0).max(100),
});

const watermarkAreaSchema = z.object({
  id: z.string(),
  box: areaBoxSchema,
  opacity: z.number().min(0).max(1),
});

const generateCertificateSchema = z.object({
  templatePdfKeyOrUrl: z.string().min(1),
  documentPdfKeyOrUrl: z.string().min(1),
  documentArea: areaBoxSchema,
  watermarkAreas: z.array(watermarkAreaSchema).default([]),
  pageRange: z.object({ start: z.number().int().min(1), end: z.number().int().min(1) }).optional(),
  outputName: z.string().min(1).optional(),
});

const jobParamsSchema = z.object({ jobId: z.string().min(1) });

export default async function certificateGeneratorRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/certificados/generar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: generateCertificateSchema,
      },
    },
    async (request, reply) => {
      const body = request.body;
      const usuarioId = Number(request.user?.sub ?? 0) || undefined;

      const queue = getCertificatePdfQueue();
      const job = await queue.add('compose-certificate', {
        tipo: 'compose',
        templatePdfKeyOrUrl: body.templatePdfKeyOrUrl,
        documentPdfKeyOrUrl: body.documentPdfKeyOrUrl,
        documentArea: body.documentArea,
        watermarkAreas: body.watermarkAreas,
        pageRange: body.pageRange,
        outputName: body.outputName,
        usuarioId,
      });

      return reply.code(202).send({
        ok: true as const,
        data: { status: 'pending', jobId: job.id },
      });
    }
  );

  app.get(
    '/api/v1/certificados/generar/job/:jobId',
    {
      preHandler: [fastify.authenticate],
      schema: { params: jobParamsSchema },
    },
    async (request) => {
      const queue = getCertificatePdfQueue();
      const job = await queue.getJob(request.params.jobId);

      if (!job) throw new AppError(404, 'Job no encontrado');

      const state = await job.getState();

      if (state === 'completed') {
        return {
          ok: true as const,
          data: { status: 'completed', ...(job.returnvalue as Record<string, unknown>) },
        };
      }

      if (state === 'failed') {
        return {
          ok: true as const,
          data: { status: 'failed', error: job.failedReason || 'Procesamiento fallido' },
        };
      }

      return {
        ok: true as const,
        data: {
          status: state === 'active' ? 'processing' : state || 'pending',
          jobId: request.params.jobId,
        },
      };
    }
  );
}
