import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// 1. CLIENTE INTERNO (Workers/Backend -> MinIO dentro de la red de Docker)
export const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio-storage:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'admin_metrologia',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'PasswordSegura123',
  },
  forcePathStyle: true,
});

// 2. CLIENTE PÚBLICO (Exclusivo para presigned URLs de descarga hacia el navegador)
export const s3ClientPublic = new S3Client({
  endpoint: process.env.MINIO_PUBLIC_ENDPOINT || 'https://qcwngnfx-9000.use2.devtunnels.ms',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'admin_metrologia',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'PasswordSegura123',
  },
  forcePathStyle: true, // ✅ Obligatorio en MinIO para rutas tipo /bucket/archivo
});

export const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'documentos-metrologia';

export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}