import { FastifyPluginAsync } from 'fastify';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client';

export const documentosRoutes: FastifyPluginAsync = async (fastify) => {

  // 1. SUBIR ARCHIVO A MINIO (Sin tocar Base de Datos)
  fastify.post('/api/v1/documentos/upload', async (request, reply) => {
    try {
      const data = await (request as any).file();
      if (!data) {
        return reply.status(400).send({ error: 'No se ha adjuntado ningún archivo' });
      }

      const buffer = await data.toBuffer();
      const customFileName = (data.fields?.nombreArchivo as any)?.value;
      const fileName = customFileName || data.filename;

      const s3Key = `documentos/${Date.now()}_${fileName}`;

      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ContentType: data.mimetype,
        Metadata: {
          originalName: fileName,
        }
      });

      await s3Client.send(uploadCommand);

      return reply.status(201).send({
        rutaUrl: s3Key,
      });

    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Error interno al subir el archivo a almacenamiento' });
    }
  });

  // 2. RECUPERAR/DESCARGAR ARCHIVO POR SU RUTA URL EN MINIO (* Wildcard)
  fastify.get('/api/v1/documentos/ver/*', async (request, reply) => {
    const rutaUrl = (request.params as any)['*'];

    if (!rutaUrl) {
      return reply.status(400).send({ error: 'Ruta de archivo no proporcionada' });
    }

    try {
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: rutaUrl,
      });

      const s3Response = await s3Client.send(getCommand);

      if (!s3Response.Body) {
        return reply.status(400).send({ error: 'El archivo recuperado está vacío' });
      }

      const buffer = await streamToBuffer(s3Response.Body as Readable);

      const contentType = s3Response.ContentType || 'application/octet-stream';
      const filename = s3Response.Metadata?.originalname || rutaUrl.split('/').pop() || 'archivo';

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `inline; filename="${filename}"`);
      reply.header('Access-Control-Allow-Origin', '*');

      return reply.send(buffer);

    } catch (error: any) {
      request.log.error(error);
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return reply.status(404).send({ error: 'Archivo no encontrado en el servidor de objetos' });
      }
      return reply.status(500).send({ error: 'Error al procesar la descarga del archivo' });
    }
  });

};
