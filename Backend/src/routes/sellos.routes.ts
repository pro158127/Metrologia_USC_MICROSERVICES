import { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { PDFDocument } from 'pdf-lib';
import { AppError } from '../lib/errors.js';
import {
  deleteObject,
  getObjectBuffer,
  getSignedObjectUrl,
  uploadBuffer,
} from '../lib/minioClient.js';
import { getRedisConnection, getStampPdfQueue } from '../lib/queue/queue.js';
import {
  idParamSchema,
  jobIdParamSchema,
  plantillaSelloRawToDtoSchema,
  PlantillaSelloDto,
  respuestaEliminacionSchema,
  respuestaJobStatusSchema,
  respuestaPlantillaSelloSchema,
  respuestaPlantillasSellosSchema,
  respuestaSellosSchema,
  respuestaStampSchema,
  selloRawToDtoSchema,
} from './sellos.schemas.js';

const ALLOWED_MIMETYPES = ['application/pdf'];
const TEMPLATE_PREFIX = 'plantillas-sellos/';
const TEMP_INPUT_PREFIX = 'temp-inputs/';
const PAGE_SIZE_CACHE_PREFIX = 'sello:pagesize:';
const PAGE_SIZE_CACHE_TTL = 24 * 60 * 60;

async function tamanoPaginaPdf(buffer: Buffer): Promise<{ width: number; height: number } | null> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    const page = doc.getPage(0);
    const { width, height } = page.getSize();
    return { width, height };
  } catch {
    return null;
  }
}

