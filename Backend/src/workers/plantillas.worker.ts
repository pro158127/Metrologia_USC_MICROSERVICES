// workers/plantillas.worker.ts
// Proceso separado (BullMQ) que consume la cola de consolidación de tarifas.
// Descarga el .xlsx desde MinIO a un archivo temporal local y delega en
// `procesarPlantillaJob` (parser Python + upsert atómico con Prisma).
import 'dotenv/config';
import { Worker } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { s3Client, BUCKET_NAME, streamToBuffer } from '../lib/s3Client.js';
import { getRedisConnection, TarifasJobData, TARIFAS_QUEUE } from '../lib/queue/queue.js';
import { procesarPlantillaJob } from './plantillasWorker.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function processTarifasJob(jobData: TarifasJobData) {
  const { versionId, rutaUrl, mapeoConfig } = jobData;

  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: rutaUrl,
  });
  const s3Response = await s3Client.send(getCommand);
  if (!s3Response.Body) {
    throw new Error(`Archivo vacío en MinIO para: ${rutaUrl}`);
  }

  const buffer = await streamToBuffer(s3Response.Body as any);

  const ext = path.extname(rutaUrl) || '.xlsx';
  const rutaArchivoLocal = path.join(os.tmpdir(), `tarifas-${versionId}-${Date.now()}${ext}`);
  await fs.promises.writeFile(rutaArchivoLocal, buffer);

  try {
    await procesarPlantillaJob(versionId, rutaArchivoLocal, mapeoConfig);
  } finally {
    await fs.promises.rm(rutaArchivoLocal, { force: true });
  }
}

async function marcarError(versionId: number, error: Error) {
  try {
    await prisma.version_plantillas.update({
      where: { ID_VERSION_PLANTILLA: versionId },
      data: {
        ESTADO: 'ERROR',
        ERROR_LOG: error.message?.slice(0, 2000) || 'Error desconocido',
      },
    });
  } catch (err) {
    console.error('[plantillas-worker] No se pudo marcar ERROR en la versión:', err);
  }
}

const worker = new Worker<TarifasJobData>(
  TARIFAS_QUEUE,
  async (job) => {
    return processTarifasJob(job.data);
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(
    `[plantillas-worker] Job ${job.id} completado para la versión ${job.data.versionId}`
  );
});

worker.on('failed', async (job, err) => {
  console.error(`[plantillas-worker] Job ${job?.id} falló: ${err.message}`, err);
  if (job?.data?.versionId) {
    await marcarError(job.data.versionId, err);
  }
});

worker.on('error', (err) => {
  console.error('[plantillas-worker] Error del worker:', err);
});

console.log('[plantillas-worker] Worker de consolidación de tarifas iniciado.');
