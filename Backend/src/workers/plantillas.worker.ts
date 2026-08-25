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
import { GenerarExcelBody } from '../routes/plantillas-generacion.schemas.js';
import { generarExcelPlantilla } from './generador.excel.js'; 
import { getEmailQueue } from '../lib/queue/queue.js';
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

  if (version.ESTADO === 'PROCESANDO' || version.ESTADO === 'COMPLETADO') {
    throw new Error(`La plantilla ${versionId} ya se encuentra en estado ${version.ESTADO}.`);
  }

  // Marcamos como "PROCESANDO" y asociamos el JOB_ID de BullMQ
  await prisma.version_plantillas.update({
    where: { ID_VERSION_PLANTILLA: versionId },
    data: { 
      ESTADO: 'PROCESANDO',
      JOB_ID: job.id?.toString() || null 
    },
  });

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

async function marcarError(versionId: number, error: Error) {
  try {
    await prisma.version_plantillas.update({
      where: { ID_VERSION_PLANTILLA: versionId },
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
    await marcarError(job.data.versionId, err);
  }
});

worker.on('error', (err) => {
  console.error('🚨 [plantillas-worker] Error crítico en la conexión del Worker:', err);
});

console.log('🚀 [plantillas-worker] Worker de consolidación de tarifas escuchando en Redis...');


const generador_excel= new Worker<GenerarExcelBody>(GENERATION_EXCEL, async(job)=>{
  return generarExcelPlantilla(job);
},
 {
    connection: getRedisConnection(),
    concurrency: 2, 
  }
)


generador_excel.on('completed', async(job,returnvalue) => {
  console.log(`✅ [generador_excel-worker] Job Redis ${job.id} completado con éxito. (Quote BD ID: ${job.data.id_job})`);
  if (returnvalue?.exito && returnvalue?.datos_correo) {
    const emailQueue = getEmailQueue(); // Instancia segura
    if(returnvalue.estado=="ENVIADA"){
    if(returnvalue.action=="cot_create"){
     await emailQueue.add('crear_cotizacion', {
    to: returnvalue.datos_correo.emailDestino,
    subject: `Cotización ${returnvalue.datos_correo.numeroCotizacion} - MetroSoft`,
    template_type: 'crear_cotizacion',
    context_data: returnvalue.datos_correo,
    minio_links: [returnvalue.url_pdf],
    // 👇 ESTO FALTABA PARA QUE TU WORKER DE CORREOS NO FALLE EN LOS LOGS
    tipo_entry: job.data.tipo_entry, 
    id_registro: job.data.id_registro
  });
    }}
    if (returnvalue.action === "cot_update") {
      await emailQueue.add('actualizacion_cotizacion', {
        to: returnvalue.datos_correo.emailDestino,
        // Cambiamos el Asunto para reflejar la aprobación
        subject: `Cotizacion actualizada: Cotización ${returnvalue.datos_correo.numeroCotizacion} - MetroSoft`,
        template_type: 'actualizar_cotizacion', // Apunta al segundo HTML en tu worker de correos
        context_data: returnvalue.datos_correo, // Ya incluye cantidadEquipos y numeroOT
        minio_links: [returnvalue.url_pdf]
      });
    }

    if(returnvalue.action=="aprove"){
      await emailQueue.add('aproved', {
        to: returnvalue.datos_correo.emailDestino,
        // Cambiamos el Asunto para reflejar la aprobación
        subject: `✅ Aprobada: Cotización ${returnvalue.datos_correo.numeroCotizacion} - MetroSoft`,
        template_type: 'aproved', // Apunta al segundo HTML en tu worker de correos
        context_data: returnvalue.datos_correo, // Ya incluye cantidadEquipos y numeroOT
        minio_links: [returnvalue.url_pdf]
      });
    }

      if (returnvalue.action === "ot_create") {
  await emailQueue.add('crear_ot', {
    to: returnvalue.datos_correo.emailDestino,
    // 1. Nuevo asunto indicando la acción requerida
    subject: `📋 Registro de Orden de Trabajo ${returnvalue.datos_correo.numeroOT} - MetroSoft`,
    // 2. Apunta al nombre exacto de tu nuevo archivo .hbs (ej: 'crear_ot.hbs')
    template_type: 'crear_ot', 
    // 3. Pasa las variables: nombreCliente, numeroOT, numeroCotizacion
    context_data: returnvalue.datos_correo, 
    // 4. Solo enviamos el Excel para que lo llenen
    minio_links: [returnvalue.url_excel],
    // 5. Mantenemos el rastreo para los logs de BullMQ
    tipo_entry: job.data.tipo_entry, 
    id_registro: job.data.id_registro
  });
}
    
    
    console.log(`➡️ [Orquestador] Correo encolado exitosamente.`);
  }
});

generador_excel.on('failed', async (job, err) => {
  console.error(`❌ [generador_excel-worker] Job Redis ${job?.id} falló: ${err.message}`);
  
  if (job?.data?.id_job) {
    try {
      // Liberamos el registro en BD para indicar que hubo un error crítico
      await prisma.quote.update({
        where: { id: job.data.id_job },
        data: { status: 'FAILED' }
      });
      console.log(`⚠️ [generador_excel-worker] Registro ${job.data.id_job} actualizado a FAILED en la base de datos.`);
    } catch (dbError) {
      console.error(`🚨 [generador_excel-worker] Fallo fatal al intentar actualizar la BD a FAILED:`, dbError);
    }
  }
});

generador_excel.on('error', (err) => {
  console.error('🚨 [generador_excel-worker] Error crítico a nivel de conexión con Redis:', err);
});

console.log('🚀 [generador_excel-worker] Worker de generación de Excel escuchando en Redis...');

import { emailWorker } from './gestion_email.js';
import { worker_import } from './importarOTs.js';
worker_import
emailWorker