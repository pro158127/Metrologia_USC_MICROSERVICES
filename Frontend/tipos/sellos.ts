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

export interface SealConfig {
  id: string;
  nombre: string;
  descripcion?: string;
  templatePdfUrl: string | null;
  documentArea: BoundingBox | null;
  watermarkAreas: WatermarkArea[];
  updatedAt?: string;
}

export interface SelloConfigModalProps {
  sealData: SealConfig;
  onClose: () => void;
  onSave: (config: SealConfig) => void;
}
