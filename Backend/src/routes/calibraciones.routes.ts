import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { evaluarTransicionesOT } from '../services/ot-fsm.service.js';
import { uploadBuffer } from '../lib/minioClient.js';

const idInstrumentoParamsSchema = z.object({ idInstrumento: z.coerce.number() });

type EstadoInstrumento = 'Pendiente' | 'Adjuntado' | 'En revisión' | 'Devuelto' | 'Firmado';

function sanitizeFileName(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;
  const cleanBase = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_');
  return `${cleanBase}${extension}`;
}

function parseJsonField(value: unknown): Prisma.InputJsonValue {
  if (value == null) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return { raw: value };
    }
  }
  return value as Prisma.InputJsonValue;
}

export default async function calibracionesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================================================
  // GET /api/v1/calibraciones/mis-instrumentos
  // Devuelve únicamente los instrumentos asignados al técnico autenticado.
  // ==========================================================================
  app.get(
    '/api/v1/calibraciones/mis-instrumentos',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const tecnicoId = Number(request.user?.sub ?? 0);
      if (!tecnicoId) throw new AppError(401, 'Técnico no identificado');

      // Instrumentos de OT asignados al técnico (ignorando inactivos).
      const detallesOT = await fastify.prisma.orden_trabajo_detalles.findMany({
        where: {
          asignado: tecnicoId,
          OR: [{ activacion: true }, { activacion: null }],
        },
        include: {
          ordenes_trabajo: {
            include: {
              clientes: true,
              recepciones_equipo: { include: { recepcion_equipo_detalles: true } },
            },
          },
        },
      });

      // Correlacionar con los detalles de recepción
      const filas = detallesOT.map((detOT) => {
        const ot = detOT.ordenes_trabajo;
        const recepcion = ot?.recepciones_equipo?.[0] ?? null;
        const recDet =
          recepcion?.recepcion_equipo_detalles.find((r) => r.ITEM === detOT.ITEM) ??
          recepcion?.recepcion_equipo_detalles.find(
            (r) => r.INSTRUMENTO === detOT.INSTRUMENTO
          ) ??
          null;
        return { detOT, ot, recDet };
      });

      const instrumentoIds = filas
        .map((f) => f.recDet?.ID_INSTRUMENTO)
        .filter((v): v is number => typeof v === 'number');

      const calibraciones = instrumentoIds.length
        ? await fastify.prisma.calibraciones.findMany({
            where: { ID_INSTRUMENTO_FK: { in: instrumentoIds } },
            include: {
              certificados: { include: { documentos: true } },
            },
          })
        : [];

      const calPorInstrumento = new Map(
        calibraciones.map((c) => [c.ID_INSTRUMENTO_FK, c])
      );

      return filas.map(({ detOT, ot, recDet }) => {
        const cal = recDet ? calPorInstrumento.get(recDet.ID_INSTRUMENTO) : undefined;
        const cert = cal?.certificados ?? null;

        let status: EstadoInstrumento = 'Pendiente';
        if (cert) {
          if (cert.ESTADO_REVISION === 'APROBADO') status = 'Firmado';
          else if (cert.ESTADO_REVISION === 'RECHAZADO') status = 'Devuelto';
          else status = 'En revisión';
        } else if (cal) {
          status = 'Adjuntado';
        }

        return {
          id: String(recDet?.ID_INSTRUMENTO ?? detOT.ID_DETALLE),
          idInstrumento: recDet?.ID_INSTRUMENTO ?? null,
          idCalibracion: cal?.ID_CALIBRACION ?? null,
          idCertificado: cert?.ID_CERTIFICADO ?? null,
          idOrdenTrabajo: ot?.ID_ORDEN_TRABAJO ?? null,
          estampilla: recDet?.ESTAMPILLA ?? '—',
          workOrder: ot?.CODIGO_OT ?? '—',
          equipment: recDet?.INSTRUMENTO ?? detOT.INSTRUMENTO ?? '—',
          client: ot?.clientes?.RAZON_SOCIAL ?? '—',
          status,
          motivoDevolucion: cert?.MOTIVO_RECHAZO ?? undefined,
          fileName: cert?.documentos?.NOMBRE ?? undefined,
          datosTecnicos: cal?.DATOS_TECNICOS_JSON ?? undefined,
          uploadDate: cert?.REVISADO_AT ?? cal?.CREATED_AT ?? undefined,
        };
      });
    }
  );

  // ==========================================================================
  // PUT /api/v1/calibraciones/:idInstrumento
  // Guarda/actualiza los datos técnicos de la calibración (JSON).
  // ==========================================================================
  app.put(
    '/api/v1/calibraciones/:idInstrumento',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idInstrumentoParamsSchema,
        body: z.object({
          datosTecnicos: z.record(z.string(), z.unknown()).optional(),
          observaciones: z.string().nullish(),
        }),
      },
    },
    async (request) => {
      const idInstrumento = request.params.idInstrumento;
      const idUsuario = Number(request.user?.sub ?? 0);

      const detalle = await fastify.prisma.recepcion_equipo_detalles.findUnique({
        where: { ID_INSTRUMENTO: idInstrumento },
        include: { recepciones_equipo: { include: { ordenes_trabajo: true } } },
      });
      if (!detalle) throw new AppError(404, 'Instrumento no encontrado en recepción');

      const calibracion = await fastify.prisma.calibraciones.upsert({
        where: { ID_INSTRUMENTO_FK: idInstrumento },
        update: {
          ID_TECNICO_FK: idUsuario,
          DATOS_TECNICOS_JSON: (request.body.datosTecnicos ?? {}) as Prisma.InputJsonValue,
          OBSERVACIONES: request.body.observaciones ?? null,
        },
        create: {
          ID_INSTRUMENTO_FK: idInstrumento,
          ID_TECNICO_FK: idUsuario,
          DATOS_TECNICOS_JSON: (request.body.datosTecnicos ?? {}) as Prisma.InputJsonValue,
          OBSERVACIONES: request.body.observaciones ?? null,
        },
      });

      const ot = detalle.recepciones_equipo?.ordenes_trabajo;
      if (ot) await evaluarTransicionesOT(fastify.prisma, ot.ID_ORDEN_TRABAJO);

      return { ok: true as const, data: { idCalibracion: calibracion.ID_CALIBRACION } };
    }
  );

  // ==========================================================================
  // POST /api/v1/calibraciones/:idInstrumento/certificado (multipart)
  // Sube el PDF del certificado, registra documento/versión y crea el
  // certificado en estado PENDIENTE_REVISION.
  // ==========================================================================
  app.post(
    '/api/v1/calibraciones/:idInstrumento/certificado',
    {
      preHandler: [fastify.authenticate],
      schema: { params: idInstrumentoParamsSchema },
    },
    async (request) => {
      const idInstrumento = request.params.idInstrumento;
      const idUsuario = Number(request.user?.sub ?? 0);

      const data = await (request as any).file();
      if (!data) throw new AppError(400, 'Debe adjuntar el certificado en PDF');

      const buffer: Buffer = await data.toBuffer();
      if (data.mimetype !== 'application/pdf') {
        throw new AppError(415, 'El certificado debe ser un archivo PDF');
      }

      const fields = (data.fields ?? {}) as Record<string, { value?: unknown }>;
      const datosTecnicos = parseJsonField(fields.datosTecnicos?.value);
      const observaciones = (fields.observaciones?.value as string | undefined) ?? null;
      const estampillaField = (fields.estampilla?.value as string | undefined) ?? null;

      const detalle = await fastify.prisma.recepcion_equipo_detalles.findUnique({
        where: { ID_INSTRUMENTO: idInstrumento },
        include: { recepciones_equipo: { include: { ordenes_trabajo: true } } },
      });
      if (!detalle) throw new AppError(404, 'Instrumento no encontrado en recepción');

      const recepcion = detalle.recepciones_equipo;
      const ot = recepcion?.ordenes_trabajo ?? null;

      // Estampilla opcional (dispara la FSM a En_calibración)
      if (estampillaField && estampillaField.trim() !== '') {
        await fastify.prisma.recepcion_equipo_detalles.update({
          where: { ID_INSTRUMENTO: idInstrumento },
          data: { ESTAMPILLA: estampillaField.trim() },
        });
      }

      // 1. Upsert calibración
      const calibracion = await fastify.prisma.calibraciones.upsert({
        where: { ID_INSTRUMENTO_FK: idInstrumento },
        update: {
          ID_TECNICO_FK: idUsuario,
          DATOS_TECNICOS_JSON: datosTecnicos,
          OBSERVACIONES: observaciones,
        },
        create: {
          ID_INSTRUMENTO_FK: idInstrumento,
          ID_TECNICO_FK: idUsuario,
          DATOS_TECNICOS_JSON: datosTecnicos,
          OBSERVACIONES: observaciones,
        },
      });

      // 2. Subir el PDF a MinIO
      const safeName = sanitizeFileName(data.filename || `certificado_${idInstrumento}.pdf`);
      const key = `certificados/${Date.now()}_${safeName}`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: safeName });

      // 3. Documento + versión + certificado
      const certId = await fastify.prisma.$transaction(async (tx) => {
        const certExistente = await tx.certificados.findUnique({
          where: { ID_CALIBRACION_FK: calibracion.ID_CALIBRACION },
        });

        if (certExistente) {
          await tx.documentos.update({
            where: { ID_DOCUMENTO: certExistente.ID_DOCUMENTO_FK },
            data: { RUTA_URL: key, MIME_TYPE: 'application/pdf', PROVEEDOR: 'AWS_S3' },
          });
          const last = await tx.version_documentos.findFirst({
            where: { ID_DOCUMENTO_FK: certExistente.ID_DOCUMENTO_FK },
            orderBy: { VERSION: 'desc' },
          });
          await tx.version_documentos.create({
            data: {
              ID_DOCUMENTO_FK: certExistente.ID_DOCUMENTO_FK,
              VERSION: (last?.VERSION ?? 0) + 1,
              RUTA_URL: key,
              usuario_fk: idUsuario,
              content_json: { pdf: key },
            },
          });
          await tx.certificados.update({
            where: { ID_CERTIFICADO: certExistente.ID_CERTIFICADO },
            data: {
              ESTADO_REVISION: 'PENDIENTE_REVISION',
              MOTIVO_RECHAZO: null,
              ID_REVISOR_FK: null,
              REVISADO_AT: null,
            },
          });
          return certExistente.ID_CERTIFICADO;
        }

        const documento = await tx.documentos.create({
          data: {
            NOMBRE: safeName,
            RUTA_URL: key,
            PROVEEDOR: 'AWS_S3',
            MIME_TYPE: 'application/pdf',
            ID_RECEPCION_FK: recepcion?.ID_RECEPCION ?? null,
            ID_ORDEN_TRABAJO_FK: ot?.ID_ORDEN_TRABAJO ?? null,
          },
        });
        await tx.version_documentos.create({
          data: {
            ID_DOCUMENTO_FK: documento.ID_DOCUMENTO,
            VERSION: 1,
            RUTA_URL: key,
            usuario_fk: idUsuario,
            content_json: { pdf: key },
          },
        });
        const codigo = `CERT-${ot?.CODIGO_OT ?? 'SIN-OT'}-${detalle.ITEM ?? idInstrumento}`;
        const nuevoCert = await tx.certificados.create({
          data: {
            CODIGO_CERTIFICADO: codigo,
            ID_CALIBRACION_FK: calibracion.ID_CALIBRACION,
            ID_DOCUMENTO_FK: documento.ID_DOCUMENTO,
            ESTADO_REVISION: 'PENDIENTE_REVISION',
          },
        });
        return nuevoCert.ID_CERTIFICADO;
      });

      if (ot) await evaluarTransicionesOT(fastify.prisma, ot.ID_ORDEN_TRABAJO);

      return {
        ok: true as const,
        data: {
          idCalibracion: calibracion.ID_CALIBRACION,
          idCertificado: certId,
          rutaUrl: key,
        },
      };
    }
  );
}
