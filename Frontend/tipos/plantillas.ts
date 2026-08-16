// ============================================================
// plantillas.ts
// Tipos del dominio de Plantillas de Excel y Mapeo de Variables.
// ============================================================

import type { createUniver } from '@univerjs/presets';

/** API de Univer para la hoja (ref del visor Excel). */
export type UniverAPI = ReturnType<typeof createUniver>['univerAPI'];
/** Workbook de Univer (ref del libro activo). */
export type UniverWorkbook = ReturnType<UniverAPI['createWorkbook']>;

export type DataType = 'text' | 'number' | 'currency' | 'date' | 'option';

export interface CellMapping {
  variableId: string;
  sheetName: string;
  row: number;
  col: number;
  cellAddress: string;
  type?: 'SINGLE_FIELD' | 'TABLE_FIELD';
  mappedRange?: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  };
}

export interface MapeoExcelField {
  id: string;
  name: string;
  color?: string;
}

export interface MapeoExcelColumn {
  label: string;
  key?: string;
  dataType?: string;
}

export interface MapeoExcelTable {
  id: string;
  name: string;
  color?: string;
  columns?: MapeoExcelColumn[];
}

export interface MapeoExcelCategory {
  id: string;
  name: string;
  subtitle?: string;
  fields?: MapeoExcelField[];
  tables?: MapeoExcelTable[];
}

export interface MapeoExcel {
  categories?: MapeoExcelCategory[];
  savedMappings?: Record<string, CellMapping>;
  [key: string]: unknown;
}

export interface PlantillaDocumento {
  idDocumento: number;
  nombre: string;
  rutaUrl: string;
  proveedor: string;
  mimeType: string;
}

export interface VersionActualPlantilla {
  idVersionPlantilla: number;
  version: number;
  mapeoExcelJson: MapeoExcel | null;
  createdAt: Date;
  documento: PlantillaDocumento | null;
}

export interface PlantillaWithVersionResponse {
  success: boolean;
  data?: {
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versionActual: VersionActualPlantilla | null;
  };
  error?: string;
}

export interface TemplateHistoryVersion {
  idVersionPlantilla: number;
  version: number;
  mapeoExcelJson: MapeoExcel | null;
  createdAt: string;
  createby: string;
}

export interface TemplateHistoryLog {
  name: string;
  id_plantilla: number;
  version: TemplateHistoryVersion[] | null;
}

export interface SystemVariable {
  id: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  color: string;
  type?: 'SINGLE_FIELD' | 'TABLE_FIELD';
  columns?: MapeoExcelColumn[];
}

export interface UniverSheetProps {
  fileUrl?: string;
}

export interface EditorModalProps {
  template: PlantillaWithVersionResponse;
  onClose: () => void;
  onSaveMapping?: (mappings: Record<string, CellMapping>) => Promise<void>;
}

export interface HistorialModalProps {
  template: TemplateHistoryLog;
  onClose: () => void;
}
