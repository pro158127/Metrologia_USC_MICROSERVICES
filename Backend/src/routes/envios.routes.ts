import { FastifyInstance } from 'fastify';
import { EstadoOT } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { uploadBuffer } from '../lib/minioClient.js';
import { getEmailQueue } from '../lib/queue/queue.js';
import { transicionarOT } from '../services/ot-fsm.service.js';

const otParamsSchema = z.object({ id: z.coerce.number() });

const respuestaDocumentosEnvioSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    idOrdenTrabajo: z.number(),
    codigoOT: z.string(),
    cliente: z.string(),
    correo: z.string().nullable(),
    todosAprobados: z.boolean(),
    certificados: z.array(
      z.object({
        idCertificado: z.number(),
        codigo: z.string(),
        instrumento: z.string(),
        estampilla: z.string().nullable(),
        estadoRevision: z.string(),
        rutaUrl: z.string().nullable(),
        idDocumento: z.number(),
      })
    ),
    comprobante: z
      .object({ idDocumento: z.number(), nombre: z.string(), rutaUrl: z.string() })
      .nullable(),
  }),
});

async function cargarContextoOT(fastify: FastifyInstance, idOT: number) {
  const ot = await fastify.prisma.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    include: {
      clientes: true,
      recepciones_equipo: {
        include: {
          recepcion_equipo_detalles: {
            include: {
              calibraciones: {
                include: { certificados: { include: { documentos: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!ot) throw new AppError(404, 'Orden de trabajo no encontrada');

  const certificados = ot.recepciones_equipo.flatMap((rec) =>
    rec.recepcion_equipo_detalles.flatMap((det) => {
      const cert = det.calibraciones?.certificados;
      if (!cert) return [];
      return [
        {
          idCertificado: cert.ID_CERTIFICADO,
          codigo: cert.CODIGO_CERTIFICADO,
          instrumento: det.INSTRUMENTO,
          estampilla: det.ESTAMPILLA,
          estadoRevision: cert.ESTADO_REVISION,
          rutaUrl: cert.documentos?.RUTA_URL ?? null,
          idDocumento: cert.ID_DOCUMENTO_FK,
        },
      ];
    })
  );

  const comprobante = await fastify.prisma.documentos.findFirst({
    where: { ordenPagoId: idOT },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  const todosAprobados =
    certificados.length > 0 && certificados.every((c) => c.estadoRevision === 'APROBADO');

  return { ot, certificados, comprobante, todosAprobados };
}

async function convertirImagenAPdf(buffer: Buffer, mime: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const img =
    mime === 'image/png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return Buffer.from(await pdf.save());
}

export default async function enviosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================================================
  // GET /api/v1/ordenes/:id/documentos-envio
  // Certificados aprobados + comprobante (PDF) para el visor integrado.
  // ==========================================================================
  app.get(
    '/api/v1/ordenes/:id/documentos-envio',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: otParamsSchema,
        response: { 200: respuestaDocumentosEnvioSchema },
      },
    },
    async (request) => {
      const { ot, certificados, comprobante, todosAprobados } = await cargarContextoOT(
        fastify,
        request.params.id
      );

      return {
        ok: true as const,
        data: {
          idOrdenTrabajo: ot.ID_ORDEN_TRABAJO,
          codigoOT: ot.CODIGO_OT,
          cliente: ot.clientes?.RAZON_SOCIAL ?? ot.Razon_social ?? '—',
          correo: ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null,
          todosAprobados,
          certificados,
          comprobante: comprobante
            ? {
                idDocumento: comprobante.ID_DOCUMENTO,
                nombre: comprobante.NOMBRE,
                rutaUrl: comprobante.RUTA_URL,
              }
            : null,
        },
      };
    }
  );

  // ==========================================================================
  // POST /api/v1/ordenes/:id/comprobante (multipart)
  // Solo si TODOS los certificados están aprobados. Las imágenes se convierten a PDF.
  // ==========================================================================
  app.post(
    '/api/v1/ordenes/:id/comprobante',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      const idOT = request.params.id;
      const { ot, todosAprobados } = await cargarContextoOT(fastify, idOT);

      if (!todosAprobados) {
        throw new AppError(
          409,
          'El comprobante solo puede subirse cuando TODOS los certificados de la OT están aprobados.'
        );
      }

      const data = await (request as any).file();
      if (!data) throw new AppError(400, 'Debe adjuntar el comprobante (imagen o PDF)');

      const mime: string = data.mimetype;
      let buffer: Buffer = await data.toBuffer();

      const esImagen = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg';
      if (esImagen) {
        buffer = await convertirImagenAPdf(buffer, mime === 'image/jpg' ? 'image/jpeg' : mime);
      } else if (mime !== 'application/pdf') {
        throw new AppError(415, 'Formato no permitido. Use PDF, PNG o JPG.');
      }

      // En BD solo se registran comprobantes tipo PDF.
      const key = `comprobantes/${ot.CODIGO_OT}_${Date.now()}.pdf`;
      const nombre = `Comprobante_${ot.CODIGO_OT}.pdf`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: nombre });

      const existente = await fastify.prisma.documentos.findFirst({
        where: { ordenPagoId: idOT },
      });

      const documento = existente
        ? await fastify.prisma.documentos.update({
            where: { ID_DOCUMENTO: existente.ID_DOCUMENTO },
            data: { RUTA_URL: key, MIME_TYPE: 'application/pdf', PROVEEDOR: 'AWS_S3', NOMBRE: nombre },
          })
        : await fastify.prisma.documentos.create({
            data: {
              NOMBRE: nombre,
              RUTA_URL: key,
              PROVEEDOR: 'AWS_S3',
              MIME_TYPE: 'application/pdf',
              ID_ORDEN_TRABAJO_FK: idOT,
              ordenPagoId: idOT,
            },
          });

      return {
        ok: true as const,
        data: {
          idDocumento: documento.ID_DOCUMENTO,
          rutaUrl: documento.RUTA_URL,
        },
      };
    }
  );

  // ==========================================================================
  // POST /api/v1/ordenes/:id/enviar-certificados
  // Valida comprobante + certificados aprobados, transiciona la OT y encola el correo.
  // ==========================================================================
  app.post(
    '/api/v1/ordenes/:id/enviar-certificados',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      const idOT = request.params.id;
      const { ot, certificados, comprobante, todosAprobados } = await cargarContextoOT(
        fastify,
        idOT
      );

      if (!comprobante) {
        throw new AppError(409, 'Debe adjuntar el comprobante de pago antes de enviar.');
      }
      if (!todosAprobados) {
        throw new AppError(409, 'Todos los certificados deben estar aprobados para enviar.');
      }

      const destino = ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null;
      if (!destino) {
        throw new AppError(409, 'La OT no tiene correo de certificados configurado.');
      }

      // Transición explícita al estado de envío.
      await transicionarOT(fastify.prisma, idOT, EstadoOT.Certificado_enviado, {
        permitirRetroceso: true,
      });

      const links = [
        ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
        comprobante.RUTA_URL,
      ];

      const job = await getEmailQueue().add('enviar_certificados', {
        to: destino,
        subject: `Certificados de calibración — OT ${ot.CODIGO_OT}`,
        template_type: 'envia_certifiados',
        context_data: {
          nombreCliente: ot.clientes?.NOMBRE_CONTACTO ?? ot.clientes?.RAZON_SOCIAL ?? 'Cliente',
          numeroOT: ot.CODIGO_OT,
          numeroCotizacion: ot.no_cotizacion ?? null,
          totalCertificados: certificados.length,
          certificados: certificados.map((c, i) => ({
            item: i + 1,
            codigo: c.codigo,
            instrumento: c.instrumento,
            estampilla: c.estampilla ?? '—',
          })),
        },
        minio_links: links,
        id_registro: idOT,
        tipo_entry: 'prod',
      });

      return {
        ok: true as const,
        message: `Certificados encolados para envío a ${destino}.`,
        id_job: job.id,
      };
    }
  );
}
