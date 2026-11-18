// workers/reportes.worker.ts
// Proceso asíncrono que genera los archivos de exportación de reportes
// (PDF / Excel) y los sube a MinIO.
import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import {
  REPORTES_QUEUE,
  getRedisConnection,
  ReportesJobData,
} from '../lib/queue/queue.js';
import {
  obtenerDatosReporte,
  generarReportePdf,
  generarReporteExcel,
} from '../services/reportes.service.js';
import { uploadBuffer, getSignedObjectUrl } from '../lib/minioClient.js';

const prisma = new PrismaClient();

export const reportesWorker = new Worker<ReportesJobData>(
  REPORTES_QUEUE,
  async (job) => {
    const { formato, filtros } = job.data;
    const datos = await obtenerDatosReporte(prisma, filtros);

    let buffer: Buffer;
    let ext: string;
    let mime: string;
    if (formato === 'pdf') {
      buffer = await generarReportePdf(datos);
      ext = 'pdf';
      mime = 'application/pdf';
    } else {
      buffer = await generarReporteExcel(datos);
      ext = 'xlsx';
      mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    const key = `reportes/reporte_${Date.now()}.${ext}`;
    await uploadBuffer(key, buffer, mime, { originalName: `reporte.${ext}` });
    const url = await getSignedObjectUrl(key, 3600);

    return { url };
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

reportesWorker.on('completed', (job) => {
  console.log(`[reportes-worker] Job ${job.id} completado`);
});

reportesWorker.on('failed', (job, err) => {
  console.error(`[reportes-worker] Job ${job?.id} falló: ${err.message}`, err);
});

console.log('[reportes-worker] Worker de reportes iniciado.');
