// workers/pdfStampingWorker.ts
// Proceso separado que consume la cola de sellado de PDFs (BullMQ) sin bloquear la API.
import 'dotenv/config';
import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { uploadBuffer, getObjectBuffer, deleteObject } from '../lib/minioClient.js';
import {
  STAMP_PDF_QUEUE,
  TEMPLATE_CACHE_TTL_SECONDS,
  getRedisConnection,
  StampPdfJobData,
} from '../lib/queue/queue.js';

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

/**
 * Convierte un bounding box expresado en % (origen top-left, coordenadas CSS)
 * a coordenadas absolutas del PDF en puntos (origen bottom-left).
 */
function pctToPt(box: BoundingBox, pageWidth: number, pageHeight: number) {
  return {
    x: (box.x / 100) * pageWidth,
    y: (1 - (box.y + box.height) / 100) * pageHeight,
    width: (box.width / 100) * pageWidth,
    height: (box.height / 100) * pageHeight,
  };
}

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

  // a) Recupera la configuración del Sello vía Prisma.
  const sello = await prisma.plantillas_sellos.findUnique({
    where: { ID_PLANTILLA_SELLO: selloId },
  });
  if (!sello) throw new Error(`Sello ${selloId} no encontrado`);
  if (!sello.TEMPLATE_PDF_KEY) {
    throw new Error(`El sello ${selloId} no tiene plantilla base (TEMPLATE_PDF_KEY)`);
  }

  // b) Obtiene el PDF plantilla base (con caché en Redis) y el PDF cliente desde MinIO.
  const [templateBuffer, inputBuffer] = await Promise.all([
    getTemplateBuffer(selloId, sello.TEMPLATE_PDF_KEY),
    getObjectBuffer(tempInputKey),
  ]);

  const templateDoc = await PDFDocument.load(templateBuffer, { ignoreEncryption: true });
  const inputDoc = await PDFDocument.load(inputBuffer, { ignoreEncryption: true });

  const docArea = sello.DOCUMENT_AREA as unknown as BoundingBox | null;
  const watermarkAreas = ((sello.WATERMARK_AREAS ?? []) as unknown as WatermarkArea[]).filter(
    (wm) => wm && wm.box && wm.box.width > 0 && wm.box.height > 0
  );

  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);

  // Usa la página 0 de la plantilla como layout base para todas las páginas del documento.
  const templatePage = templateDoc.getPage(0);
  const { width: tplW, height: tplH } = templatePage.getSize();
  const embeddedTemplate = await outDoc.embedPage(templatePage);

  for (let i = 0; i < inputDoc.getPageCount(); i++) {
    const page = outDoc.addPage([tplW, tplH]);
    page.drawPage(embeddedTemplate);

    // d) Incrusta la página del documento dentro de la región documentArea.
    if (docArea && docArea.width > 0 && docArea.height > 0) {
      const inputPage = inputDoc.getPage(i);
      const { width: inW, height: inH } = inputPage.getSize();
      const embeddedInput = await outDoc.embedPage(inputPage);

      const area = pctToPt(docArea, tplW, tplH);
      const scale = Math.min(area.width / inW, area.height / inH);
      const drawW = inW * scale;
      const drawH = inH * scale;
      const offsetX = area.x + (area.width - drawW) / 2;
      const offsetY = area.y + (area.height - drawH) / 2;

      page.drawPage(embeddedInput, {
        x: offsetX,
        y: offsetY,
        width: drawW,
        height: drawH,
      });
    }

    // e) Aplica las marcas de agua/sellos con sus opacidades.
    for (const wm of watermarkAreas) {
      const area = pctToPt(wm.box, tplW, tplH);
      const opacity = Math.max(0, Math.min(1, wm.opacity ?? 0.8));
      page.drawRectangle({
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        color: rgb(0.55, 0.55, 0.55),
        opacity: 0.15 * opacity,
        borderColor: rgb(0.4, 0.4, 0.4),
        borderWidth: 1,
        borderOpacity: opacity,
      });
      if (wm.label) {
        page.drawText(wm.label, {
          x: area.x + 3,
          y: area.y + area.height - 10,
          size: 8,
          font,
          color: rgb(0.35, 0.35, 0.35),
          opacity,
        });
      }
    }
  }

  // f) Guarda el PDF final compuesto en MinIO.
  const outputBytes = await outDoc.save();
  const outputKey = `stamped-documents/${outputDocumentName}`;
  await uploadBuffer(outputKey, Buffer.from(outputBytes), 'application/pdf', {
    originalName: outputDocumentName,
  });

  // Limpieza best-effort del input temporal.
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
