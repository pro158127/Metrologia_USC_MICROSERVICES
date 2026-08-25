// ============================================================
// sellos.ts
// Tipos del catálogo de Sellos y Plantillas (DTOs UI).
// ============================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WatermarkArea {
  id: string;
  label: string;
  box: BoundingBox;
  opacity: number;
}

// Contrato del backend (GET /api/v1/sellos y GET /api/v1/sellos/:id)
export interface PlantillaSelloDTO {
  id: number;
  nombre: string;
  descripcion: string | null;
  templatePdfKey: string | null;
  templatePdfUrl: string | null;
  templatePdfWidth: number | null;
  templatePdfHeight: number | null;
  documentArea: BoundingBox | null;
  watermarkAreas: WatermarkArea[];
  createdAt: string;
  updatedAt: string;
}

// Configuración activa en la UI del dashboard / modal
export interface SealConfig {
  id: number;
  nombre: string;
  descripcion?: string;
  templatePdfKey: string | null;
  templatePdfUrl: string | null;
  templatePdfWidth?: number | null;
  templatePdfHeight?: number | null;
  documentArea: BoundingBox | null;
  watermarkAreas: WatermarkArea[];
  updatedAt?: string;
}

export interface SelloConfigModalProps {
  sealData: SealConfig;
  onClose: () => void;
  onSave: (config: SealConfig, templateFile?: File | null) => void;
}
