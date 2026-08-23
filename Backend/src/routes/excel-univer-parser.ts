// routes/excel-univer-parser.ts
import { FastifyPluginAsync } from 'fastify';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client';

export const excelFileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/excel/download/:fileId', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };

    try {
      const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileId });
      const s3Response = await s3Client.send(command);

      if (!s3Response.Body) {
        return reply.status(400).send({ error: 'Archivo vacío' });
      }

      const buffer = await streamToBuffer(s3Response.Body as any);

      reply.header(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      reply.header('Content-Disposition', `inline; filename="${fileId}"`);
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Cache-Control', 'public, max-age=3600');

      return reply.send(buffer);
    } catch (error: any) {
      request.log.error(error);
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return reply.status(404).send({ error: 'Archivo no encontrado' });
      }
      return reply.status(500).send({ error: 'Error al obtener archivo' });
    }
  });
};
