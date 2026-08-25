// workers/pdfStampingWorker.ts
// Proceso separado que consume la cola de sellado de PDFs (BullMQ) sin bloquear la API.
import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { getObjectBuffer, uploadBuffer, deleteObject } from '../lib/minioClient.js';
import {
  STAMP_PDF_QUEUE,
  TEMPLATE_CACHE_TTL_SECONDS,
  getRedisConnection,
  StampPdfJobData,
} from '../lib/queue/queue.js';
import { composeCertificate } from '../services/pdf-stamper.service.js';

const TEMPLATE_CACHE_PREFIX = 'sello:template:';

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WatermarkArea {
  id: string;
  label: string;
  box: BoundingBox;
  opacity: number;
}

const prisma = new PrismaClient();

async function getTemplateBuffer(selloId: number, templateKey: string): Promise<Buffer> {
  const redis = getRedisConnection();
  const cacheKey = `${TEMPLATE_CACHE_PREFIX}${selloId}`;
  const cached = await redis.getBuffer(cacheKey);
  if (cached) return cached;

  const buffer = await getObjectBuffer(templateKey);
  await redis.set(cacheKey, buffer, 'EX', TEMPLATE_CACHE_TTL_SECONDS);
  return buffer;
}

async function processStampJob(jobData: StampPdfJobData): Promise<{ outputKey: string; status: string }> {
  const { selloId, tempInputKey, outputDocumentName } = jobData;

  const sello = await prisma.plantillas_sellos.findUnique({
    where: { ID_PLANTILLA_SELLO: selloId },
  });
  if (!sello) throw new Error(`Sello ${selloId} no encontrado`);
  if (!sello.TEMPLATE_PDF_KEY) {
    throw new Error(`El sello ${selloId} no tiene plantilla base (TEMPLATE_PDF_KEY)`);
  }

  const docArea = sello.DOCUMENT_AREA as unknown as BoundingBox | null;
  const watermarkAreas = ((sello.WATERMARK_AREAS ?? []) as unknown as WatermarkArea[]).filter(
    (wm) => wm && wm.box && wm.box.width > 0 && wm.box.height > 0
  );

  const selloTabla = await prisma.sellos.findUnique({
    where: { ID_SELLO: selloId },
    include: { documentos: true },
  });

  const sealImages: Record<string, { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' }> = {};
  if (selloTabla?.documentos) {
    const mime = selloTabla.documentos.MIME_TYPE;
    if (mime === 'image/png' || mime === 'image/jpeg') {
      const bytes = await getObjectBuffer(selloTabla.documentos.RUTA_URL);
      for (const wm of watermarkAreas) {
        sealImages[wm.id] = { bytes, mimeType: mime };
      }
    }
  }

  const [templateBuffer, inputBuffer] = await Promise.all([
    getTemplateBuffer(selloId, sello.TEMPLATE_PDF_KEY),
    getObjectBuffer(tempInputKey),
  ]);

  const result = await composeCertificate({
    templateBytes: templateBuffer,
    documentBytes: inputBuffer,
    layout: {
      documentArea: docArea ?? { x: 0, y: 0, width: 100, height: 100 },
      watermarkAreas,
      sealImages: Object.keys(sealImages).length > 0 ? sealImages : undefined,
    },
  });

  const outputBytes = Buffer.from(result.bytes);
  const outputKey = `stamped-documents/${outputDocumentName}`;
  await uploadBuffer(outputKey, outputBytes, 'application/pdf', {
    originalName: outputDocumentName,
  });

  try {
    await deleteObject(tempInputKey);
  } catch {
    // no-op
  }

  return { outputKey, status: 'completed' };
}

const worker = new Worker<StampPdfJobData>(
  STAMP_PDF_QUEUE,
  async (job) => processStampJob(job.data),
  {
    connection: getRedisConnection(),
    concurrency: 1,
  }
);

worker.on('completed', (job) => {
  console.log(`[stamp-worker] Job ${job.id} completado: ${(job.returnvalue as any)?.outputKey}`);
});

worker.on('failed', (job, err) => {
  console.error(`[stamp-worker] Job ${job?.id} falló: ${err.message}`, err);
});

worker.on('error', (err) => {
  console.error('[stamp-worker] Error del worker:', err);
});

console.log('[stamp-worker] Worker de sellado de PDFs iniciado.');
