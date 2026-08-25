// routes/plantillas-generacion.routes.ts
// Endpoint de generación dinámica de Excel: hidrata la plantilla activa con los
// valores del registro (COTIZACION / ORDEN_TRABAJO / RECEPCION) usando el
// MAPPING_CONFIG de la versión vigente y devuelve el binario (stream) o una URL.
import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { getSignedObjectUrl, uploadBuffer } from '../lib/minioClient.js';
import { generarDocumentoExcel } from '../services/excel-generator.service.js';
import { generarExcelBodySchema } from './plantillas-generacion.schemas.js';

const GENERATED_PREFIX = 'documentos/generados/';
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export default async function plantillasGeneracionRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/plantillas/generar-excel',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: generarExcelBodySchema,
      },
    },
    async (request, reply) => {
      const { tipo, id, plantillaId, version, returnAs, fileName } = request.body;

      const generado = await generarDocumentoExcel({
        prisma: fastify.prisma,
        tipo,
        id,
        plantillaId,
        version,
      });

      if (returnAs === 'stream') {
        reply.header('Content-Type', EXCEL_MIME);
        reply.header('Content-Disposition', `attachment; filename="${fileName ?? generado.fileName}"`);
        return reply.send(generado.buffer);
      }

      const outputKey = `${GENERATED_PREFIX}${Date.now()}_${generado.fileName}`;
      await uploadBuffer(outputKey, generado.buffer, EXCEL_MIME, {
        originalName: generado.fileName,
      });
      const url = await getSignedObjectUrl(outputKey, 3600);

      return reply.code(201).send({
        ok: true as const,
        data: { outputKey, url, fileName: generado.fileName },
      });
    }
  );
}
