// services/certificate-generator.service.ts
// Servicio desacoplado de generación, superposición y compilación de certificados.
// Recibe archivos como buffers (Uint8Array) y una configuración DTO, y devuelve
// el PDF compilado como bytes. Delega la composición de capas en
// `pdf-stamper.service.ts`. No depende de Fastify, Prisma ni de S3/MinIO.
import { AppError } from '../lib/errors.js';
import { composeCertificate } from './pdf-stamper.service.js';

// ============================================================================
// DTOs / Contrato de entrada (re-exportados para compatibilidad de la capa superior)
// ============================================================================

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

export interface CertificateLayoutDTO {
  documentArea: AreaBoxDTO;
  watermarkAreas: WatermarkAreaDTO[];
  pageRange?: PageRangeDTO;
}

export interface GenerateCertificatePayloadDTO extends CertificateLayoutDTO {
  templatePdfKeyOrUrl: string;
  documentPdfKeyOrUrl: string;
}

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

export class CertificateGeneratorService {
  async generate(
    templateBuffer: Uint8Array | ArrayBuffer,
    documentBuffer: Uint8Array | ArrayBuffer,
    config: CertificateLayoutDTO
  ): Promise<GeneratedCertificate> {
    return composeCertificate({
      templateBytes: templateBuffer,
      documentBytes: documentBuffer,
      layout: {
        documentArea: config.documentArea,
        watermarkAreas: config.watermarkAreas ?? [],
        pageRange: config.pageRange,
      },
    }).catch((err) => {
      if (err instanceof AppError) throw err;
      throw new AppError(500, 'Error al compilar el certificado');
    });
  }
}

export const certificateGeneratorService = new CertificateGeneratorService();
