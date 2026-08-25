import ExcelJS from 'exceljs';
import { parseCell } from './parseCell.js';
import { parseMerges } from './parseMerges.js';
import { getActualDimensions } from './parseDimensions.js';
import { getOrCreateStyleId } from './styleRegistry.js';

export function parseSheet(
  worksheet: ExcelJS.Worksheet,
  styleRegistry: any,
  sheetIndex: number
) {
  const cellData: Record<number, Record<number, any>> = {};
  const mergeData = parseMerges(worksheet);

  // 1. DETECCIÓN MEJORADA DE COLUMNAS OCULTAS (Soporte LibreOffice)
  const hiddenColumns = new Set<number>();
  if (worksheet.columns) {
    worksheet.columns.forEach((col, index) => {
      const w = col.width || 0;
      // Si está explícitamente oculta o su ancho es casi cero (Truco LibreOffice)
      if (col.hidden || (w >= 0 && w < 1)) {
        hiddenColumns.add(index + 1); // exceljs usa 1-based index aquí
      }
    });
  }

  const mergedCells = new Set<string>();
  mergeData.forEach((merge: { startRow: number; endRow: number; startColumn: number; endColumn: number }) => {
    for (let row = merge.startRow; row <= merge.endRow; row++) {
      for (let col = merge.startColumn; col <= merge.endColumn; col++) {
        if (row === merge.startRow && col === merge.startColumn) continue;
        mergedCells.add(`${row},${col}`);
      }
    }
  });

  worksheet.eachRow((row, rowIndex) => {
    // 2. DETECCIÓN MEJORADA DE FILAS OCULTAS
    const h = row.height;
    const isRowHidden = row.hidden || (h !== undefined && h < 1);

    row.eachCell((cell, colIndex) => {
      const rowIdx = rowIndex - 1;
      const colIdx = colIndex - 1;
      const cellKey = `${rowIdx},${colIdx}`;
      const isMerged = mergedCells.has(cellKey);
      
      const isColHidden = hiddenColumns.has(colIndex);

      // 3. LA MAGIA: Vaciar la celda en memoria si pertenece a una zona oculta
      let value = cell.value;
      if (isRowHidden || isColHidden) {
        value = null; 
      }

      const hasValue = value !== null && value !== undefined && value !== '';
      const hasStyle = cell.style && Object.keys(cell.style).length > 0;

      if (isMerged) {
        if (hasStyle) {
          const styleId = getOrCreateStyleId(cell.style, styleRegistry);
          if (!cellData[rowIdx]) cellData[rowIdx] = {};
          cellData[rowIdx][colIdx] = { s: styleId };
        }
        return;
      }

      if (!hasValue && !hasStyle) {
        return;
      }

      let styleId: string | null = null;
      if (hasStyle) {
        styleId = getOrCreateStyleId(cell.style, styleRegistry);
      }

      // Inyectamos la celda purificada (sin texto ni fórmulas basura)
      const cellToParse = (isRowHidden || isColHidden) ? { ...cell, value: null, formula: null } : cell;
      const cellDataItem = parseCell(cellToParse as any, styleId);

      if (!cellData[rowIdx]) {
        cellData[rowIdx] = {};
      }
      cellData[rowIdx][colIdx] = cellDataItem;
    });
  });

  const { rowCount, columnCount } = getActualDimensions(cellData);
  const columnData = getColumnConfigs(worksheet, hiddenColumns); // Pasamos el filtro
  const rowData = getRowConfigs(worksheet);

  const sheetId = `sheet-${sheetIndex + 1}`;

  return {
    id: sheetId,
    name: worksheet.name || `Hoja${sheetIndex + 1}`,
    rowCount: Math.max(rowCount, 1),
    columnCount: Math.max(columnCount, 1),
    cellData: cellData || {},
    mergeData: mergeData && mergeData.length > 0 ? mergeData : undefined,
    columnData: columnData,
    rowData: rowData,
    showGridlines: true,
  };
}

// 4. APLICAMOS EL ESTADO OCULTO EN LAS CONFIGURACIONES
function getColumnConfigs(worksheet: ExcelJS.Worksheet, hiddenColumns: Set<number>) {
  const columnData: any = {};
  const defaultWidths: Record<number, number> = {
    0: 40, 1: 80, 2: 120, 3: 80, 4: 60, 5: 60, 6: 80, 7: 80, 8: 120,
    13: 60, 14: 80, 15: 100, 19: 60, 20: 80, 21: 80, 22: 100, 23: 80, 29: 120,
  };

  if (worksheet.columns) {
    worksheet.columns.forEach((col, index) => {
      const excelWidth = col.width || 0;
      let widthVal = defaultWidths[index] || 60;
      
      if (excelWidth >= 1) {
        widthVal = Math.floor(excelWidth * 7) + 5;
      }

      const colConfig: any = { w: widthVal };
      
      // Si nuestro escáner determinó que está oculta, le pasamos hd: 1 a Univer
      if (hiddenColumns.has(index + 1)) {
        colConfig.hd = 1;
      }
      
      columnData[index] = colConfig;
    });
  }
  return Object.keys(columnData).length > 0 ? columnData : undefined;
}

function getRowConfigs(worksheet: ExcelJS.Worksheet) {
  const rowData: any = {};
  const MIN_HEIGHT = 18;
  const MAX_HEIGHT = 200;

  worksheet.eachRow((row, index) => {
    const rowIdx = index - 1;
    let hasContent = false;
    let maxLines = 1;
    let maxTextLength = 0;

    row.eachCell((cell) => {
      const value = cell.value;
      if (value !== null && value !== undefined && value !== '') {
        hasContent = true;
        if (typeof value === 'string') {
          const lines = value.split('\n').length;
          if (lines > maxLines) maxLines = lines;
          if (value.length > maxTextLength) maxTextLength = value.length;
        }
      }
    });

    const h = row.height;
    const isRowHidden = row.hidden || (h !== undefined && h < 1);

    if (!hasContent && !row.height && !isRowHidden) {
      return;
    }

    let height: number = MIN_HEIGHT;
    if (row.height && row.height >= 1) {
      height = Math.round(row.height * 1.33);
    } else if (hasContent) {
      const linesFromText = Math.ceil(maxTextLength / 40);
      const totalLines = Math.max(maxLines, linesFromText);
      height = totalLines * 18 + 6;
    }

    height = Math.max(height, MIN_HEIGHT);
    height = Math.min(height, MAX_HEIGHT);
    
    const rowConfig: any = { h: height };
    
    if (isRowHidden) {
      rowConfig.hd = 1;
    }

    rowData[rowIdx] = rowConfig;
  });

  return Object.keys(rowData).length > 0 ? rowData : undefined;
}