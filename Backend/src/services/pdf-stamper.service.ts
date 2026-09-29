// services/pdf-stamper.service.ts
import { PDFDocument, rgb } from 'pdf-lib';
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

export interface ComposeLayoutDTO {
  documentArea: AreaBoxDTO;
  watermarkAreas: WatermarkAreaDTO[];
  documentOpacity?: number;
  pageRange?: { start: number; end: number };
  sealImages?: Record<string, { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' }>;
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
  documentBytes?: Uint8Array | ArrayBuffer;
  layout: ComposeLayoutDTO;
}

// Conversión del viewport HTML (0,0 Arriba-Izquierda) a PDF (0,0 Abajo-Izquierda)
function domToPdf(box: AreaBoxDTO, pageWidth: number, pageHeight: number) {
  const wPercent = Math.min(Math.max(box.width ?? 100, 1), 100);
  const hPercent = Math.min(Math.max(box.height ?? 100, 1), 100);

  const width = (wPercent / 100) * pageWidth;
  const height = (hPercent / 100) * pageHeight;
  const x = ((box.x ?? 0) / 100) * pageWidth;
  const y = pageHeight - (((box.y ?? 0) / 100) * pageHeight) - height;

  return { x, y, width, height };
}

function isImageBuffer(bytes: Uint8Array): 'png' | 'jpeg' | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function loadTemplateAsPdf(templateBytes: Uint8Array | ArrayBuffer): Promise<PDFDocument> {
  const bytes = templateBytes instanceof Uint8Array ? templateBytes : new Uint8Array(templateBytes);
  const imageType = isImageBuffer(bytes);

  if (imageType) {
    const pdfDoc = await PDFDocument.create();
    const image = imageType === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
    const page = pdfDoc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    return pdfDoc;
  }

  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  } catch (err: any) {
    throw new AppError(400, `Plantilla base inválida: ${err.message}`);
  }
}

export async function composeCertificate(params: ComposeParams): Promise<ComposeResult> {
  const { templateBytes, documentBytes, layout } = params;

  if (!documentBytes) {
    throw new AppError(400, 'Falta el documento de prueba (certificado) para estampar.');
  }

  // 1. CARGA DIRECTA (Fondo intacto)
  const outDoc = await loadTemplateAsPdf(templateBytes);
  
  const documentDoc = await PDFDocument.load(documentBytes, { ignoreEncryption: true });
  const documentPages = documentDoc.getPageCount();

  // CLONACIÓN SEGURA de páginas faltantes
  while (outDoc.getPageCount() < documentPages) {
    const freshTemplateDoc = await loadTemplateAsPdf(templateBytes);
    const lastPageIndex = freshTemplateDoc.getPageCount() - 1;
    const [copiedPage] = await outDoc.copyPages(freshTemplateDoc, [lastPageIndex]);
    outDoc.addPage(copiedPage);
  }

  const totalPages = outDoc.getPageCount();
  const pagesInfo: GeneratedPageInfo[] = [];

  for (let i = 0; i < totalPages; i++) {
    const outPage = outDoc.getPage(i);
    const { width: pageWidth, height: pageHeight } = outPage.getSize();

    // 2. CAPA INTERMEDIA: RENDERIZADO DE ZONAS OPACADAS (Se dibuja ANTES del documento)
    const areasToDraw: WatermarkAreaDTO[] = layout.watermarkAreas || [];

    for (const wm of areasToDraw) {
      const area = domToPdf(wm.box, pageWidth, pageHeight);
      const opacity = clamp(wm.opacity ?? 0.8, 0, 1);

      // Velo blanco de opacidad puro (borramos el recuadro azul de testing)
      const veilOpacity = 1 - opacity;
      if (veilOpacity > 0.01) {
        outPage.drawRectangle({
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          color: rgb(1, 1, 1),
          opacity: veilOpacity,
        });
      }
    }

    // 3. CAPA SUPERIOR: RENDERIZADO DEL CERTIFICADO (El texto va arriba de todo)
    if (layout.documentArea && i < documentPages) {
      const documentPage = documentDoc.getPage(i);
      const embeddedDocument = await outDoc.embedPage(documentPage);

      const docBox = domToPdf(layout.documentArea, pageWidth, pageHeight);

      // Escala proporcional y anclado al borde SUPERIOR
      const scale = Math.min(docBox.width / embeddedDocument.width, docBox.height / embeddedDocument.height);
      const drawW = embeddedDocument.width * scale;
      const drawH = embeddedDocument.height * scale;
      
      const offsetX = docBox.x + (docBox.width - drawW) / 2;
      const offsetY = docBox.y + docBox.height - drawH; 

      outPage.drawPage(embeddedDocument, {
        x: offsetX,
        y: offsetY,
        width: drawW,
        height: drawH,
        opacity: clamp(layout.documentOpacity ?? 0.88, 0.1, 1),
      });
    }

    pagesInfo.push({ 
      pageIndex: i, 
      templatePageIndex: Math.min(i, totalPages - 1), 
      documentPageIndex: Math.min(i, documentPages - 1) 
    });
  }

  const bytes = await outDoc.save();
  return { bytes, pageCount: totalPages, pages: pagesInfo };
}

export const pdfStamperService = { composeCertificate };