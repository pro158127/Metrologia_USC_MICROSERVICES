import { FastifyInstance } from 'fastify';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client.js';
import { AppError } from '../lib/errors.js';

/**
 * Sanitiza nombres de archivo para generar Keys compatibles con S3/MinIO.
 * Remueve tildes, convierte espacios/caracteres especiales a guiones bajos.
 */
function sanitizeFileName(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const baseName = fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName;

  const cleanBase = baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Elimina acentos/tildes
    .replace(/[^a-zA-Z0-9_-]/g, '_')  // Remueve espacios y caracteres especiales
    .replace(/_+/g, '_');           // Evita guiones bajos repetidos

  return `${cleanBase}${extension}`;
}

export default async function documentosRoutes(fastify: FastifyInstance) {
  fastify.post('/api/v1/documentos/upload', async (request, reply) => {
    const data = await (request as any).file();
    if (!data) throw new AppError(400, 'No se ha adjuntado ningún archivo');

    const buffer = await data.toBuffer();
    const customFileName = (data.fields?.nombreArchivo as any)?.value;
    const rawFileName = customFileName || data.filename;

    // Sanitización del nombre para la clave de S3
    const safeFileName = sanitizeFileName(rawFileName);
    const s3Key = `documentos/${Date.now()}_${safeFileName}`;

    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: data.mimetype,
      Metadata: {
        // Guardamos el nombre raw codificado en base64 para evitar Signature Errors en los Metadata headers de S3
        originalname: Buffer.from(rawFileName).toString('base64'),
      },
    });

    try {
      await s3Client.send(uploadCommand);
    } catch (error) {
      request.log.error(error);
      throw new AppError(500, 'Error interno al subir el archivo a almacenamiento');
    }

    return reply.code(201).send({ rutaUrl: s3Key });
  });

  fastify.get('/api/v1/documentos/ver/*', async (request, reply) => {
    const rutaUrl = (request.params as any)['*'];

    if (!rutaUrl) throw new AppError(400, 'Ruta de archivo no proporcionada');

    try {
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: rutaUrl,
      });

      const s3Response = await s3Client.send(getCommand);

      if (!s3Response.Body) throw new AppError(400, 'El archivo recuperado está vacío');

      const buffer = await streamToBuffer(s3Response.Body as Readable);

      const contentType = s3Response.ContentType || 'application/octet-stream';
      
      // Decodificamos el nombre original guardado en metadata o fallback al nombre sanitizado
      let originalFilename = rutaUrl.split('/').pop() || 'archivo';
      if (s3Response.Metadata?.originalname) {
        try {
          originalFilename = Buffer.from(s3Response.Metadata.originalname, 'base64').toString('utf-8');
        } catch {
          // Fallback si la decodificación falla
        }
      }

      const encodedFilename = encodeURIComponent(originalFilename);

      reply.header('Content-Type', contentType);
      reply.header(
        'Content-Disposition',
        `inline; filename="${sanitizeFileName(originalFilename)}"; filename*=UTF-8''${encodedFilename}`
      );
      reply.header('Access-Control-Allow-Origin', '*');

      return reply.send(buffer);
    } catch (error) {
      if (error instanceof AppError) throw error;
      request.log.error(error);
      const s3Error = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (s3Error.name === 'NoSuchKey' || s3Error.$metadata?.httpStatusCode === 404) {
        throw new AppError(404, 'Archivo no encontrado en el servidor de objetos');
      }
      throw new AppError(500, 'Error al procesar la descarga del archivo');
    }
  });
}