// services/pdf-stamper.service.ts
// Compositor de PDF en 3 capas: plantilla (base) → sellos/marca de agua (inferior)
// → documento (medio, con opacidad dinámica). El sello se dibuja DEBAJO del
// documento para que el fondo transparente del mismo lo revele sin máscaras
// blancas destructivas. Recibe buffers binarios; no depende de Fastify/Prisma/S3.
import { BlendMode, PDFDocument, PDFEmbeddedPage, PDFImage, PDFPage, rgb } from 'pdf-lib';
import { AppError } from '../lib/errors.js';

export interface AreaBoxDTO {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WatermarkAreaDTO {
  id: string;
  box: AreaBoxDTO;
  opacity: number;
}

export interface PageRangeDTO {
  start: number;
  end: number;
}

export interface SealImageDTO {
  bytes: Uint8Array;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface ComposeLayoutDTO {
  documentArea: AreaBoxDTO;
  watermarkAreas: WatermarkAreaDTO[];
  sealImages?: Record<string, SealImageDTO>;
  pageRange?: PageRangeDTO;
  documentOpacity?: number;
}

export interface GeneratedPageInfo {
  pageIndex: number;
  templatePageIndex: number;
  documentPageIndex: number;
}

export interface ComposeResult {
  bytes: Uint8Array;
  pageCount: number;
  pages: GeneratedPageInfo[];
}

export interface ComposeParams {
  templateBytes: Uint8Array | ArrayBuffer;
  documentBytes: Uint8Array | ArrayBuffer;
  layout: ComposeLayoutDTO;
}

function domToPdf(box: AreaBoxDTO, pageWidth: number, pageHeight: number) {
  const width = (box.width / 100) * pageWidth;
  const height = (box.height / 100) * pageHeight;
  return {
    x: (box.x / 100) * pageWidth,
    y: pageHeight - (box.y / 100) * pageHeight - height,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildPagePlan(
  templatePages: number,
  documentPages: number,
  pageRange?: PageRangeDTO
): { count: number; documentStart: number } {
  let documentStart = 0;
  let documentEnd = documentPages - 1;

  if (pageRange) {
    const { start, end } = pageRange;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new AppError(400, 'pageRange inválido: debe cumplir 1 <= start <= end');
    }
    documentStart = clamp(start - 1, 0, documentPages - 1);
    documentEnd = clamp(end - 1, documentStart, documentPages - 1);
  }

  return { count: documentEnd - documentStart + 1, documentStart };
}

function validateLayout(layout: ComposeLayoutDTO): void {
  if (!layout?.documentArea) {
    throw new AppError(400, 'documentArea es obligatorio');
  }
  const area = layout.documentArea;
  if (area.width <= 0 || area.height <= 0) {
    throw new AppError(400, 'documentArea debe tener width y height mayores a 0');
  }
  for (const wm of layout.watermarkAreas ?? []) {
    if (!wm?.box || wm.box.width <= 0 || wm.box.height <= 0) {
      throw new AppError(400, `La marca de agua ${wm?.id ?? '(sin id)'} tiene un box inválido`);
    }
  }
}

function drawDocumentFit(
  page: PDFPage,
  embeddedDocument: PDFEmbeddedPage,
  pageWidth: number,
  pageHeight: number,
  documentArea: AreaBoxDTO,
  opacity: number
): void {
  const area = domToPdf(documentArea, pageWidth, pageHeight);
  const { width: docW, height: docH } = embeddedDocument;

  const scale = Math.min(area.width / docW, area.height / docH);
  const drawW = docW * scale;
  const drawH = docH * scale;

  const offsetX = area.x + (area.width - drawW) / 2;
  const offsetY = area.y + (area.height - drawH) / 2;

  page.drawPage(embeddedDocument, {
    x: offsetX,
    y: offsetY,
    width: drawW,
    height: drawH,
    opacity,
  });
}

export async function composeCertificate(params: ComposeParams): Promise<ComposeResult> {
  const { templateBytes, documentBytes, layout } = params;
  validateLayout(layout);

  const templateDoc = await PDFDocument.load(templateBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const documentDoc = await PDFDocument.load(documentBytes, {
    ignoreEncryption: true,
    updateMetadata: false,
  });

  const templatePages = templateDoc.getPageCount();
  const documentPages = documentDoc.getPageCount();

  if (templatePages === 0) {
    throw new AppError(400, 'La plantilla base no contiene páginas');
  }
  if (documentPages === 0) {
    throw new AppError(400, 'El documento certificado no contiene páginas');
  }

  const plan = buildPagePlan(templatePages, documentPages, layout.pageRange);
  const documentOpacity = clamp(layout.documentOpacity ?? 1, 0, 1);

  const outDoc = await PDFDocument.create();
  const pagesInfo: GeneratedPageInfo[] = [];
  const embeddedImages = new Map<'image/png' | 'image/jpeg', PDFImage>();

  for (let i = 0; i < plan.count; i++) {
    const documentPageIndex = plan.documentStart + i;
    const templatePageIndex = Math.min(documentPageIndex, templatePages - 1);

    const templatePage = templateDoc.getPage(templatePageIndex);
    const { width: pageWidth, height: pageHeight } = templatePage.getSize();
    const outPage = outDoc.addPage([pageWidth, pageHeight]);

    const embeddedTemplate = await outDoc.embedPage(templatePage);
    outPage.drawPage(embeddedTemplate, { x: 0, y: 0, width: pageWidth, height: pageHeight });

    for (const wm of layout.watermarkAreas ?? []) {
      const area = domToPdf(wm.box, pageWidth, pageHeight);
      const opacity = clamp(wm.opacity, 0, 1);
      const seal = layout.sealImages?.[wm.id];

      if (seal && (seal.mimeType === 'image/png' || seal.mimeType === 'image/jpeg')) {
        let image = embeddedImages.get(seal.mimeType);
        if (!image) {
          image =
            seal.mimeType === 'image/png'
              ? await outDoc.embedPng(seal.bytes)
              : await outDoc.embedJpg(seal.bytes);
          embeddedImages.set(seal.mimeType, image);
        }
        outPage.drawImage(image, {
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          opacity,
          blendMode: BlendMode.Multiply,
        });
      } else {
        outPage.drawRectangle({
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
      }
    }

    const documentPage = documentDoc.getPage(documentPageIndex);
    const embeddedDocument = await outDoc.embedPage(documentPage);
    drawDocumentFit(
      outPage,
      embeddedDocument,
      pageWidth,
      pageHeight,
      layout.documentArea,
      documentOpacity
    );

    pagesInfo.push({ pageIndex: i, templatePageIndex, documentPageIndex });
  }

  const bytes = await outDoc.save();
  return { bytes, pageCount: plan.count, pages: pagesInfo };
}

export const pdfStamperService = { composeCertificate };
