import { FastifyInstance } from 'fastify';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client.js';
import { AppError } from '../lib/errors.js';

const ALLOWED_MIMETYPES = ['application/pdf'];

export default async function pdfRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/pdf/upload', async (request, reply) => {
    const data = await (request as any).file();
    if (!data) throw new AppError(400, 'No se ha adjuntado ningún archivo');

    if (!ALLOWED_MIMETYPES.includes(data.mimetype)) {
      throw new AppError(415, 'El archivo debe ser un PDF (application/pdf)');
    }

    const buffer = await data.toBuffer();
    const customFileName = (data.fields?.nombreArchivo as any)?.value;
    const fileName = customFileName || data.filename;

    const s3Key = `documentos/pdf/${Date.now()}_${fileName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: data.mimetype,
      Metadata: {
        originalName: fileName,
      },
    });

    try {
      await s3Client.send(uploadCommand);
    } catch (error) {
      request.log.error(error);
      throw new AppError(500, 'Error interno al subir el PDF a almacenamiento');
    }

    return reply.code(201).send({ rutaUrl: s3Key });
  });

  fastify.get('/api/v1/pdf/ver/*', async (request, reply) => {
    const rutaUrl = (request.params as any)['*'];

    if (!rutaUrl) throw new AppError(400, 'Ruta de archivo no proporcionada');

    try {
      console.log('Intentando recuperar PDF desde MinIO con ruta:', rutaUrl);
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: rutaUrl,
      });

      const s3Response = await s3Client.send(getCommand);

      if (!s3Response.Body) throw new AppError(400, 'El archivo recuperado está vacío');

      const buffer = await streamToBuffer(s3Response.Body as Readable);

      const contentType = s3Response.ContentType || 'application/pdf';
      const filename = s3Response.Metadata?.originalname || rutaUrl.split('/').pop() || 'archivo.pdf';

      reply.header('Content-Type', contentType);
      reply.header('Content-Disposition', `inline; filename="${filename}"`);
      reply.header('Access-Control-Allow-Origin', '*');

      return reply.send(buffer);
    } catch (error) {
      if (error instanceof AppError) throw error;
      request.log.error(error);
      const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
        throw new AppError(404, 'Archivo no encontrado en el servidor de objetos');
      }
      throw new AppError(500, 'Error al procesar la descarga del PDF');
    }
  });
}
