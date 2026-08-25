// workers/snapshot.worker.ts
// Proceso separado que consume la cola de snapshots (BullMQ) sin bloquear la API.
import 'dotenv/config';
import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client.js';
import { excelToUniverSnapshot } from '../lib/univer-parser/index.js';
import { SNAPSHOT_QUEUE, SNAPSHOT_TTL_SECONDS, getRedisConnection, SnapshotJobData } from '../lib/queue/queue.js';

const SNAPSHOT_KEY_PREFIX = 'univer:snapshot:';

function snapshotKey(versionId: number): string {
  return `${SNAPSHOT_KEY_PREFIX}${versionId}`;
}

async function processSnapshot(jobData: SnapshotJobData): Promise<{ versionId: number; status: string }> {
  const { versionId, rutaUrl, fileName } = jobData;

  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: rutaUrl,
  });

  const s3Response = await s3Client.send(getCommand);
  if (!s3Response.Body) {
    throw new Error(`Archivo vacío en MinIO para: ${rutaUrl}`);
  }

  const buffer = await streamToBuffer(s3Response.Body as any);

  const snapshot = await excelToUniverSnapshot(buffer, fileName);

  const redis = getRedisConnection();
  await redis.set(snapshotKey(versionId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SECONDS);

  return { versionId, status: 'completed' };
}

const worker = new Worker<SnapshotJobData>(SNAPSHOT_QUEUE, async (job) => {
  return processSnapshot(job.data);
}, {
  connection: getRedisConnection(),
  concurrency: 2,
});

worker.on('completed', (job) => {
  console.log(`[snapshot-worker] Job ${job.id} completado para versión ${job.data.versionId}`);
});

worker.on('failed', (job, err) => {
  console.error(`[snapshot-worker] Job ${job?.id} falló: ${err.message}`, err);
});

worker.on('error', (err) => {
  console.error('[snapshot-worker] Error del worker:', err);
});

console.log('[snapshot-worker] Worker de snapshots iniciado.');
