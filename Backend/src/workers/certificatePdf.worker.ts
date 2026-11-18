// workers/certificatePdf.worker.ts
// Proceso asíncrono que consume la cola de generación de certificados PDF.
// Evita bloquear el Event Loop de la API (pdf-lib + IO de MinIO).
import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  CERTIFICATE_PDF_QUEUE,
  getRedisConnection,
  CertificatePdfJobData,
} from '../lib/queue/queue.js';
import {
  composeCertificateToMinio,
  generarCertificadoFinal,
} from '../services/certificatePdf.service.js';

const prisma = new PrismaClient();

export const certificatePdfWorker = new Worker<CertificatePdfJobData>(
  CERTIFICATE_PDF_QUEUE,
  async (job) => {
    const data = job.data;

    if (data.tipo === 'certificado') {
      return generarCertificadoFinal(
        prisma,
        data.certificadoId,
        data.selloId,
        data.usuarioId
      );
    }

    return composeCertificateToMinio(data);
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

certificatePdfWorker.on('completed', (job) => {
  console.log(`[cert-pdf-worker] Job ${job.id} completado`);
});

certificatePdfWorker.on('failed', (job, err) => {
  console.error(`[cert-pdf-worker] Job ${job?.id} falló: ${err.message}`, err);
});

certificatePdfWorker.on('error', (err) => {
  console.error('[cert-pdf-worker] Error del worker:', err);
});

console.log('[cert-pdf-worker] Worker de generación de certificados iniciado.');
