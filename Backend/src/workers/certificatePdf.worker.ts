// workers/certificatePdf.worker.ts
// Proceso asíncrono que consume la cola de generación de certificados PDF.
// Evita bloquear el Event Loop de la API (pdf-lib + IO de MinIO).
import 'dotenv/config';
import { Worker } from 'bullmq';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  CERTIFICATE_PDF_QUEUE,
  getCertificatePdfQueue,
  getRedisConnection,
  CertificatePdfJobData,
  CertificateReviewJobData,
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
      const resultado = await generarCertificadoFinal(
        prisma,
        data.certificadoId,
        data.selloId,
        data.usuarioId,
        data.revision,
      );
      if (job.id) {
        await prisma.quote.updateMany({
          where: { id: job.id },
          data: { status: 'COMPLETED', fileUrl: resultado.outputKey ?? null },
        });
      }
      return resultado;
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

let despachando = false;
async function despacharSelladosPendientes(): Promise<void> {
  if (despachando) return;
  despachando = true;
  try {
    const pendientes = await prisma.quote.findMany({
      where: { status: 'PENDING', data: { path: ['sellado'], not: Prisma.AnyNull } },
      select: { id: true, data: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    const cola = getCertificatePdfQueue();
    for (const pendiente of pendientes) {
      const sellado = (pendiente.data as { sellado?: CertificateReviewJobData } | null)?.sellado;
      if (!sellado) continue;
      const job = await cola.getJob(pendiente.id);
      if (!job) {
        await cola.add('generar-certificado', sellado, { jobId: pendiente.id });
        continue;
      }
      const estado = await job.getState();
      if (estado === 'failed') {
        await prisma.quote.updateMany({
          where: { id: pendiente.id, status: 'PENDING' },
          data: { status: 'FAILED', data: { sellado: { ...sellado }, error: job.failedReason ?? 'No se pudo sellar el certificado.' } },
        });
      } else if (estado === 'completed') {
        await prisma.quote.updateMany({
          where: { id: pendiente.id, status: 'PENDING' },
          data: { status: 'COMPLETED', fileUrl: job.returnvalue?.outputKey ?? null },
        });
      }
    }
  } catch (error) {
    console.error('[cert-pdf-worker] No se pudo sincronizar la cola de sellado. Se volverá a intentar.', error);
  } finally {
    despachando = false;
  }
}

void despacharSelladosPendientes();
const intervaloSellados = setInterval(() => { void despacharSelladosPendientes(); }, 3000).unref();
export function detenerDespachoSellados(): void {
  clearInterval(intervaloSellados);
}
