import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { s3Client, BUCKET_NAME, streamToBuffer } from './s3Client.js';

/**
 * Capa de acceso a MinIO (S3-compatible) con wrappers limpios de streams,
 * buffers y URLs firmadas temporales para previsualización.
 */

export interface UploadMetadata {
  [key: string]: string;
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string,
  metadata?: UploadMetadata
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    Metadata: metadata,
  });
  await s3Client.send(command);
  return key;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`Archivo vacío en MinIO para: ${key}`);
  }
  return streamToBuffer(response.Body as Readable);
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  await s3Client.send(command);
}

export async function getObjectStream(key: string): Promise<Readable> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const response = await s3Client.send(command);
  if (!response.Body) {
    throw new Error(`Archivo vacío en MinIO para: ${key}`);
  }
  return response.Body as Readable;
}

export async function getSignedObjectUrl(key: string, ttlSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const url = await getSignedUrl(s3Client as any, command as any, { expiresIn: ttlSeconds });

  // Si se define MINIO_PUBLIC_URL, reescribe el host para que la URL firmada sea
  // accesible desde el navegador (en Docker el endpoint interno no es resoluble).
  const publicOrigin = process.env.MINIO_PUBLIC_URL;
  if (publicOrigin) {
    try {
      const signed = new URL(url);
      const target = new URL(publicOrigin);
      signed.protocol = target.protocol;
      signed.host = target.host;
      return signed.toString();
    } catch {
      return url;
    }
  }
  return url;
}
