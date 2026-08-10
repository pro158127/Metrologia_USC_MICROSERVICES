// routes/excel-file.ts
import { FastifyPluginAsync } from 'fastify';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio-storage:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

const BUCKET_NAME = 'documentos-metrologia';

export const excelFileRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/v1/excel/download/:fileId', async (request, reply) => {
    const { fileId } = request.params as { fileId: string };

    try {
      const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: fileId });
      const s3Response = await s3Client.send(command);

      if (!s3Response.Body) {
        return reply.status(400).send({ error: 'Archivo vacío' });
      }

      // Convertir el stream a buffer (más fiable que enviar el stream directamente)
      const chunks: Buffer[] = [];
      for await (const chunk of s3Response.Body as any) {
        chunks.push(Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      // Configurar headers para forzar la descarga del binario
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