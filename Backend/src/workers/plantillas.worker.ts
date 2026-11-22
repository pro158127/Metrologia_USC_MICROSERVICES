import { despacharGeneracionesPendientes, type GeneracionExcelJob } from '../services/generacion-pendiente.service.js';
// workers/plantillas.worker.ts
import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { s3Client, BUCKET_NAME } from '../lib/s3Client.js';
import { getRedisConnection, TarifasJobData, TARIFAS_QUEUE,GENERATION_EXCEL } from '../lib/queue/queue.js';
import { procesarPlantillaJob } from './plantillasWorker.js';
import { PrismaClient } from '@prisma/client';
import { pipeline } from 'stream/promises';
import { generarExcelPlantilla } from './generador.excel.js'; 
import { despacharCorreosPendientes } from '../services/email-delivery.service.js';
import { cerrarWorkersAlDetener } from '../lib/queue/worker-shutdown.js';
const prisma = new PrismaClient();

async function processTarifasJob(job: Job<TarifasJobData>) {
  const { versionId, rutaUrl, mapeoConfig } = job.data;

  // 1. VALIDACIÓN Y BLOQUEO ATÓMICO
  const version = await prisma.version_plantillas.findUnique({
    where: { ID_VERSION_PLANTILLA: versionId },
  });

    if (!version) {
      throw new Error(`La versión ${versionId} no existe en la base de datos.`);
    }

  if (version.ESTADO === 'COMPLETADO') return 'La plantilla ya está procesada.';

  const jobId = String(job.id);
  const reserva = await prisma.version_plantillas.updateMany({
    where: {
      ID_VERSION_PLANTILLA: versionId,
      OR: [
        { ESTADO: { notIn: ['PROCESANDO', 'COMPLETADO'] } },
        { ESTADO: 'PROCESANDO', JOB_ID: jobId },
      ],
    },
    data: { 
      ESTADO: 'PROCESANDO',
      JOB_ID: jobId,
    },
  });
  if (!reserva.count) return 'Otra ejecución está procesando la plantilla o ya la completó.';

  const ext = path.extname(rutaUrl) || '.xlsx';
  const rutaArchivoLocal = path.join(os.tmpdir(), `tarifas-${versionId}-${Date.now()}${ext}`);

  // 2. DESCARGA DIRECTA A DISCO CON LIMPIEZA GARANTIZADA
  try {
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: rutaUrl,
    });
    
    const s3Response = await s3Client.send(getCommand);
    
    if (!s3Response.Body) {
      throw new Error(`Archivo vacío o no encontrado en MinIO para: ${rutaUrl}`);
    }

    const writeStream = fs.createWriteStream(rutaArchivoLocal);
    await pipeline(s3Response.Body as any, writeStream);

    // 3. PROCESAMIENTO E INSERCIÓN
    const res=await procesarPlantillaJob(versionId, rutaArchivoLocal, mapeoConfig);
    return (res || "Procesamiento completado sin errores, pero sin cambios detectados.");
  }
  

  finally {
    // Garantizamos que el archivo temporal de descarga siempre se elimine
    await fs.promises.rm(rutaArchivoLocal, { force: true }).catch(() => {});
  }
}

async function marcarError(job: Job<TarifasJobData>, error: Error) {
  try {
    if (await job.getState() !== 'failed') return;
    await prisma.version_plantillas.updateMany({
      where: {
        ID_VERSION_PLANTILLA: job.data.versionId,
        ESTADO: 'PROCESANDO',
        JOB_ID: String(job.id),
      },
      data: {
        ESTADO: 'ERROR',
        ERROR_LOG: error.message?.slice(0, 2000) || 'Error desconocido durante el procesamiento',
      },
    });
  } catch (err) {
    console.error('[plantillas-worker] No se pudo marcar el estado ERROR en la BD:', err);
  }
}

const worker = new Worker<TarifasJobData>(
  TARIFAS_QUEUE,
  async (job) => {
    return processTarifasJob(job);
  },
  {
    connection: getRedisConnection(),
    concurrency: 2, // 2 Excels pesados en paralelo máximo por contenedor
  }
);

worker.on('completed', (job) => {
  console.log(`✅ [plantillas-worker] Job ${job.id} completado con éxito (Versión ${job.data.versionId})`);
});

worker.on('failed', async (job, err) => {
  console.error(`❌ [plantillas-worker] Job ${job?.id} falló: ${err.message}`);
  if (job?.data?.versionId) {
    await marcarError(job, err);
  }
});

worker.on('error', (err) => {
  console.error('🚨 [plantillas-worker] Error crítico en la conexión del Worker:', err);
});

console.log('🚀 [plantillas-worker] Worker de consolidación de tarifas escuchando en Redis...');


const generador_excel= new Worker<GeneracionExcelJob>(GENERATION_EXCEL, async(job)=>{
  return generarExcelPlantilla(job);
},
 {
    connection: getRedisConnection(),
    concurrency: 2, 
  }
)


let despachando = false;
async function despacharDocumentos() {
  if (despachando) return;
  despachando = true;
  try {
    await despacharGeneracionesPendientes(prisma);
  } catch (error) {
    console.error('[generacion-documental] La cola no está disponible. Se reintentará.', error);
  } finally {
    despachando = false;
  }
}
void despacharDocumentos();
const intervaloDespacho = setInterval(() => { void despacharDocumentos(); }, 2000).unref();

let despachandoCorreo = false;
async function despacharCorreos() {
  if (despachandoCorreo) return;
  despachandoCorreo = true;
  try {
    await despacharCorreosPendientes(prisma);
  } catch (error) {
    console.error('[email] El despacho persistido se volverá a intentar.', error);
  } finally {
    despachandoCorreo = false;
  }
}
void despacharCorreos();
const intervaloCorreo = setInterval(() => { void despacharCorreos(); }, 3000).unref();

generador_excel.on('completed', (job, resultado) => {
  console.log('[generador_excel-worker] Documento generado', {
    redisJobId: job.id, id_job: job.data.id_job, pdf: resultado?.url_pdf,
  });
});

generador_excel.on('failed', async (job, err) => {
  if (!job) {
    console.error('[generador_excel-worker] Falló un trabajo sin datos:', err.message);
    return;
  }
  const { id_job, tipo, id_registro } = job.data;
  const contexto = { redisJobId: job.id, nombre: job.name, id_job, tipo, id_registro };
  console.error('[generador_excel-worker] Error generando documento', contexto, err.message);
  if (!id_job) return;

  try {
    const estado = await job.getState();
    if (estado !== 'failed') return;
    const resultado = await prisma.quote.updateMany({
      where: { id: id_job, status: { not: 'COMPLETED' } },
      data: { status: 'FAILED', data: { error: err.message } },
    });
    if (resultado.count === 0) {
      console.warn('[generador_excel-worker] El trabajo terminó sin registro Quote en PostgreSQL', contexto);
    }
  } catch (dbError) {
    console.error('[generador_excel-worker] No se pudo registrar el fallo en PostgreSQL', contexto, dbError);
  }
});

generador_excel.on('error', (err) => {
  console.error('🚨 [generador_excel-worker] Error crítico a nivel de conexión con Redis:', err);
});

console.log('🚀 [generador_excel-worker] Worker de generación de Excel escuchando en Redis...');

import { emailWorker } from './gestion_email.js';
import { worker_import } from './importarOTs.js';
cerrarWorkersAlDetener([worker, generador_excel, emailWorker, worker_import], () => {
  clearInterval(intervaloDespacho);
  clearInterval(intervaloCorreo);
});
