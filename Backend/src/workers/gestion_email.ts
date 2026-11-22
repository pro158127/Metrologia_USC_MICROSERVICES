import { Worker, Job, UnrecoverableError } from 'bullmq';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { Client as MinioClient } from 'minio';
import { EMAIL_QUEUE_NAME, getRedisConnection } from '../lib/queue/queue.js';
import { EmailJobData } from '../lib/queue/queue.js'; 
import { PrismaClient } from '@prisma/client';
import { correoValido, registrarFalloCorreo } from '../services/email-delivery.service.js';
import { codigoSigueVigente } from '../services/recovery.service.js';
import { abrirContenidoCorreo } from '../services/contenido-correo.service.js';
import { verificarTokenAprobacion } from '../lib/approval-token.js';
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
const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'documentos-metrologia';

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

    const persistido = /^(correo|directo)-/.test(String(job.id));
    if (job.data.id_envio_correo) {
      const activo = await prisma.correo_envios.updateMany({
        where: {
          ID_ENVIO_CORREO: job.data.id_envio_correo,
          ESTADO: { in: ['PENDIENTE', 'EN_PROCESO'] },
          ...(persistido && { ID_JOB: String(job.id) }),
        },
        data: {
          ESTADO: 'EN_PROCESO',
          INTENTOS: { increment: 1 },
          ID_JOB: String(job.id),
        },
      });
      if (!activo.count) return { status: 'skipped_superseded' };
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
      if (job.data.expira_en && Date.now() >= job.data.expira_en) {
        throw new UnrecoverableError('El código expiró antes de enviarse. Solicite un código nuevo.');
      }
      const verificacion = job.data.codigo_verificacion;
      let contextoRenderizado;
      try {
        contextoRenderizado = abrirContenidoCorreo(context_data);
      } catch {
        throw new UnrecoverableError('No se pudo recuperar la credencial protegida. Solicite una nueva.');
      }
      if (verificacion && !await codigoSigueVigente(verificacion.namespace, verificacion.entidad, String(contextoRenderizado.codigo))) {
        throw new UnrecoverableError('El código ya cambió. Utilice el último código solicitado.');
      }
      if (job.data.version_credencial !== undefined && id_registro) {
        const usuario = await prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: id_registro },
          select: { CORREO_INSTITUCION: true, UPDATE_AT: true, elminado: true },
        });
        if (!usuario || usuario.elminado || usuario.CORREO_INSTITUCION !== to ||
            (usuario.UPDATE_AT?.getTime() ?? 0) !== job.data.version_credencial) {
          throw new UnrecoverableError('La cuenta cambió. Verifique su correo y emita una credencial nueva.');
        }
      }
      if (template_type === 'crear_cotizacion' && job.data.id_cotizacion) {
        const cotizacion = await prisma.cotizaciones.findUnique({
          where: { ID_COTIZACION: job.data.id_cotizacion },
          select: { CODIGO_COTIZACION: true, ESTADO: true },
        });
        const link = URL.canParse(String(contextoRenderizado.linkAprobacion))
          ? new URL(String(contextoRenderizado.linkAprobacion)) : null;
        const token = link?.searchParams.get('token');
        if (cotizacion?.ESTADO !== 'ENVIADA' || cotizacion.CODIGO_COTIZACION !== contextoRenderizado.numeroCotizacion ||
            !token || verificarTokenAprobacion(token)?.cotizacionId !== job.data.id_cotizacion) {
          throw new UnrecoverableError('La cotización o su enlace de aprobación ya no están vigentes. Consulte su estado actual.');
        }
      }
      if (!(Array.isArray(to) ? to : [to]).every((correo) => correoValido.safeParse(correo?.trim()).success)) {
        throw new UnrecoverableError('La dirección de correo es inválida. Corríjala antes de volver a enviar.');
      }
      // Construir cuerpo y extraer archivos desde MinIO
      const htmlContent = renderHtml(template_type, contextoRenderizado);
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
      return { status: 'delivered', messageId: info.messageId };

    } catch (error) {
      const smtp = error as { responseCode?: number; message?: string };
      console.error(`[EmailWorker] Error en Job ${job.id}:`, smtp.message);
      if (smtp.responseCode && smtp.responseCode >= 500 && smtp.responseCode < 600) {
        throw new UnrecoverableError(smtp.message ?? 'El servidor SMTP rechazó permanentemente el envío.');
      }
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
  if (job?.data.id_envio_correo && !/^(correo|directo)-/.test(String(job.id)) && result?.status === 'delivered') {
    await prisma.correo_envios.updateMany({
      where: { ID_ENVIO_CORREO: job.data.id_envio_correo, ID_JOB: String(job.id), ESTADO: { in: ['EN_PROCESO', 'RESULTADO_INCIERTO'] } },
      data: { ESTADO: 'ENVIADO', ENVIADO_AT: new Date(), ULTIMO_ERROR: null },
    }).catch((error) => console.error('[EmailWorker] No se pudo marcar el correo como enviado:', error));
  }
});

emailWorker.on('failed', async (job, err) => {
  console.error(`[EmailWorker] Job fallido: ${job?.id} | Error: ${err.message}`);

  if (!job || /^(correo|directo)-/.test(String(job.id))) return;
  try {
    if (await job.getState() === 'failed') {
      await registrarFalloCorreo(prisma, job.data, String(job.id), err, job.attemptsMade);
    }
  } catch (error) {
    console.error('[EmailWorker] No se pudo registrar el fallo definitivo:', error);
  }
});

emailWorker.on('error', (err) => {
  console.error('[EmailWorker] Error del worker:', err);
});
