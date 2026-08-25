import { FastifyInstance } from 'fastify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import {
  getSnapshotQueue,
  getRedisConnection,
  getTarifasQueue,
} from '../lib/queue/queue.js';
import {
  actualizarMappingBodySchema,
  consolidarTarifasBodySchema,
  crearPlantillaBodySchema,
  detallePlantillaQuerySchema,
  documentoRawToDtoSchema,
  idParamSchema,
  jobIdParamSchema,
  plantillaCompletaRawToDtoSchema,
  plantillaConDocumentoRawToDtoSchema,
  plantillaRawToDtoSchema,
  respuestaConsolidarTarifasSchema,
  respuestaEstadoJobTarifasSchema,
  respuestaListaPlantillasSchema,
  respuestaMappingSchema,
  respuestaNuevaVersionSchema,
  respuestaPlantillaCreadaSchema,
  respuestaPlantillaSchema,
  respuestaSnapshotJobStatusSchema,
  respuestaSnapshotSchema,
  snapshotParamsSchema,
  versionIdParamSchema,
} from './plantillas.schemas.js';

const SNAPSHOT_CACHE_PREFIX = 'univer:snapshot:';
const SNAPSHOT_JOB_PREFIX = 'univer:job:';

export default async function plantillasRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/plantillas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearPlantillaBodySchema,
        response: { 201: respuestaPlantillaCreadaSchema },
      },
    },
    async (request, reply) => {
      const created = await fastify.prisma.plantillas.create({
        data: {
          MODULO: request.body.modulo,
          NOMBRE: request.body.nombre,
          ACTIVA: request.body.activa,
        },
      });
      return reply.code(201).send({
        success: true as const,
        data: plantillaRawToDtoSchema.parse(created),
      });
    }
  );

  app.get(
    '/api/v1/plantillas/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        querystring: detallePlantillaQuerySchema,
        response: { 200: respuestaPlantillaSchema },
      },
    },
    async (request) => {
      const idPlantilla = request.params.id;

      if (idPlantilla <= 0) {
        throw new AppError(400, 'El idPlantilla es requerido y debe ser un número válido.');
      }

      const version = request.query.version ?? undefined;

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
        throw new AppError(404, `No se encontró la plantilla con el ID: ${idPlantilla}`);
      }

      return { success: true as const, data: plantillaConDocumentoRawToDtoSchema.parse(plantilla) };
    }
  );

  app.get(
    '/api/v1/plantillas',
    {
      preHandler: [fastify.authenticate],
      schema: { response: { 200: respuestaListaPlantillasSchema } },
    },
    async () => {
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

      return {
        success: true as const,
        data: plantillas.map((p) => plantillaCompletaRawToDtoSchema.parse(p)),
      };
    }
  );

  app.get(
    '/api/v1/plantillas/:id/version/:versionId/snapshot',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: snapshotParamsSchema,
        response: { 200: respuestaSnapshotSchema, 202: respuestaSnapshotSchema },
      },
    },
    async (request, reply) => {
      const versionId = request.params.versionId;
      if (versionId <= 0) {
        throw new AppError(400, 'versionId inválido.');
      }

      const redis = getRedisConnection();
      const cacheKey = `${SNAPSHOT_CACHE_PREFIX}${versionId}`;

      const cached = await redis.get(cacheKey);
      if (cached) {
        return { success: true as const, data: { status: 'completed', snapshot: JSON.parse(cached) } };
      }

      const version = await fastify.prisma.version_plantillas.findUnique({
        where: { ID_VERSION_PLANTILLA: versionId },
        include: { documentos: true },
      });

      if (!version) {
        throw new AppError(404, 'Versión de plantilla no encontrada.');
      }
      if (!version.documentos) {
        throw new AppError(400, 'La versión no tiene un documento asociado.');
      }

      const jobKey = `${SNAPSHOT_JOB_PREFIX}${versionId}`;
      const inFlight = await redis.get(jobKey);
      if (inFlight) {
        return { success: true as const, data: { status: 'pending', jobId: inFlight } };
      }

      const queue = getSnapshotQueue();
      const job = await queue.add('generate-snapshot', {
        versionId,
        rutaUrl: version.documentos.RUTA_URL,
        fileName: version.documentos.NOMBRE,
      });

      await redis.set(jobKey, job.id ?? '', 'EX', 300);

      return reply.code(202).send({ success: true as const, data: { status: 'pending', jobId: job.id } });
    }
  );

  app.get(
    '/api/v1/plantillas/job/:jobId',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: jobIdParamSchema,
        response: { 200: respuestaSnapshotJobStatusSchema },
      },
    },
    async (request) => {
      const jobId = request.params.jobId;
      const queue = getSnapshotQueue();
      const job = await queue.getJob(jobId);

      if (!job) {
        throw new AppError(404, 'Job no encontrado.');
      }

      const state = await job.getState();
      const versionId = (job.data as any)?.versionId as number | undefined;

      if (state === 'completed') {
        if (versionId) {
          const redis = getRedisConnection();
          const cached = await redis.get(`${SNAPSHOT_CACHE_PREFIX}${versionId}`);
          await redis.del(`${SNAPSHOT_JOB_PREFIX}${versionId}`);
          if (cached) {
            return { success: true as const, data: { status: 'completed', snapshot: JSON.parse(cached) } };
          }
        }
        return { success: true as const, data: { status: 'completed', snapshot: job.returnvalue } };
      }

      if (state === 'failed') {
        if (versionId) {
          await getRedisConnection().del(`${SNAPSHOT_JOB_PREFIX}${versionId}`);
        }
        return {
          success: true as const,
          data: { status: 'failed', error: job.failedReason || 'Procesamiento fallido' },
        };
      }

      return { success: true as const, data: { status: state || 'pending', jobId } };
    }
  );

  app.put(
    '/api/v1/plantillas/version/:versionId/mapping',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: versionIdParamSchema,
        body: actualizarMappingBodySchema.optional(),
        response: { 200: respuestaMappingSchema },
      },
    },
    async (request) => {
      const versionId = request.params.versionId;
      const { version, mappingConfig, inputSchema } = request.body ?? {};

      if (versionId <= 0) {
        throw new AppError(400, 'versionId inválido.');
      }
      if (mappingConfig === undefined || mappingConfig === null) {
        throw new AppError(400, 'mappingConfig es requerido.');
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
        throw new AppError(404, 'Versión de plantilla no encontrada.');
      }
      if ((result as any).conflict) {
        throw new AppError(
          409,
          'La versión del documento cambió en la base de datos. Recarga la página e intenta de nuevo.',
          (result as any).currentVersion
        );
      }

      return { success: true as const, data: (result as any).updated };
    }
  );

  app.post(
    '/api/v1/plantillas/:id/version',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 201: respuestaNuevaVersionSchema },
      },
    },
    async (request, reply) => {
      const idPlantilla = request.params.id;
      if (idPlantilla <= 0) {
        throw new AppError(400, 'idPlantilla inválido.');
      }

      const data = await (request as any).file();
      if (!data) {
        throw new AppError(400, 'No se adjuntó ningún archivo.');
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
        throw new AppError(404, 'Plantilla no encontrada.');
      }

      const lastVersion = plantilla.version_plantillas[0]?.VERSION ?? 0;
      const newVersion = lastVersion + 1;

      let inputSchema: unknown = null;
      if (inputSchemaRaw) {
        try {
          inputSchema = JSON.parse(inputSchemaRaw);
        } catch {
          throw new AppError(400, 'inputSchema inválido: debe ser un JSON válido.');
        }
      } else {
        inputSchema = plantilla.version_plantillas[0]?.INPUT_SCHEMA ?? null;
      }

      if (templateType && typeof inputSchema === 'object' && inputSchema !== null) {
        (inputSchema as any).templateType = templateType;
      }

      const s3Key = `documentos/templates/${Date.now()}_${fileName}`;
      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType:
          data.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        Metadata: { originalName: fileName },
      });
      await s3Client.send(uploadCommand);

      const created = await fastify.prisma.$transaction(async (tx) => {
        const doc = await tx.documentos.create({
          data: {
            NOMBRE: fileName,
            RUTA_URL: s3Key,
            PROVEEDOR: 'LOCAL',
            MIME_TYPE:
              data.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ID_PLANTILLA_FK: idPlantilla,
          },
        });

        await tx.version_documentos.create({
          data: {
            ID_DOCUMENTO_FK: doc.ID_DOCUMENTO,
            VERSION: newVersion,
            RUTA_URL: s3Key,
            usuario_fk: Number(request.user?.sub ?? 0),
          },
        });

        return tx.version_plantillas.create({
          data: {
            ID_PLANTILLA_FK: idPlantilla,
            VERSION: newVersion,
            INPUT_SCHEMA: (inputSchema as any) ?? Prisma.DbNull,
            MAPPING_CONFIG: Prisma.DbNull,
            ID_USUARIO_CREADOR_FK: Number(request.user?.sub ?? 0),
            ID_DOCUMENTOS_FK: doc.ID_DOCUMENTO,
          },
        });
      });

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

      return reply.code(201).send({
        success: true as const,
        data: {
          idVersionPlantilla: created.ID_VERSION_PLANTILLA,
          idPlantilla: created.ID_PLANTILLA_FK,
          version: created.VERSION,
          inputSchema: created.INPUT_SCHEMA ?? null,
          mappingConfig: created.MAPPING_CONFIG ?? null,
          createdAt: created.CREATED_AT,
          documento: versionConDocumento?.documentos
            ? documentoRawToDtoSchema.parse(versionConDocumento.documentos)
            : null,
        },
      });
    }
  );

  app.post(
    '/api/v1/plantillas/version/:versionId/consolidar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: versionIdParamSchema,
        body: consolidarTarifasBodySchema,
        response: { 202: respuestaConsolidarTarifasSchema },
      },
    },
    async (request, reply) => {
      const versionId = request.params.versionId;
      const { mapeoConfig } = request.body;

      if (versionId <= 0) {
        throw new AppError(400, 'versionId inválido.');
      }

      const version = await fastify.prisma.version_plantillas.findUnique({
        where: { ID_VERSION_PLANTILLA: versionId },
        include: { documentos: true },
      });

      if (!version) {
        throw new AppError(404, 'Versión de plantilla no encontrada.');
      }
      if (!version.documentos) {
        throw new AppError(400, 'La versión no tiene un documento Excel asociado.');
      }

      const tieneColumnaBase =
        typeof mapeoConfig.columnas.magnitud === 'number' ||
        typeof mapeoConfig.columnas.instrumento === 'number';
      if (!tieneColumnaBase) {
        throw new AppError(
          400,
          'Debe mapearse al menos la columna de magnitud o de instrumento.'
        );
      }
      if (Object.keys(mapeoConfig.anios).length === 0) {
        throw new AppError(400, 'Debe mapearse al menos un año de precios.');
      }

      await fastify.prisma.version_plantillas.update({
        where: { ID_VERSION_PLANTILLA: versionId },
        data: {
          MAPEO_CONFIG: mapeoConfig as any,
          ESTADO: 'PROCESANDO',
          ERROR_LOG: null,
          PROCESADO_EN: null,
        },
      });

      const queue = getTarifasQueue();
      let job;
      try {
        job = await queue.add('consolidar-tarifas', {
          versionId,
          rutaUrl: version.documentos.RUTA_URL,
          fileName: version.documentos.NOMBRE,
          mapeoConfig,
        });
      } catch (error) {
        await fastify.prisma.version_plantillas.update({
          where: { ID_VERSION_PLANTILLA: versionId },
          data: {
            ESTADO: 'ERROR',
            ERROR_LOG: 'No se pudo encolar el job de consolidación de tarifas.',
          },
        });
        request.log.error(error, 'Fallo al encolar consolidar-tarifas');
        throw new AppError(500, 'No se pudo encolar el job de consolidación de tarifas.');
      }

      return reply
        .code(202)
        .send({ success: true as const, data: { estado: 'PROCESANDO', jobId: job.id ?? undefined } });
    }
  );

  app.get(
    '/api/v1/plantillas/version/:versionId/estado-job',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: versionIdParamSchema,
        response: { 200: respuestaEstadoJobTarifasSchema },
      },
    },
    async (request) => {
      const versionId = request.params.versionId;
      if (versionId <= 0) {
        throw new AppError(400, 'versionId inválido.');
      }

      const version = await fastify.prisma.version_plantillas.findUnique({
        where: { ID_VERSION_PLANTILLA: versionId },
        select: { ESTADO: true, ERROR_LOG: true, PROCESADO_EN: true },
      });

      if (!version) {
        throw new AppError(404, 'Versión de plantilla no encontrada.');
      }

      if (version.ESTADO === 'PROCESANDO') {
        const queue = getTarifasQueue();
        const activos = await queue.getJobs(['waiting', 'active', 'delayed']);
        const tieneJob = activos.some(
          (job) => (job.data as any)?.versionId === versionId && (job.data as any)?.mapeoConfig
        );
        if (!tieneJob) {
          const stale = await fastify.prisma.version_plantillas.update({
            where: { ID_VERSION_PLANTILLA: versionId },
            data: {
              ESTADO: 'ERROR',
              ERROR_LOG: 'Job huérfano: no hay un proceso activo en la cola de tarifas.',
            },
            select: { ESTADO: true, ERROR_LOG: true, PROCESADO_EN: true },
          });
          return {
            success: true as const,
            data: {
              estado: stale.ESTADO,
              errorLog: stale.ERROR_LOG ?? null,
              procesadoEn: stale.PROCESADO_EN ?? null,
            },
          };
        }
      }

      return {
        success: true as const,
        data: {
          estado: version.ESTADO,
          errorLog: version.ERROR_LOG ?? null,
          procesadoEn: version.PROCESADO_EN ?? null,
        },
      };
    }
  );
}
