import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import { s3Client, s3ClientPublic, BUCKET_NAME, streamToBuffer } from './s3Client.js';

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
  // Firmar directamente con el host público. Reescribir después el host de
  // una firma SigV4 invalida la firma porque el host forma parte de ella.
  return getSignedUrl(s3ClientPublic as any, command as any, { expiresIn: ttlSeconds });
}
