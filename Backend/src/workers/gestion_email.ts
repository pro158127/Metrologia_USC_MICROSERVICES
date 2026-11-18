import { Worker, Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { Client as MinioClient } from 'minio';
import { EMAIL_QUEUE_NAME, getRedisConnection } from '../lib/queue/queue.js';
import { EmailJobData } from '../lib/queue/queue.js'; 
import { PrismaClient } from '@prisma/client';
import { registrarFalloCorreo } from '../services/email-delivery.service.js';
const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Configuración del Cliente MinIO
const cleanEndPoint = (process.env.MINIO_ENDPOINT || 'minio-storage').replace(/^https?:\/\//, '').split(':')[0]; 

const minioClient = new MinioClient({
  endPoint: cleanEndPoint, 
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin', 
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
});
const BUCKET_NAME = 'documentos-metrologia';

// 2. Configuración de Transporte SMTP (unificado con variables SMTP_* y
//    fallback a las variables OUTLOOK_* usadas históricamente).
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // Soporte para STARTTLS
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
  auth: {
    user: process.env.SMTP_USER || process.env.OUTLOOK_USER,
    pass: process.env.SMTP_PASSWORD || process.env.OUTLOOK_APP_PASSWORD,
  }
});

const EMAIL_FROM = process.env.SMTP_USER || process.env.OUTLOOK_USER || 'Soporte Metrología USC';

// 3. Compilador de Plantillas Handlebars
const renderHtml = (templateType: string, contextData: any): string => {
  const templatePath = path.join(__dirname, '../templates', `${templateType}.hbs`);
  if (!fs.existsSync(templatePath)) {
    throw new Error(`[EmailWorker] Plantilla no encontrada: ${templatePath}`);
  }
  const source = fs.readFileSync(templatePath, 'utf8');
  const template = handlebars.compile(source);
  return template(contextData);
};

// 4. Procesador de Archivos Optimizado para Nodemailer (Sin Base64)
const procesarAdjuntosNodemailer = async (links?: string[]) => {
  if (!links || links.length === 0) return [];
  const attachments = [];
  
  for (const link of links) {
    try {
      const fileName = link.split('/').pop()?.split('?')[0] || 'adjunto';
      let objectName = link;

      if (link.startsWith('http')) {
        const urlObj = new URL(link);
        let pathStr = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
        if (pathStr.startsWith(`${BUCKET_NAME}/`)) {
          objectName = pathStr.replace(`${BUCKET_NAME}/`, '');
        } else {
          objectName = pathStr;
        }
      }

      console.log(`[EmailWorker] Descargando con SDK | Bucket: ${BUCKET_NAME} | Objeto: ${objectName}`);
      const dataStream = await minioClient.getObject(BUCKET_NAME, objectName);
      
      const chunks: Buffer[] = [];
      for await (const chunk of dataStream) {
        chunks.push(chunk);
      }
      
      attachments.push({
        filename: fileName,
        content: Buffer.concat(chunks) // Nodemailer procesa el Buffer crudo directamente
      });
    } catch (err: any) {
      throw new Error(`No se pudo preparar el adjunto requerido ${link}: ${err.message}`);
    }
  }
  return attachments;
};

// 5. Definición del Worker
export const emailWorker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job: Job<EmailJobData>) => {
    const { 
      to, subject, template_type, context_data,
      minio_links, tipo_entry, id_registro
    } = job.data;

    if (job.data.id_envio_correo) {
      await prisma.correo_envios.update({
        where: { ID_ENVIO_CORREO: job.data.id_envio_correo },
        data: {
          ESTADO: 'EN_PROCESO',
          INTENTOS: { increment: 1 },
          ID_JOB: String(job.id),
        },
      });
    }

    console.log(`[EmailWorker] Iniciando Job ${job.id} | Tipo: ${template_type} | Registro: ${id_registro}`);

    if (tipo_entry === 'test') {
      console.log(`[EmailWorker] Modo TEST detectado para ${to}. Omitiendo envío.`);
      if (job.data.id_envio_correo) {
        await prisma.correo_envios.update({
          where: { ID_ENVIO_CORREO: job.data.id_envio_correo },
          data: { ESTADO: 'OMITIDO_TEST' },
        });
      }
      return { status: 'skipped_test_mode', to };
    }

    try {
      // Construir cuerpo y extraer archivos desde MinIO
      const htmlContent = renderHtml(template_type, context_data);
      const emailAttachments = await procesarAdjuntosNodemailer(minio_links);

      console.log(`[EmailWorker] 🚀 Despachando SMTP... Archivos listos: ${emailAttachments.length}`);

      // Ejecutar envío mediante Nodemailer
      const info = await transporter.sendMail({
        from: EMAIL_FROM, 
        to: to,
        subject: subject,
        html: htmlContent,
        attachments: emailAttachments
      });

      const destinatarios = (Array.isArray(to) ? to : [to]).map((v) => v.toLowerCase());
      const aceptados = (info.accepted ?? []).map((v) => String(v).toLowerCase());
      const rechazados = (info.rejected ?? []).map(String);
      const faltantes = destinatarios.filter((destinatario) => !aceptados.includes(destinatario));
      if (rechazados.length || faltantes.length) {
        throw new Error(`SMTP rechazó destinatarios. Rechazados: ${rechazados.join(', ') || 'ninguno'}; sin aceptación: ${faltantes.join(', ') || 'ninguno'}`);
      }

      console.log(`[EmailWorker] ✅ Éxito | Job ${job.id} procesado. MessageId: ${info.messageId}`);
      return { status: 'delivered' };

    } catch (error: any) {
      console.error(`[EmailWorker] ❌ Error en Job ${job.id}:`, error.message);
      throw error; 
    }
  },
  {
    connection: getRedisConnection(),
    concurrency: 5, 
  }
);

emailWorker.on('completed', async (job, result) => {
  console.log(`[EmailWorker] Job encolado en Redis completado: ${job.id}`);
  if (job?.data.id_envio_correo && result?.status !== 'skipped_test_mode') {
    await prisma.correo_envios.update({
      where: { ID_ENVIO_CORREO: job.data.id_envio_correo },
      data: { ESTADO: 'ENVIADO', ENVIADO_AT: new Date(), ULTIMO_ERROR: null },
    }).catch((error) => console.error('[EmailWorker] No se pudo marcar el correo como enviado:', error));
  }
});

emailWorker.on('failed', async (job, err) => {
  console.error(`[EmailWorker] Job fallido: ${job?.id} | Error: ${err.message}`);

  if (job && job.data) {
    const { id_registro } = job.data;

    const totalIntentos = Number(job.opts.attempts ?? 1);
    if (job.attemptsMade >= totalIntentos) {
      await registrarFalloCorreo(prisma, job.data, String(job.id), err, job.attemptsMade);
    }

  }
});
