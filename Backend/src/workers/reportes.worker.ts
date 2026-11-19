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
import { uploadBuffer } from '../lib/minioClient.js';

const prisma = new PrismaClient();

export const reportesWorker = new Worker<ReportesJobData>(
  REPORTES_QUEUE,
  async (job) => {
    const { formato, filtros } = job.data;
    const jobStartedAt = Date.now();
    let etapa = 'consultar_datos';
    const log = (evento: string, detalles: Record<string, unknown> = {}) => {
      console.info(JSON.stringify({
        servicio: 'reportes-worker', evento, jobId: job.id, formato, etapa, ...detalles,
      }));
    };

    try {
      log('iniciado');

      const consultaStartedAt = Date.now();
      const datos = await obtenerDatosReporte(prisma, filtros);
      log('datos_listos', {
        duracionMs: Date.now() - consultaStartedAt,
        certificados: datos.certificados.length,
        tecnicos: datos.tecnicos.length,
        trazabilidad: datos.trazabilidad.length,
      });

      let buffer: Buffer;
      let ext: string;
      let mime: string;
      const generacionStartedAt = Date.now();
      if (formato === 'pdf') {
        etapa = 'generar_pdf';
        buffer = await generarReportePdf(datos);
        ext = 'pdf';
        mime = 'application/pdf';
      } else {
        etapa = 'generar_excel';
        buffer = await generarReporteExcel(datos);
        ext = 'xlsx';
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      }
      log('archivo_generado', {
        duracionMs: Date.now() - generacionStartedAt,
        bytes: buffer.byteLength,
      });

      etapa = 'subir_minio';
      const key = `reportes/reporte_${Date.now()}.${ext}`;
      const subidaStartedAt = Date.now();
      await uploadBuffer(key, buffer, mime, { originalName: `reporte.${ext}` });
      log('archivo_subido', {
        duracionMs: Date.now() - subidaStartedAt,
        bytes: buffer.byteLength,
      });

      // Devolvemos la llave interna. El navegador descarga mediante el backend,
      // evitando firmas S3 que atraviesan el túnel/proxy público.
      log('completado', { duracionTotalMs: Date.now() - jobStartedAt, key });
      return { key, filename: `reporte.${ext}`, mime };
    } catch (error) {
      const detalle = error instanceof Error ? error : new Error(String(error));
      console.error(JSON.stringify({
        servicio: 'reportes-worker',
        evento: 'fallo',
        jobId: job.id,
        formato,
        etapa,
        duracionTotalMs: Date.now() - jobStartedAt,
        error: detalle.message,
        nombreError: detalle.name,
      }));
      throw error;
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 2,
  },
);

reportesWorker.on('completed', (job) => {
  console.info(JSON.stringify({ servicio: 'reportes-worker', evento: 'job_cerrado_completado', jobId: job.id }));
});

reportesWorker.on('failed', (job, err) => {
  console.error(JSON.stringify({
    servicio: 'reportes-worker',
    evento: 'job_cerrado_fallido',
    jobId: job?.id,
    formato: job?.data.formato,
    error: err.message,
  }));
});

reportesWorker.on('error', (err) => {
  console.error(JSON.stringify({ servicio: 'reportes-worker', evento: 'error_worker', error: err.message }));
});

console.log('[reportes-worker] Worker de reportes iniciado.');
