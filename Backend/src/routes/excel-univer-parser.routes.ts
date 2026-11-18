import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client.js';
import { AppError } from '../lib/errors.js';

const fileIdParamSchema = z.object({
  fileId: z.string(),
});

export default async function excelFileRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/excel/download/:fileId',
    { schema: { params: fileIdParamSchema } },
    async (request, reply) => {
      const fileId = request.params.fileId;

      try {
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileId });
        const s3Response = await s3Client.send(command);

        if (!s3Response.Body) throw new AppError(400, 'Archivo vacío');

        const buffer = await streamToBuffer(s3Response.Body as any);

        reply.header(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        reply.header('Content-Disposition', `inline; filename="${fileId}"`);
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=3600');

        return reply.send(buffer);
      } catch (error) {
        if (error instanceof AppError) throw error;
        request.log.error(error);
        const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
          throw new AppError(404, 'Archivo no encontrado');
        }
        throw new AppError(500, 'Error al obtener archivo');
      }
    }
  );
}
