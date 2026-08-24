// lib/queue/queue.ts
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const SNAPSHOT_QUEUE = 'snapshot-queue';
export const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60; // 1 día de cache del snapshot

export const STAMP_PDF_QUEUE = 'stamp-pdf-queue';
export const TEMPLATE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 día de cache de plantillas base
export const STAMP_JOB_PREFIX = 'stamp:job:';

export const TARIFAS_QUEUE = 'tarifas-queue';

let connection: IORedis | null = null;
let snapshotQueue: Queue | null = null;
let stampPdfQueue: Queue | null = null;
let tarifasQueue: Queue | null = null;

/**
 * Conexión Redis compartida (singleton) para colas y worker.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

/**
 * Cola de snapshots (singleton) para enqueue desde rutas.
 */
export function getSnapshotQueue(): Queue {
  if (!snapshotQueue) {
    snapshotQueue = new Queue(SNAPSHOT_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return snapshotQueue;
}

export interface SnapshotJobData {
  versionId: number;
  rutaUrl: string;
  fileName?: string;
}

export interface StampPdfJobData {
  selloId: number;
  tempInputKey: string;
  outputDocumentName: string;
}

export function getStampPdfQueue(): Queue {
  if (!stampPdfQueue) {
    stampPdfQueue = new Queue(STAMP_PDF_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return stampPdfQueue;
}

export interface TarifasJobData {
  versionId: number;
  rutaUrl: string;
  fileName?: string;
  mapeoConfig: object;
}

export function getTarifasQueue(): Queue {
  if (!tarifasQueue) {
    tarifasQueue = new Queue(TARIFAS_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return tarifasQueue;
}
