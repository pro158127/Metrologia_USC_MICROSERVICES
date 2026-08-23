import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import { getSnapshotQueue, getRedisConnection } from '../lib/queue/queue.js';

interface DocumentoDTO {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
  proveedor: string;
  mimeType: string;
}

interface VersionActualDTO {
  idVersionPlantilla: number;
  version: number;
  mapeoExcelJson: unknown;
  inputSchema: unknown;
  mappingConfig: unknown;
  createdAt: Date;
  documento: DocumentoDTO | null;
}

interface PlantillaConDocumentoDTO {
  idPlantilla: number;
  nombre: string;
  modulo: string;
  activa: boolean;
  versionActual: VersionActualDTO | null;
}

interface VersionCompletaDTO {
  idVersionPlantilla: number;
  idPlantilla: number;
  version: number;
  mapeoExcelJson: unknown;
  inputSchema: unknown;
  mappingConfig: unknown;
  createdby: { nombre: string };
  createdAt: Date;
  iddocumentos: number | null;
  documento: (DocumentoDTO & { createdAt: Date }) | null;
}

interface PlantillaCompletaDTO {
  idPlantilla: number;
  nombre: string;
  modulo: string;
  activa: boolean;
  versiones: VersionCompletaDTO[];
}

function serializeDocumento(row: Record<string, any>): DocumentoDTO {
  return {
    idDocumento: row.ID_DOCUMENTO,
    nombre: row.NOMBRE,
    rutaUrl: row.RUTA_URL,
    proveedor: row.PROVEEDOR,
    mimeType: row.MIME_TYPE,
  };
}

const SNAPSHOT_CACHE_PREFIX = 'univer:snapshot:';
const SNAPSHOT_JOB_PREFIX = 'univer:job:';

