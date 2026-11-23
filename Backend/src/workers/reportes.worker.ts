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
  obtenerReporteAuditoriaFactura,
  generarAuditoriaFacturaPdf,
  generarAuditoriaFacturaExcel,
} from '../services/reportes.service.js';
import { deleteObject, getObjectBuffer, uploadBuffer } from '../lib/minioClient.js';
import type { DatosReporte, ReporteAuditoriaFactura } from '../services/reportes.service.js';

const prisma = new PrismaClient();

export const reportesWorker = new Worker<ReportesJobData>(
  REPORTES_QUEUE,
  async (job) => {
    const formato = job.data.tipo === 'trazabilidad_factura' ? 'auditoria' : job.data.formato;
    const filtros = job.data.tipo === 'trazabilidad_factura' ? {} : job.data.filtros;
    const jobStartedAt = Date.now();
    let etapa = 'consultar_datos';
    const log = (evento: string, detalles: Record<string, unknown> = {}) => {
      console.info(JSON.stringify({
        servicio: 'reportes-worker', evento, jobId: job.id, formato, etapa, ...detalles,
      }));
    };

    try {
      log('iniciado');

      if (job.data.tipo === 'trazabilidad_factura') {
        etapa = 'consultar_factura';
        const consultaAuditoriaStartedAt = Date.now();
        const datosAuditoria = job.data.snapshotKey
          ? (JSON.parse((await getObjectBuffer(job.data.snapshotKey)).toString('utf8')) as { data: ReporteAuditoriaFactura }).data
          : await obtenerReporteAuditoriaFactura(prisma, job.data.numeroFactura);
        if (!datosAuditoria) throw new Error('No existe una factura con el número indicado.');
        log('trazabilidad_lista', {
          duracionMs: Date.now() - consultaAuditoriaStartedAt,
          numeroFactura: datosAuditoria.numeroFactura,
          unidades: datosAuditoria.filas.length,
        });

        etapa = 'generar_archivos_auditoria';
        const generacionStartedAt = Date.now();
        const [pdf, excel] = await Promise.all([
          generarAuditoriaFacturaPdf(datosAuditoria),
          generarAuditoriaFacturaExcel(datosAuditoria),
        ]);
        log('archivos_auditoria_generados', {
          duracionMs: Date.now() - generacionStartedAt,
          pdfBytes: pdf.byteLength,
          excelBytes: excel.byteLength,
        });

        etapa = 'subir_archivos_auditoria';
        const safeInvoice = datosAuditoria.numeroFactura.replace(/[^a-zA-Z0-9_-]/g, '_');
        const pdfFilename = 'trazabilidad_' + safeInvoice + '.pdf';
        const excelFilename = 'trazabilidad_' + safeInvoice + '.xlsx';
        const pdfKey = 'reportes/auditorias/' + job.id + '_' + pdfFilename;
        const excelKey = 'reportes/auditorias/' + job.id + '_' + excelFilename;
        await Promise.all([
          uploadBuffer(pdfKey, pdf, 'application/pdf', { originalName: pdfFilename }),
          uploadBuffer(excelKey, excel, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', { originalName: excelFilename }),
        ]);
        if (job.data.snapshotKey) {
          await deleteObject(job.data.snapshotKey).catch((error) => log('snapshot_no_eliminado', {
            snapshotKey: job.data.snapshotKey, error: error instanceof Error ? error.message : String(error),
          }));
        }
        log('auditoria_subida', {
          numeroFactura: datosAuditoria.numeroFactura,
          duracionTotalMs: Date.now() - jobStartedAt,
          pdfBytes: pdf.byteLength,
          excelBytes: excel.byteLength,
        });
        return {
          tipo: 'trazabilidad_factura' as const,
          numeroFactura: datosAuditoria.numeroFactura,
          resumen: {
            factura: datosAuditoria.numeroFactura,
            cliente: datosAuditoria.cliente,
            fecha: datosAuditoria.fecha,
            valor: datosAuditoria.valor,
            ots: Array.from(new Set(datosAuditoria.filas.map((fila) => fila.orden))).join(', ') || datosAuditoria.ordenFactura,
            equipos: datosAuditoria.filas.length,
            cert: Array.from(new Set(datosAuditoria.filas.map((fila) => fila.certificado).filter((codigo) => codigo !== '—'))).join(', ') || null,
          },
          archivos: {
            pdf: { key: pdfKey, filename: pdfFilename, mime: 'application/pdf' },
            excel: { key: excelKey, filename: excelFilename, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          },
        };
      }

      const consultaStartedAt = Date.now();
      const datos = job.data.snapshotKey
        ? (JSON.parse((await getObjectBuffer(job.data.snapshotKey)).toString('utf8')) as { data: DatosReporte }).data
        : await obtenerDatosReporte(prisma, filtros);
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
      if (job.data.snapshotKey) {
        await deleteObject(job.data.snapshotKey).catch((error) => log('snapshot_no_eliminado', {
          snapshotKey: job.data.snapshotKey, error: error instanceof Error ? error.message : String(error),
        }));
      }
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
    formato: job?.data.tipo === 'trazabilidad_factura' ? 'auditoria' : job?.data.formato,
    error: err.message,
  }));
});

reportesWorker.on('error', (err) => {
  console.error(JSON.stringify({ servicio: 'reportes-worker', evento: 'error_worker', error: err.message }));
});

console.log('[reportes-worker] Worker de reportes iniciado.');
