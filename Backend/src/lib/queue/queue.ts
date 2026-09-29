// lib/queue/queue.ts
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const SNAPSHOT_QUEUE = 'snapshot-queue';
export const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60; // 1 día de cache del snapshot

export const STAMP_PDF_QUEUE = 'stamp-pdf-queue';
export const TEMPLATE_CACHE_TTL_SECONDS = 24 * 60 * 60; // 1 día de cache de plantillas base
export const STAMP_JOB_PREFIX = 'stamp:job:';

export const CERTIFICATE_PDF_QUEUE = 'certificate-pdf-queue';

export const TARIFAS_QUEUE = 'tarifas-queue';

export const  GENERATION_EXCEL='generation-excel-queue';
const EMAIL_QUEUE_NAME = 'email_queue_jobs';

let emailQueue: Queue | null = null;
let connection: IORedis | null = null;
let snapshotQueue: Queue | null = null;
let stampPdfQueue: Queue | null = null;
let tarifasQueue: Queue | null = null;
let generationExcelQueue: Queue | null = null;
let certificatePdfQueue: Queue | null = null;
let importQueue: Queue | null = null;

/**
 * Conexión Redis compartida (singleton) para colas y worker.
 */
export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
    });
  }
  return connection;
}

/**
 * Cola de snapshots (singleton) para enqueue desde rutas.
 */
export function getSnapshotQueue(): Queue {
  if (!snapshotQueue) {
    snapshotQueue = new Queue(SNAPSHOT_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return snapshotQueue;
}

export interface SnapshotJobData {
  versionId: number;
  rutaUrl: string;
  fileName?: string;
}

export interface StampPdfJobData {
  selloId: number;
  tempInputKey: string;
  outputDocumentName: string;
}

export function getStampPdfQueue(): Queue {
  if (!stampPdfQueue) {
    stampPdfQueue = new Queue(STAMP_PDF_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return stampPdfQueue;
}

export interface CertificateComposeJobData {
  tipo: 'compose';
  templatePdfKeyOrUrl: string;
  documentPdfKeyOrUrl: string;
  documentArea: { x: number; y: number; width: number; height: number };
  watermarkAreas: Array<{
    id: string;
    box: { x: number; y: number; width: number; height: number };
    opacity: number;
  }>;
  pageRange?: { start: number; end: number };
  outputName?: string;
  usuarioId?: number;
  tipo_entry?: 'test' | 'prod';
}

export interface CertificateReviewJobData {
  tipo: 'certificado';
  certificadoId: number;
  selloId?: number;
  usuarioId?: number;
  tipo_entry?: 'test' | 'prod';
}

export type CertificatePdfJobData = CertificateComposeJobData | CertificateReviewJobData;

export function getCertificatePdfQueue(): Queue {
  if (!certificatePdfQueue) {
    certificatePdfQueue = new Queue(CERTIFICATE_PDF_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    });
  }
  return certificatePdfQueue;
}

export interface TarifasJobData {
  versionId: number;
  rutaUrl: string;
  fileName?: string;
  mapeoConfig: object;
}

export function getTarifasQueue(): Queue {
  if (!tarifasQueue) {
    tarifasQueue = new Queue(TARIFAS_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return tarifasQueue;
}

export interface GenerationExcelJobData {
  tipo:number;
  id_registro?: number;
  codigo_actual?: string;
  tipo_entry: 'test' | 'prod';
  id_job?: string;
  action?:string;
}


export function getGenerationExcelQueue(): Queue {
  if (!generationExcelQueue) {
    generationExcelQueue = new Queue(GENERATION_EXCEL, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 60 * 60 * 24 },
        removeOnFail: { age: 60 * 60 * 24 },
      },
    });
  }
  return generationExcelQueue;
}

export  interface payload_emails{
to:string,
subject:string,
html:string,
attachemnet:string[]
}

export type EmailTemplateType = 
  | 'crear_cotizacion' 
  | 'actualizar_cotizacion' 
  | 'enviar_orden_trabajo'
  | 'bienvenida_cliente'
  | 'aproved'
  | 'crear_ot'
  | 'envia_certifiados'; // Agrega los que necesites

// 2. Interfaz estricta para el trabajo de BullMQ
export interface EmailJobData {
  to: string | string[];           // Correo(s) de destino
  subject: string;                 // Asunto del correo
  template_type: EmailTemplateType;// Tipo de HTML a renderizar
  context_data: Record<string, any>; // Variables para inyectar en el HTML (ej: { nombre: "Juan", total: 1500 })
  minio_links?: string[];          // URLs prefirmadas de S3/MinIO (Opcional)
  id_registro?: number;            // Para trazabilidad en tu BD
  tipo_entry?: 'test' | 'prod';    // Útil si quieres omitir envíos reales en dev
}
export interface ImportarOTEPayload {
  s3KeyTemp: string;        // La ruta temporal del archivo subido por el cliente
  mappingConfig: any;       // El JSON con la configuración de celdas
  id_cotizacion?: number;   // Opcional: Define si es flujo normal o anormal
  idUsuario: number;
  id_job: string;           // ID de la tabla Quote para hacer polling
}

// 3. Singleton para la cola de correos
export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3, // Reintenta 3 veces si Nodemailer o Outlook fallan
        backoff: { 
          type: 'exponential', 
          delay: 2000 // Espera 2s, luego 4s, luego 8s...
        },
        removeOnComplete: { age: 60 * 60 * 24 }, // Limpia jobs exitosos en 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 }, // Guarda fallos por 7 días para auditoría
      },
    });
  }
  return emailQueue;
}
export const IMPORTAR_QUEUE="prefix_imOT"
export function getimportOT(): Queue {
  if (!importQueue) {
    importQueue = new Queue<ImportarOTEPayload>(IMPORTAR_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3, // Reintenta 3 veces si Nodemailer o Outlook fallan
        backoff: { 
          type: 'exponential', 
          delay: 2000 // Espera 2s, luego 4s, luego 8s...
        },
        removeOnComplete: { age: 60 * 60 * 24 }, // Limpia jobs exitosos en 24h
        removeOnFail: { age: 60 * 60 * 24 * 7 }, // Guarda fallos por 7 días para auditoría
      },
    });
  }
  return importQueue;
}