export default async function plantillasRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/v1/plantillas/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const idPlantilla = Number(request.params.id);

        if (!request.params.id || Number.isNaN(idPlantilla) || idPlantilla <= 0) {
          return {
            success: false,
            error: 'El idPlantilla es requerido y debe ser un número válido.',
          };
        }

        const version = request.query.version ? Number(request.query.version) : undefined;

        const plantilla = await fastify.prisma.plantillas.findUnique({
          where: { ID_PLANTILLA: idPlantilla },
          include: {
            version_plantillas: {
              where: version ? { VERSION: version } : undefined,
              orderBy: { VERSION: 'desc' },
              take: 1,
              include: {
                documentos: true,
              },
            },
          },
        });

        if (!plantilla) {
          return {
            success: false,
            error: `No se encontró la plantilla con el ID: ${idPlantilla}`,
          };
        }

        const versionEncontrada = plantilla.version_plantillas[0] ?? null;

        const data: PlantillaConDocumentoDTO = {
          idPlantilla: plantilla.ID_PLANTILLA,
          nombre: plantilla.NOMBRE,
          modulo: plantilla.MODULO,
          activa: plantilla.ACTIVA,
          versionActual: versionEncontrada
            ? {
                idVersionPlantilla: versionEncontrada.ID_VERSION_PLANTILLA,
                version: versionEncontrada.VERSION,
                mapeoExcelJson: versionEncontrada.MAPEO_EXCEL_JSON ?? null,
                inputSchema: versionEncontrada.INPUT_SCHEMA ?? null,
                mappingConfig: versionEncontrada.MAPPING_CONFIG ?? null,
                createdAt: versionEncontrada.CREATED_AT,
                documento: versionEncontrada.documentos
                  ? serializeDocumento(versionEncontrada.documentos)
                  : null,
              }
            : null,
        };

        return { success: true, data };
      } catch (error) {
        request.log.error(error);
        return {
          success: false,
          error: 'Error interno del servidor al consultar la plantilla.',
        };
      }
    }
  );

  fastify.get(
    '/api/v1/plantillas',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const plantillas = await fastify.prisma.plantillas.findMany({
          orderBy: { ID_PLANTILLA: 'desc' },
          include: {
            version_plantillas: {
              orderBy: { VERSION: 'desc' },
              include: {
                documentos: true,
                usuarios: {
                  select: { NOMBRE_COMPLETO: true },
                },
              },
            },
          },
        });

        const data: PlantillaCompletaDTO[] = plantillas.map((p) => ({
          idPlantilla: p.ID_PLANTILLA,
          nombre: p.NOMBRE,
          modulo: p.MODULO,
          activa: p.ACTIVA,
          versiones: p.version_plantillas.map((v) => ({
            idVersionPlantilla: v.ID_VERSION_PLANTILLA,
            idPlantilla: v.ID_PLANTILLA_FK,
            version: v.VERSION,
            mapeoExcelJson: v.MAPEO_EXCEL_JSON ?? null,
            inputSchema: v.INPUT_SCHEMA ?? null,
            mappingConfig: v.MAPPING_CONFIG ?? null,
            createdby: { nombre: v.usuarios?.NOMBRE_COMPLETO || '' },
            createdAt: v.CREATED_AT,
            iddocumentos: v.ID_DOCUMENTOS_FK ?? null,
            documento: v.documentos
              ? { ...serializeDocumento(v.documentos), createdAt: v.documentos.CREATED_AT }
              : null,
          })),
        }));

        return { success: true, data };
      } catch (error) {
        request.log.error(error);
        return {
          success: false,
          error: 'Error interno al obtener la totalidad de plantillas y sus documentos.',
        };
      }
    }
  );

  // ==========================================================================
  // SNAPSHOT UNIVER (BACKEND-GENERATED, CACHED EN REDIS + COLA BULLMQ)
  // ==========================================================================

  fastify.get<{ Params: { id: string; versionId: string } }>(
    '/api/v1/plantillas/:id/version/:versionId/snapshot',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const versionId = Number(request.params.versionId);
        if (!versionId || versionId <= 0) {
          return reply.status(400).send({ error: 'versionId inválido.' });
        }

        const redis = getRedisConnection();
        const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${versionId}`;

        const cached = await redis.get(cacheKey);
        if (cached) {
          return { success: true, data: { status: 'completed', snapshot: JSON.parse(cached) } };
        }

        const version = await fastify.prisma.version_plantillas.findUnique({
          where: { ID_VERSION_PLANTILLA: versionId },
          include: { documentos: true },
        });

        if (!version) {
          return reply.status(404).send({ error: 'Versión de plantilla no encontrada.' });
        }
        if (!version.documentos) {
          return reply.status(400).send({ error: 'La versión no tiene un documento asociado.' });
        }

        const jobKey = `${SNAPSHOT_JOB_PREFIX}${versionId}`;
        const inFlight = await redis.get(jobKey);
        if (inFlight) {
          return { success: true, data: { status: 'pending', jobId: inFlight } };
        }

        const queue = getSnapshotQueue();
        const job = await queue.add('generate-snapshot', {
          versionId,
          rutaUrl: version.documentos.RUTA_URL,
          fileName: version.documentos.NOMBRE,
        });

        await redis.set(jobKey, job.id ?? '', 'EX', 300);

        return reply.status(202).send({ success: true, data: { status: 'pending', jobId: job.id } });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Error al obtener el snapshot del documento.' });
      }
    }
  );

  fastify.get<{ Params: { jobId: string } }>(
    '/api/v1/plantillas/job/:jobId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const jobId = request.params.jobId;
        const queue = getSnapshotQueue();
        const job = await queue.getJob(jobId);

        if (!job) {
          return reply.status(404).send({ error: 'Job no encontrado.' });
        }

        const state = await job.getState();
        const versionId = (job.data as any)?.versionId as number | undefined;

        if (state === 'completed') {
          if (versionId) {
            const redis = getRedisConnection();
            const cached = await redis.get(`${SNAPSHOT_CACHE_PREFIX}${versionId}`);
            await redis.del(`${SNAPSHOT_JOB_PREFIX}${versionId}`);
            if (cached) {
              return { success: true, data: { status: 'completed', snapshot: JSON.parse(cached) } };
            }
          }
          return { success: true, data: { status: 'completed', snapshot: job.returnvalue } };
        }

        if (state === 'failed') {
          if (versionId) {
            await getRedisConnection().del(`${SNAPSHOT_JOB_PREFIX}${versionId}`);
          }
          return { success: true, data: { status: 'failed', error: job.failedReason || 'Procesamiento fallido' } };
        }

        return { success: true, data: { status: state || 'pending', jobId } };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Error al consultar el estado del job.' });
      }
    }
  );

  // ==========================================================================
  // GUARDAR MAPPING CONFIG (ACID: transacción + optimistic lock por VERSION)
  // ==========================================================================

  fastify.put<{ Params: { versionId: string }; Body: { version?: number; mappingConfig?: unknown; inputSchema?: unknown } }>(
    '/api/v1/plantillas/version/:versionId/mapping',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const versionId = Number(request.params.versionId);
        const { version, mappingConfig, inputSchema } = request.body ?? {};

        if (!versionId || versionId <= 0) {
          return reply.status(400).send({ error: 'versionId inválido.' });
        }
        if (mappingConfig === undefined || mappingConfig === null) {
          return reply.status(400).send({ error: 'mappingConfig es requerido.' });
        }

        const result = await fastify.prisma.$transaction(async (tx) => {
          const updated = await tx.version_plantillas.updateMany({
            where: {
              ID_VERSION_PLANTILLA: versionId,
              ...(typeof version === 'number' ? { VERSION: version } : {}),
            },
            data: {
              MAPPING_CONFIG: mappingConfig as any,
              ...(inputSchema !== undefined && inputSchema !== null
                ? { INPUT_SCHEMA: inputSchema as any }
                : {}),
            },
          });

          if (updated.count === 0) {
            const current = await tx.version_plantillas.findUnique({
              where: { ID_VERSION_PLANTILLA: versionId },
              select: { VERSION: true },
            });
            if (!current) return { notFound: true };
            return { conflict: true, currentVersion: current.VERSION };
          }

          const fresh = await tx.version_plantillas.findUnique({
            where: { ID_VERSION_PLANTILLA: versionId },
          });
          return { updated: fresh };
        });

        if ((result as any).notFound) {
          return reply.status(404).send({ error: 'Versión de plantilla no encontrada.' });
        }
        if ((result as any).conflict) {
          return reply.status(409).send({
            error: 'La versión del documento cambió en la base de datos. Recarga la página e intenta de nuevo.',
            currentVersion: (result as any).currentVersion,
          });
        }

        return { success: true, data: (result as any).updated };
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Error interno al guardar el mapeo.' });
      }
    }
  );

  // ==========================================================================
  // ACTUALIZAR FORMATO: NUEVA VERSIÓN (multipart: .xlsx + fields)
  // ==========================================================================

  fastify.post<{ Params: { id: string } }>(
    '/api/v1/plantillas/:id/version',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idPlantilla = Number(request.params.id);
        if (!idPlantilla || idPlantilla <= 0) {
          return reply.status(400).send({ error: 'idPlantilla inválido.' });
        }

        const data = await (request as any).file();
        if (!data) {
          return reply.status(400).send({ error: 'No se adjuntó ningún archivo.' });
        }

        const buffer = await data.toBuffer();
        const fileName = (data.fields?.fileName as any)?.value || data.filename || 'plantilla.xlsx';
        const templateType = (data.fields?.templateType as any)?.value || null;
        const inputSchemaRaw = (data.fields?.inputSchema as any)?.value || null;

        const plantilla = await fastify.prisma.plantillas.findUnique({
          where: { ID_PLANTILLA: idPlantilla },
          include: {
            version_plantillas: { orderBy: { VERSION: 'desc' }, take: 1 },
          },
        });

        if (!plantilla) {
          return reply.status(404).send({ error: 'Plantilla no encontrada.' });
        }

        const lastVersion = plantilla.version_plantillas[0]?.VERSION ?? 0;
        const newVersion = lastVersion + 1;

        let inputSchema: unknown = null;
        if (inputSchemaRaw) {
          try {
            inputSchema = JSON.parse(inputSchemaRaw);
          } catch {
            return reply.status(400).send({ error: 'inputSchema inválido: debe ser un JSON válido.' });
          }
        } else {
          inputSchema = plantilla.version_plantillas[0]?.INPUT_SCHEMA ?? null;
        }

        if (templateType && typeof inputSchema === 'object' && inputSchema !== null) {
          (inputSchema as any).templateType = templateType;
        }

        // 1. Subir el nuevo .xlsx a MinIO
        const s3Key = `documentos/templates/${Date.now()}_${fileName}`;
        const uploadCommand = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: buffer,
          ContentType: data.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          Metadata: { originalName: fileName },
        });
        await s3Client.send(uploadCommand);

        // 2. Crear documento + nueva versión en transacción (ACID)
        const created = await fastify.prisma.$transaction(async (tx) => {
          const doc = await tx.documentos.create({
            data: {
              NOMBRE: fileName,
              RUTA_URL: s3Key,
              PROVEEDOR: 'LOCAL',
              MIME_TYPE: data.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              ID_PLANTILLA_FK: idPlantilla,
            },
          });

          return tx.version_plantillas.create({
            data: {
              ID_PLANTILLA_FK: idPlantilla,
              VERSION: newVersion,
              INPUT_SCHEMA: (inputSchema as any) ?? Prisma.DbNull,
              MAPPING_CONFIG: Prisma.DbNull,
              ID_USUARIO_CREADOR_FK: Number((request.user as any)?.sub ?? 0),
              ID_DOCUMENTOS_FK: doc.ID_DOCUMENTO,
            },
          });
        });

        // 3. Pre-calentar snapshot en background
        try {
          const queue = getSnapshotQueue();
          await queue.add('generate-snapshot', {
            versionId: created.ID_VERSION_PLANTILLA,
            rutaUrl: s3Key,
            fileName,
          });
        } catch (e) {
          request.log.error(e, 'No se pudo encolar el snapshot de la nueva versión');
        }

        const versionConDocumento = await fastify.prisma.version_plantillas.findUnique({
          where: { ID_VERSION_PLANTILLA: created.ID_VERSION_PLANTILLA },
          include: { documentos: true },
        });

        return reply.status(201).send({
          success: true,
          data: {
            idVersionPlantilla: created.ID_VERSION_PLANTILLA,
            idPlantilla: created.ID_PLANTILLA_FK,
            version: created.VERSION,
            inputSchema: created.INPUT_SCHEMA ?? null,
            mappingConfig: created.MAPPING_CONFIG ?? null,
            createdAt: created.CREATED_AT,
            documento: versionConDocumento?.documentos
              ? serializeDocumento(versionConDocumento.documentos)
              : null,
          },
        });
      } catch (error) {
        request.log.error(error);
        return reply.status(500).send({ error: 'Error interno al crear la nueva versión.' });
      }
    }
  );
}
