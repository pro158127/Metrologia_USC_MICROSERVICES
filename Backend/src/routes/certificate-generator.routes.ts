// routes/certificate-generator.routes.ts
// Endpoint de generación y compilación de certificados (plantilla + documento + sellos).
// Resuelve los PDFs desde S3/MinIO (key) o URL externa, compila con
// CertificateGeneratorService y devuelve la URL del objeto o el PDF en streaming.
import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { getObjectBuffer, getSignedObjectUrl, uploadBuffer } from '../lib/minioClient.js';
import {
  CertificateLayoutDTO,
  GenerateCertificatePayloadDTO,
  certificateGeneratorService,
} from '../services/certificate-generator.service.js';

const GENERATED_PREFIX = 'certificados-generados/';

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
  returnAs: z.enum(['url', 'stream']).default('url'),
});

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Descarga un PDF desde URL externa (respuesta binaria, sin base64). */
async function fetchPdfFromUrl(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new AppError(502, `No se pudo descargar el PDF desde la URL (HTTP ${response.status})`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/** Resuelve una referencia (S3/MinIO key o URL) a bytes binarios del PDF. */
async function resolvePdfBuffer(keyOrUrl: string): Promise<Uint8Array> {
  if (isHttpUrl(keyOrUrl)) {
    return fetchPdfFromUrl(keyOrUrl);
  }
  return getObjectBuffer(keyOrUrl);
}

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
      const payload: GenerateCertificatePayloadDTO = body;
      const layout: CertificateLayoutDTO = {
        documentArea: body.documentArea,
        watermarkAreas: body.watermarkAreas,
        pageRange: body.pageRange,
      };

      // Carga binaria de ambos PDFs en paralelo (ArrayBuffer / Uint8Array).
      const [templateBuffer, documentBuffer] = await Promise.all([
        resolvePdfBuffer(payload.templatePdfKeyOrUrl),
        resolvePdfBuffer(payload.documentPdfKeyOrUrl),
      ]);

      const generated = await certificateGeneratorService.generate(
        templateBuffer,
        documentBuffer,
        layout
      );

      const pdfBuffer = Buffer.from(generated.bytes);

      // Modo streaming: devuelve el PDF compilado directamente.
      if (body.returnAs === 'stream') {
        reply.header('Content-Type', 'application/pdf');
        reply.header(
          'Content-Disposition',
          `attachment; filename="${body.outputName || 'certificado.pdf'}"`
        );
        return reply.send(pdfBuffer);
      }

      // Modo por defecto: sube el binario compilado a MinIO y devuelve la URL firmada.
      const outputName = body.outputName || `certificado_${Date.now()}.pdf`;
      const outputKey = `${GENERATED_PREFIX}${Date.now()}_${outputName}`;
      await uploadBuffer(outputKey, pdfBuffer, 'application/pdf', {
        originalName: outputName,
      });

      const url = await getSignedObjectUrl(outputKey, 3600);

      return reply.code(201).send({
        ok: true as const,
        data: {
          outputKey,
          url,
          pageCount: generated.pageCount,
          pages: generated.pages,
        },
      });
    }
  );
}
