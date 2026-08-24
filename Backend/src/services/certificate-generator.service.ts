// services/certificate-generator.service.ts
// Servicio desacoplado de generación, superposición y compilación de certificados.
// Recibe archivos como buffers (Uint8Array) y una configuración DTO, y devuelve
// el PDF compilado como bytes. No depende de Fastify, Prisma ni de S3/MinIO:
// el enrutado/almacenamiento se resuelve en la capa superior.
import { PDFDocument, PDFEmbeddedPage, PDFPage, rgb } from 'pdf-lib';
import { AppError } from '../lib/errors.js';

// ============================================================================
// DTOs / Contrato de entrada
// ============================================================================

/** Caja expresada en porcentajes (0 - 100 %) con origen Top-Left (coordenadas DOM). */
export interface AreaBoxDTO {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Marca de agua / sello superpuesto con su opacidad (0.0 - 1.0). */
export interface WatermarkAreaDTO {
  id: string;
  box: AreaBoxDTO;
  opacity: number;
}

/** Rango de páginas (1-indexado, inclusivo) para procesamiento por bloques. */
export interface PageRangeDTO {
  start: number;
  end: number;
}

/** Configuración de layout (independiente de los archivos). */
export interface CertificateLayoutDTO {
  documentArea: AreaBoxDTO;
  watermarkAreas: WatermarkAreaDTO[];
  pageRange?: PageRangeDTO;
}

/** Payload completo del endpoint de generación. */
export interface GenerateCertificatePayloadDTO extends CertificateLayoutDTO {
  templatePdfKeyOrUrl: string;
  documentPdfKeyOrUrl: string;
}

/** Caja convertida a puntos del PDF (origen Bottom-Left). */
export interface PtBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeneratedPageInfo {
  pageIndex: number;
  templatePageIndex: number;
  documentPageIndex: number;
}

export interface GeneratedCertificate {
  bytes: Uint8Array;
  pageCount: number;
  pages: GeneratedPageInfo[];
}

// ============================================================================
// Conversión de coordenadas (DOM % Top-Left -> PDF pt Bottom-Left)
// ============================================================================
//
//   pdfX      = (domX_percent / 100) * pdfPageWidth
//   pdfWidth  = (domWidth_percent / 100) * pdfPageWidth
//   pdfHeight = (domHeight_percent / 100) * pdfPageHeight
//   pdfY      = pdfPageHeight - ((domY_percent / 100) * pdfPageHeight) - pdfHeight
//
function domToPdf(box: AreaBoxDTO, pageWidth: number, pageHeight: number): PtBox {
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

// ============================================================================
// Servicio
// ============================================================================

export class CertificateGeneratorService {
  /**
   * Compila un certificado combinando plantilla base + documento + marcas de agua.
   *
   * @param templateBuffer PDF de la plantilla base / marco (Uint8Array o ArrayBuffer).
   * @param documentBuffer PDF del documento certificado de entrada.
   * @param config Configuración de layout (documentArea, watermarkAreas, pageRange).
   */
  async generate(
    templateBuffer: Uint8Array | ArrayBuffer,
    documentBuffer: Uint8Array | ArrayBuffer,
    config: CertificateLayoutDTO
  ): Promise<GeneratedCertificate> {
    this.validateConfig(config);

    // Carga de documentos desde buffers binarios (nunca base64 -> evita OOM).
    const templateDoc = await PDFDocument.load(templateBuffer, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const documentDoc = await PDFDocument.load(documentBuffer, {
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

    const plan = this.buildPagePlan(templatePages, documentPages, config.pageRange);

    const outDoc = await PDFDocument.create();
    const pagesInfo: GeneratedPageInfo[] = [];

    for (let i = 0; i < plan.count; i++) {
      const documentPageIndex = plan.documentStart + i;
      // Replica la última página de plantilla si el documento tiene más páginas.
      const templatePageIndex = Math.min(documentPageIndex, templatePages - 1);

      const templatePage = templateDoc.getPage(templatePageIndex);
      const { width: pageWidth, height: pageHeight } = templatePage.getSize();

      const outPage = outDoc.addPage([pageWidth, pageHeight]);

      // CAPA 1 (Z-Index 10): plantilla base / marco sobre la totalidad del lienzo.
      const embeddedTemplate = await outDoc.embedPage(templatePage);
      outPage.drawPage(embeddedTemplate, { x: 0, y: 0, width: pageWidth, height: pageHeight });

      // CAPA 2 (Z-Index 20): marcas de agua / sellos con opacidad (1 - wm.opacity).
      // Blanco translúcido, igual al overlay del Tab PREVIEW del frontend.
      for (const wm of config.watermarkAreas) {
        const area = domToPdf(wm.box, pageWidth, pageHeight);
        const opacity = clamp(1 - clamp(wm.opacity, 0, 1), 0, 1);
        outPage.drawRectangle({
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          color: rgb(1, 1, 1),
          opacity,
        });
      }

      // CAPA 3 (Z-Index 30): documento certificado de entrada (foreground).
      const documentPage = documentDoc.getPage(documentPageIndex);
      const embeddedDocument = await outDoc.embedPage(documentPage);
      this.drawDocumentFit(outPage, embeddedDocument, pageWidth, pageHeight, config.documentArea);

      pagesInfo.push({ pageIndex: i, templatePageIndex, documentPageIndex });
    }

    const bytes = await outDoc.save();

    return { bytes, pageCount: plan.count, pages: pagesInfo };
  }

  /**
   * Dibuja la página del documento dentro del bounding box `documentArea`,
   * aplicando escalado proporcional para no distorsionar el contenido.
   */
  private drawDocumentFit(
    page: PDFPage,
    embeddedDocument: PDFEmbeddedPage,
    pageWidth: number,
    pageHeight: number,
    documentArea: AreaBoxDTO
  ): void {
    const area = domToPdf(documentArea, pageWidth, pageHeight);
    const { width: docW, height: docH } = embeddedDocument;

    // Escala proporcional (preserva relación de aspecto, sin distorsión).
    const scale = Math.min(area.width / docW, area.height / docH);
    const drawW = docW * scale;
    const drawH = docH * scale;

    // Centra el documento dentro del área reservada.
    const offsetX = area.x + (area.width - drawW) / 2;
    const offsetY = area.y + (area.height - drawH) / 2;

    page.drawPage(embeddedDocument, {
      x: offsetX,
      y: offsetY,
      width: drawW,
      height: drawH,
    });
  }

  /**
   * Resuelve qué páginas se compilan y qué página de plantilla acompaña a cada una.
   * El documento de entrada determina el número de páginas de salida; la plantilla
   * base se replica cuando es de una sola página y el certificado es multipágina.
   */
  private buildPagePlan(
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

  private validateConfig(config: CertificateLayoutDTO): void {
    if (!config?.documentArea) {
      throw new AppError(400, 'documentArea es obligatorio');
    }
    const area = config.documentArea;
    if (area.width <= 0 || area.height <= 0) {
      throw new AppError(400, 'documentArea debe tener width y height mayores a 0');
    }
    for (const wm of config.watermarkAreas ?? []) {
      if (!wm?.box || wm.box.width <= 0 || wm.box.height <= 0) {
        throw new AppError(400, `La marca de agua ${wm?.id ?? '(sin id)'} tiene un box inválido`);
      }
    }
  }
}

export const certificateGeneratorService = new CertificateGeneratorService();
