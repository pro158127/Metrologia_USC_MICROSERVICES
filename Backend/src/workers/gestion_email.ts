import { Worker, Job } from 'bullmq';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { Client as MinioClient } from 'minio';
import { getRedisConnection } from '../lib/queue/queue.js';
import { EmailJobData } from '../lib/queue/queue.js'; 
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMAIL_QUEUE_NAME = 'email_queue_jobs';

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

// 2. Configuración de Transporte SMTP (Validado con Google)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // Soporte para STARTTLS
  auth: {
    user: process.env.OUTLOOK_USER, // Sigue usando tu variable de entorno existente
    pass: process.env.OUTLOOK_APP_PASSWORD,
  }
});

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
      console.error(`[EmailWorker] ⚠️ Error al procesar adjunto (${link}):`, err.message);
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

    console.log(`[EmailWorker] Iniciando Job ${job.id} | Tipo: ${template_type} | Registro: ${id_registro}`);

    if (tipo_entry === 'test') {
      console.log(`[EmailWorker] Modo TEST detectado para ${to}. Omitiendo envío.`);
      return { status: 'skipped_test_mode', to };
    }

    try {
      // Construir cuerpo y extraer archivos desde MinIO
      const htmlContent = renderHtml(template_type, context_data);
      const emailAttachments = await procesarAdjuntosNodemailer(minio_links);

      console.log(`[EmailWorker] 🚀 Despachando SMTP... Archivos listos: ${emailAttachments.length}`);

      // Ejecutar envío mediante Nodemailer
      const info = await transporter.sendMail({
        from: process.env.OUTLOOK_USER, 
        to: to,
        subject: subject,
        html: htmlContent,
        attachments: emailAttachments
      });

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

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job encolado en Redis completado: ${job.id}`);
});

emailWorker.on('failed', async (job, err) => {
  console.error(`[EmailWorker] Job fallido: ${job?.id} | Error: ${err.message}`);

  if (job && job.data) {
    const { id_registro, template_type } = job.data;

    try {
      // Verificamos si el correo que falló era de una creación de OT
      if (template_type === 'crear_ot' && id_registro) {
        
        // 1. Consultamos la OT para obtener el ID de la cotización
        const ot = await prisma.ordenes_trabajo.findUnique({
          where: { ID_ORDEN_TRABAJO: Number(id_registro) }
        });

        // 2. Si existe y tiene una cotización anclada, la regresamos a ENVIADA
        if (ot && ot.ID_COTIZACION_FK) {
          await prisma.cotizaciones.update({
            where: { ID_COTIZACION: ot.ID_COTIZACION_FK },
            data: { ESTADO: 'ENVIADA' }
          });
          console.warn(`[EmailWorker] ⚠️ Reversión ejecutada: Cotización ${ot.ID_COTIZACION_FK} regresada a 'ENVIADA' porque el correo de la OT falló.`);
        }
      }
    } catch (dbError) {
      console.error(`[EmailWorker] 🚨 Error crítico al intentar revertir el estado de la cotización:`, dbError);
    }
  }
});