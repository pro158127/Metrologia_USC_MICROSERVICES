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

// ============================================================
// INPUT SCHEMA (contrato de variables)
// ============================================================

export type SchemaDataType = 'STRING' | 'DATE' | 'BOOLEAN' | 'FLOAT' | 'INTEGER' | 'OBJECT';
export type TemplateType = 'ORDEN_TRABAJO' | 'COTIZACION' | 'RECEPCION';

export interface InputSchemaField {
  key: string;
  label: string;
  dataType: SchemaDataType;
  required?: boolean;
  description?: string;
}

export interface InputSchemaObjectField extends InputSchemaField {
  type: 'OBJECT';
  fields: InputSchemaField[];
}

export interface InputSchemaTableColumn {
  key: string;
  label: string;
  dataType?: SchemaDataType;
  required?: boolean;
  type?: 'OBJECT';
  fields?: InputSchemaField[];
}

export interface InputSchemaTable {
  key: string;
  label: string;
  required?: boolean;
  maxRowsLimit?: number;
  dependsOn?: { fieldKey: string; value: boolean };
  description?: string;
  columns: InputSchemaTableColumn[];
}

export interface InputSchema {
  $schema?: string;
  templateType: TemplateType;
  version: string;
  description?: string;
  fields: {
    scalars: InputSchemaField[];
    tables: InputSchemaTable[];
  };
}

// ============================================================
// MAPPING CONFIG (estructura de salida - Fase 3)
// ============================================================

export interface ScalarMapping {
  key: string;
  cell: string;
  dataType: string;
  sheet?: string;
}

export interface SubfieldMapping {
  key: string;
  column: string;
}

export interface ColumnMapping {
  key: string;
  column: string;
  dataType?: string;
  type?: 'OBJECT';
  subfields?: SubfieldMapping[];
}

export interface TableMapping {
  key: string;
  startRow: number;
  columns: ColumnMapping[];
}

export interface MappingConfig {
  templateId: string | number;
  templateType: TemplateType | string;
  version: string;
  fileRef: string;
  mappings: {
    scalars: ScalarMapping[];
    tables: TableMapping[];
  };
}

// ============================================================
// UNIVER SHEET (selección + resaltado)
// ============================================================

export interface CellSelection {
  sheetName: string;
  cellAddress: string;
  row: number;
  col: number;
  endRow: number;
  endColumn: number;
}

export interface HighlightRange {
  sheetName: string;
  /** Notación A1 (ej: 'C4', 'B12'). */
  a1: string;
  color: string;
  /** Verdadero si representa una columna de tabla (destaca la celda cabecera). */
  isColumn?: boolean;
}

export interface UniverSheetHandle {
  /** Resalta celdas/columnas en el canvas. */
  highlightRanges: (ranges: HighlightRange[]) => void;
  /** Limpia todos los resaltados aplicados en la sesión. */
  clearHighlights: () => void;
}

export interface UniverSheetProps {
  snapshot?: unknown;
  onCellSelect?: (selection: CellSelection) => void;
  /** Se invoca cuando el workbook quedó renderizado y listo para operar. */
  onReady?: () => void;
}

// ============================================================
// LEGACY: Mapeo de variables (formato MAPEO_EXCEL_JSON)
// ============================================================

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

// ============================================================
// DTOs de Plantillas / Versiones
// ============================================================

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
  inputSchema: InputSchema | null;
  mappingConfig: MappingConfig | null;
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

// ============================================================
// PROPS DE MODALES
// ============================================================

export interface EditorModalProps {
  template: PlantillaWithVersionResponse;
  onClose: () => void;
  onReload: () => void;
}

export interface HistorialModalProps {
  template: TemplateHistoryLog;
  onClose: () => void;
}

// ============================================================
// RESPUESTAS DE SNAPSHOT (backend)
// ============================================================

export interface SnapshotJobStatus {
  status: 'completed' | 'pending' | 'failed' | 'active' | 'delayed' | 'waiting' | 'unknown';
  jobId?: string;
  snapshot?: unknown;
  error?: string;
}

export interface SnapshotResponse {
  success: boolean;
  data?: SnapshotJobStatus;
  error?: string;
}