async function resolverTamanoPagina(
  selloId: number,
  templatePdfKey: string | null
): Promise<{ width: number; height: number } | null> {
  if (!templatePdfKey) return null;
  try {
    const redis = getRedisConnection();
    const cacheKey = `${PAGE_SIZE_CACHE_PREFIX}${selloId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as { width: number; height: number };
    const buffer = await getObjectBuffer(templatePdfKey);
    const size = await tamanoPaginaPdf(buffer);
    if (size) await redis.set(cacheKey, JSON.stringify(size), 'EX', PAGE_SIZE_CACHE_TTL);
    return size;
  } catch {
    return null;
  }
}

function parseJsonField<T>(value: string | undefined, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function conUrlFirmada(dto: PlantillaSelloDto): Promise<PlantillaSelloDto> {
  let templatePdfUrl: string | null = null;
  if (dto.templatePdfKey) {
    try {
      templatePdfUrl = await getSignedObjectUrl(dto.templatePdfKey, 3600);
    } catch {
      templatePdfUrl = null;
    }
  }
  const size = await resolverTamanoPagina(dto.id, dto.templatePdfKey);
  return { ...dto, templatePdfUrl, templatePdfWidth: size?.width ?? null, templatePdfHeight: size?.height ?? null };
}

async function readMultipart(
  request: FastifyRequest
): Promise<{
  fields: Record<string, string>;
  fileBuffer: Buffer | null;
  fileMime: string | null;
  fileName: string | null;
}> {
  const fields: Record<string, string> = {};
  let fileBuffer: Buffer | null = null;
  let fileMime: string | null = null;
  let fileName: string | null = null;

  const parts = (request as any).parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      fileBuffer = await part.toBuffer();
      fileMime = part.mimetype ?? null;
      fileName = part.filename ?? null;
    } else if (part.type === 'field') {
      fields[part.fieldname] = String(part.value ?? '');
    }
  }
  return { fields, fileBuffer, fileMime, fileName };
}

export default async function sellosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/sellos/catalogo',
    {
      preHandler: [fastify.authenticate],
      schema: { response: { 200: respuestaSellosSchema } },
    },
    async () => {
      const sellos = await fastify.prisma.sellos.findMany({
        orderBy: { ID_SELLO: 'asc' },
      });
      return { ok: true as const, data: sellos.map((s) => selloRawToDtoSchema.parse(s)) };
    }
  );

  app.get(
    '/api/v1/sellos',
    {
      preHandler: [fastify.authenticate],
      schema: { response: { 200: respuestaPlantillasSellosSchema } },
    },
    async () => {
      const rows = await fastify.prisma.plantillas_sellos.findMany({
        orderBy: { ID_PLANTILLA_SELLO: 'asc' },
      });
      const data = await Promise.all(
        rows.map((row) => conUrlFirmada(plantillaSelloRawToDtoSchema.parse(row)))
      );
      return { ok: true as const, data };
    }
  );

  app.get(
    '/api/v1/sellos/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaPlantillaSelloSchema },
      },
    },
    async (request) => {
      const row = await fastify.prisma.plantillas_sellos.findUnique({
        where: { ID_PLANTILLA_SELLO: request.params.id },
      });
      if (!row) throw new AppError(404, 'Plantilla de sello no encontrada');
      return { ok: true as const, data: await conUrlFirmada(plantillaSelloRawToDtoSchema.parse(row)) };
    }
  );

  app.post(
    '/api/v1/sellos',
    {
      preHandler: [fastify.authenticate],
      schema: { response: { 201: respuestaPlantillaSelloSchema } },
    },
    async (request, reply) => {
      const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

      const nombre = fields.nombre || 'Sin nombre';
      const descripcion = fields.descripcion ?? null;
      const documentArea = parseJsonField<unknown>(fields.documentArea, null);
      const watermarkAreas = parseJsonField<unknown[]>(fields.watermarkAreas, []);

      let templatePdfKey: string | null = null;
      if (fileBuffer) {
        if (!fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
          throw new AppError(415, 'La plantilla base debe ser un PDF (application/pdf)');
        }
        const originalName = fileName || 'plantilla.pdf';
        templatePdfKey = `${TEMPLATE_PREFIX}${Date.now()}_${originalName}`;
        await uploadBuffer(templatePdfKey, fileBuffer, fileMime, { originalName });
      }

      const created = await fastify.prisma.plantillas_sellos.create({
        data: {
          NOMBRE: nombre,
          DESCRIPCION: descripcion,
          TEMPLATE_PDF_KEY: templatePdfKey,
          DOCUMENT_AREA: (documentArea as any) ?? Prisma.DbNull,
          WATERMARK_AREAS: (watermarkAreas as any) ?? Prisma.DbNull,
        },
      });

      return reply.code(201).send({
        ok: true as const,
        data: await conUrlFirmada(plantillaSelloRawToDtoSchema.parse(created)),
      });
    }
  );

  app.put(
    '/api/v1/sellos/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaPlantillaSelloSchema },
      },
    },
    async (request) => {
      const existing = await fastify.prisma.plantillas_sellos.findUnique({
        where: { ID_PLANTILLA_SELLO: request.params.id },
      });
      if (!existing) throw new AppError(404, 'Plantilla de sello no encontrada');

      const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

      let templatePdfKey = existing.TEMPLATE_PDF_KEY;
      if (fileBuffer) {
        if (!fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
          throw new AppError(415, 'La plantilla base debe ser un PDF (application/pdf)');
        }
        const originalName = fileName || 'plantilla.pdf';
        const newKey = `${TEMPLATE_PREFIX}${Date.now()}_${originalName}`;
        await uploadBuffer(newKey, fileBuffer, fileMime, { originalName });
        templatePdfKey = newKey;
        if (existing.TEMPLATE_PDF_KEY && existing.TEMPLATE_PDF_KEY !== newKey) {
          try {
            await deleteObject(existing.TEMPLATE_PDF_KEY);
          } catch {
            // no-op
          }
        }
      }

      const data: Prisma.plantillas_sellosUpdateInput = {
        NOMBRE: fields.nombre !== undefined ? fields.nombre || existing.NOMBRE : existing.NOMBRE,
        DESCRIPCION:
          fields.descripcion !== undefined ? fields.descripcion || null : existing.DESCRIPCION,
        TEMPLATE_PDF_KEY: templatePdfKey,
      };
      if (fields.documentArea !== undefined) {
        const parsed = parseJsonField<unknown>(fields.documentArea, null);
        data.DOCUMENT_AREA = (parsed as any) ?? Prisma.DbNull;
      }
      if (fields.watermarkAreas !== undefined) {
        const parsed = parseJsonField<unknown[]>(fields.watermarkAreas, []);
        data.WATERMARK_AREAS = (parsed as any) ?? Prisma.DbNull;
      }

      const updated = await fastify.prisma.plantillas_sellos.update({
        where: { ID_PLANTILLA_SELLO: request.params.id },
        data,
      });

      return {
        ok: true as const,
        data: await conUrlFirmada(plantillaSelloRawToDtoSchema.parse(updated)),
      };
    }
  );

  app.delete(
    '/api/v1/sellos/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaEliminacionSchema },
      },
    },
    async (request) => {
      const existing = await fastify.prisma.plantillas_sellos.findUnique({
        where: { ID_PLANTILLA_SELLO: request.params.id },
      });
      if (!existing) throw new AppError(404, 'Plantilla de sello no encontrada');
      await fastify.prisma.plantillas_sellos.delete({
        where: { ID_PLANTILLA_SELLO: request.params.id },
      });
      if (existing.TEMPLATE_PDF_KEY) {
        try {
          await deleteObject(existing.TEMPLATE_PDF_KEY);
        } catch {
          // no-op
        }
      }
      return { ok: true as const, data: { id: request.params.id } };
    }
  );

  app.post(
    '/api/v1/sellos/stamp',
    {
      preHandler: [fastify.authenticate],
      schema: { response: { 202: respuestaStampSchema } },
    },
    async (request, reply) => {
      const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

      const selloId = Number(fields.selloId);
      if (!selloId || selloId <= 0) {
        throw new AppError(400, 'selloId inválido');
      }
      if (!fileBuffer || !fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
        throw new AppError(415, 'Debe adjuntarse un PDF (application/pdf)');
      }

      const sello = await fastify.prisma.plantillas_sellos.findUnique({
        where: { ID_PLANTILLA_SELLO: selloId },
      });
      if (!sello) {
        throw new AppError(404, 'Plantilla de sello no encontrada');
      }
      if (!sello.TEMPLATE_PDF_KEY) {
        throw new AppError(400, 'La plantilla no tiene un PDF base asignado');
      }

      const inputFileName = fileName || 'documento.pdf';
      const tempInputKey = `${TEMP_INPUT_PREFIX}${Date.now()}_${inputFileName}`;
      await uploadBuffer(tempInputKey, fileBuffer, fileMime, { originalName: inputFileName });

      const outputDocumentName = fields.outputDocumentName || inputFileName;

      const queue = getStampPdfQueue();
      const job = await queue.add('stamp-pdf', {
        selloId,
        tempInputKey,
        outputDocumentName,
      });

      return reply.code(202).send({
        ok: true as const,
        data: { status: 'pending', jobId: job.id },
      });
    }
  );

  app.get(
    '/api/v1/sellos/job/:jobId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: jobIdParamSchema,
        response: { 200: respuestaJobStatusSchema },
      },
    },
    async (request) => {
      const queue = getStampPdfQueue();
      const job = await queue.getJob(request.params.jobId);

      if (!job) throw new AppError(404, 'Job no encontrado');

      const state = await job.getState();

      if (state === 'completed') {
        const returnvalue = job.returnvalue as any;
        return {
          ok: true as const,
          data: { status: 'completed', outputKey: returnvalue?.outputKey ?? null },
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
