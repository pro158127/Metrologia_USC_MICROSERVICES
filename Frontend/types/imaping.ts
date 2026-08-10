// types/mapping.ts
export interface CellMappingg {
  variableId: string;
  sheetName: string;
  row: number;
  col: number;
  cellAddress: string;
  type: 'SINGLE_FIELD' | 'TABLE_FIELD';
  // Para TABLE_FIELD
  startRow?: number;
  startCol?: number;
  endRow?: number;
  endCol?: number;
  mappedRange?: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  };
  columnMappings?: Record<string, {
    colLetter: string;
    relativeCol: number;
  }>;
}

export interface SystemVariable {
  id: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  color: string;
  type?: 'SINGLE_FIELD' | 'TABLE_FIELD';
  columns?: Array<{
    label: string;
    key?: string;
    dataType?: string;
    type?: 'COMPOSITE_COLUMN';
    subCols?: Array<{
      key: string;
      label: string;
      relativeCol?: number | null;
      colLetter?: string | null;
    }>;
  }>;
}