import { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { uploadBuffer, deleteObject, getSignedObjectUrl } from '../lib/minioClient.js';
import { getStampPdfQueue } from '../lib/queue/queue.js';

const ALLOWED_MIMETYPES = ['application/pdf'];
const TEMPLATE_PREFIX = 'plantillas-sellos/';
const TEMP_INPUT_PREFIX = 'temp-inputs/';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WatermarkArea {
  id: string;
  label: string;
  box: BoundingBox;
  opacity: number;
}

interface PlantillaSelloRow {
  ID_PLANTILLA_SELLO: number;
  NOMBRE: string;
  DESCRIPCION: string | null;
  TEMPLATE_PDF_KEY: string | null;
  DOCUMENT_AREA: unknown;
  WATERMARK_AREAS: unknown;
  CREATED_AT: Date;
  UPDATED_AT: Date;
}

// Contrato camelCase que consume el frontend (catálogo legacy tabla `sellos`).
interface SelloDTO {
  idSello: number;
  nombre: string;
  idDocumento: number;
  estado: boolean;
}

function serializeSello(row: Record<string, any>): SelloDTO {
  return {
    idSello: row.ID_SELLO,
    nombre: row.NOMBRE,
    idDocumento: row.ID_DOCUMENTO_FK,
    estado: row.ESTADO,
  };
}

function parseJsonField<T>(value: string | undefined, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function serializePlantilla(row: PlantillaSelloRow) {
  let templatePdfUrl: string | null = null;
  if (row.TEMPLATE_PDF_KEY) {
    try {
      templatePdfUrl = await getSignedObjectUrl(row.TEMPLATE_PDF_KEY, 3600);
    } catch (err) {
      templatePdfUrl = null;
    }
  }
  return {
    id: row.ID_PLANTILLA_SELLO,
    nombre: row.NOMBRE,
    descripcion: row.DESCRIPCION,
    templatePdfKey: row.TEMPLATE_PDF_KEY,
    templatePdfUrl,
    documentArea: row.DOCUMENT_AREA ?? null,
    watermarkAreas: row.WATERMARK_AREAS ?? [],
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT,
  };
}

interface MultipartParsed {
  fields: Record<string, string>;
  fileBuffer: Buffer | null;
  fileMime: string | null;
  fileName: string | null;
}

async function readMultipart(request: FastifyRequest): Promise<MultipartParsed> {
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
  // ==========================================================================
  // CATÁLOGO LEGACY (tabla `sellos`): usado por el store Zustand del frontend.
  // ==========================================================================
  fastify.get(
    '/api/v1/sellos/catalogo',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const sellos = await fastify.prisma.sellos.findMany({
          orderBy: { ID_SELLO: 'asc' },
        });
        return { success: true, data: sellos.map(serializeSello) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al consultar los sellos' });
      }
    }
  );

  // ==========================================================================
  // PLANTILLAS DE SELLO (modelo plantillas_sellos)
  // ==========================================================================

  // GET /api/v1/sellos — listar plantillas
  fastify.get(
    '/api/v1/sellos',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const rows = await fastify.prisma.plantillas_sellos.findMany({
          orderBy: { ID_PLANTILLA_SELLO: 'asc' },
        });
        const data = await Promise.all(rows.map(serializePlantilla));
        return { success: true, data };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al consultar las plantillas de sello' });
      }
    }
  );

  // GET /api/v1/sellos/:id — detalle + URL firmada de preview
  fastify.get<{ Params: { id: string } }>(
    '/api/v1/sellos/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);
        const row = await fastify.prisma.plantillas_sellos.findUnique({
          where: { ID_PLANTILLA_SELLO: id },
        });
        if (!row) {
          return reply.code(404).send({ success: false, error: 'Plantilla de sello no encontrada' });
        }
        return { success: true, data: await serializePlantilla(row) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al consultar la plantilla de sello' });
      }
    }
  );

  // POST /api/v1/sellos — crear plantilla (multipart, PDF opcional)
  fastify.post(
    '/api/v1/sellos',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

        const nombre = fields.nombre || 'Sin nombre';
        const descripcion = fields.descripcion ?? null;
        const documentArea = parseJsonField<BoundingBox | null>(fields.documentArea, null);
        const watermarkAreas = parseJsonField<WatermarkArea[]>(fields.watermarkAreas, []);

        let templatePdfKey: string | null = null;
        if (fileBuffer) {
          if (!fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
            return reply.code(415).send({ success: false, error: 'La plantilla base debe ser un PDF (application/pdf)' });
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

        return reply.code(201).send({ success: true, data: await serializePlantilla(created) });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al crear la plantilla de sello' });
      }
    }
  );

  // PUT /api/v1/sellos/:id — actualizar plantilla (multipart, PDF opcional)
  fastify.put<{ Params: { id: string } }>(
    '/api/v1/sellos/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);
        const existing = await fastify.prisma.plantillas_sellos.findUnique({
          where: { ID_PLANTILLA_SELLO: id },
        });
        if (!existing) {
          return reply.code(404).send({ success: false, error: 'Plantilla de sello no encontrada' });
        }

        const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

        let templatePdfKey = existing.TEMPLATE_PDF_KEY;
        if (fileBuffer) {
          if (!fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
            return reply.code(415).send({ success: false, error: 'La plantilla base debe ser un PDF (application/pdf)' });
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
            fields.descripcion !== undefined
              ? (fields.descripcion || null)
              : existing.DESCRIPCION,
          TEMPLATE_PDF_KEY: templatePdfKey,
        };
        if (fields.documentArea !== undefined) {
          const parsed = parseJsonField<BoundingBox | null>(fields.documentArea, null);
          data.DOCUMENT_AREA = (parsed as any) ?? Prisma.DbNull;
        }
        if (fields.watermarkAreas !== undefined) {
          const parsed = parseJsonField<WatermarkArea[]>(fields.watermarkAreas, []);
          data.WATERMARK_AREAS = (parsed as any) ?? Prisma.DbNull;
        }

        const updated = await fastify.prisma.plantillas_sellos.update({
          where: { ID_PLANTILLA_SELLO: id },
          data,
        });

        return { success: true, data: await serializePlantilla(updated) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al actualizar la plantilla de sello' });
      }
    }
  );

  // DELETE /api/v1/sellos/:id — eliminar plantilla (+ su PDF base en MinIO)
  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/sellos/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const id = Number(request.params.id);
        const existing = await fastify.prisma.plantillas_sellos.findUnique({
          where: { ID_PLANTILLA_SELLO: id },
        });
        if (!existing) {
          return reply.code(404).send({ success: false, error: 'Plantilla de sello no encontrada' });
        }
        await fastify.prisma.plantillas_sellos.delete({ where: { ID_PLANTILLA_SELLO: id } });
        if (existing.TEMPLATE_PDF_KEY) {
          try {
            await deleteObject(existing.TEMPLATE_PDF_KEY);
          } catch {
            // no-op
          }
        }
        return { success: true, data: { id } };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al eliminar la plantilla de sello' });
      }
    }
  );

  // ==========================================================================
  // PIPELINE ASÍNCRONO DE SELLADO (BullMQ)
  // ==========================================================================

  // POST /api/v1/sellos/stamp — sube el PDF cliente, encola el job y responde 202.
  fastify.post(
    '/api/v1/sellos/stamp',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { fields, fileBuffer, fileMime, fileName } = await readMultipart(request);

        const selloId = Number(fields.selloId);
        if (!selloId || selloId <= 0) {
          return reply.code(400).send({ success: false, error: 'selloId inválido' });
        }
        if (!fileBuffer || !fileMime || !ALLOWED_MIMETYPES.includes(fileMime)) {
          return reply.code(415).send({ success: false, error: 'Debe adjuntarse un PDF (application/pdf)' });
        }

        const sello = await fastify.prisma.plantillas_sellos.findUnique({
          where: { ID_PLANTILLA_SELLO: selloId },
        });
        if (!sello) {
          return reply.code(404).send({ success: false, error: 'Plantilla de sello no encontrada' });
        }
        if (!sello.TEMPLATE_PDF_KEY) {
          return reply.code(400).send({ success: false, error: 'La plantilla no tiene un PDF base asignado' });
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
          success: true,
          data: { status: 'pending', jobId: job.id },
        });
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al encolar el sellado del PDF' });
      }
    }
  );

  // GET /api/v1/sellos/job/:jobId — estado del job (pending -> processing -> completed/failed)
  fastify.get<{ Params: { jobId: string } }>(
    '/api/v1/sellos/job/:jobId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const jobId = request.params.jobId;
        const queue = getStampPdfQueue();
        const job = await queue.getJob(jobId);

        if (!job) {
          return reply.code(404).send({ success: false, error: 'Job no encontrado' });
        }

        const state = await job.getState();

        if (state === 'completed') {
          const returnvalue = job.returnvalue as any;
          return {
            success: true,
            data: { status: 'completed', outputKey: returnvalue?.outputKey ?? null },
          };
        }

        if (state === 'failed') {
          return {
            success: true,
            data: { status: 'failed', error: job.failedReason || 'Procesamiento fallido' },
          };
        }

        return {
          success: true,
          data: { status: state === 'active' ? 'processing' : state || 'pending', jobId },
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error al consultar el estado del job' });
      }
    }
  );
}
