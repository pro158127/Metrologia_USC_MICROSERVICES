import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio-storage:9000',
  region: process.env.MINIO_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
  },
  forcePathStyle: true,
});

export const BUCKET_NAME = 'documentos-metrologia';

/**
 * Serializa un Body de AWS S3 / MinIO a Buffer
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
