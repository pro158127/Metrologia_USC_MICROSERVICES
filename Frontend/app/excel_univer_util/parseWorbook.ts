// utils/excel-univer/parseWorkbook.ts
import ExcelJS from 'exceljs';
import { parseCell } from './pasecell';
import { parseMerges } from './ parseMerges';
import { getActualDimensions } from './parseDimensions';
import { getOrCreateStyleId } from './styleRegistry';

export function parseSheet(
  worksheet: ExcelJS.Worksheet, 
  styleRegistry: any, 
  sheetIndex: number
) {
  const cellData: Record<number, Record<number, any>> = {};
  const mergeData = parseMerges(worksheet);

  // ✅ Crear Set de celdas fusionadas (excluyendo la primera)
  const mergedCells = new Set<string>();
  mergeData.forEach(merge => {
    for (let row = merge.startRow; row <= merge.endRow; row++) {
      for (let col = merge.startColumn; col <= merge.endColumn; col++) {
        if (row === merge.startRow && col === merge.startColumn) continue;
        mergedCells.add(`${row},${col}`);
      }
    }
  });

  worksheet.eachRow((row, rowIndex) => {
    row.eachCell((cell, colIndex) => {
      const rowIdx = rowIndex - 1;
      const colIdx = colIndex - 1;
      const cellKey = `${rowIdx},${colIdx}`;
      const isMerged = mergedCells.has(cellKey);

      // ✅ Obtener el valor real
      const value = cell.value;
      const hasValue = value !== null && value !== undefined && value !== '';
      
      // ✅ Verificar si tiene estilo real
      const hasStyle = cell.style && Object.keys(cell.style).length > 0;

      // 🔥 Si es una celda fusionada (no principal), SOLO guardar estilo si existe
      if (isMerged) {
        if (hasStyle) {
          const styleId = getOrCreateStyleId(cell.style, styleRegistry);
          if (!cellData[rowIdx]) cellData[rowIdx] = {};
          cellData[rowIdx][colIdx] = { s: styleId };
        }
        return;
      }

      // 🔥 Si no tiene valor, NO guardar NADA (ni siquiera el estilo)
      if (!hasValue) {
        return;
      }

      // ✅ Si tiene valor, procesar normalmente
      let styleId: string | null = null;
      if (hasStyle) {
        styleId = getOrCreateStyleId(cell.style, styleRegistry);
      }

      const cellDataItem = parseCell(cell, styleId);

      if (!cellData[rowIdx]) {
        cellData[rowIdx] = {};
      }
      cellData[rowIdx][colIdx] = cellDataItem;
    });
  });

  const { rowCount, columnCount } = getActualDimensions(cellData);

  const columnData = getColumnConfigs(worksheet);
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

// ✅ Configuración de columnas
function getColumnConfigs(worksheet: ExcelJS.Worksheet) {
  const columnData: any = {};
  
  const defaultWidths: Record<number, number> = {
    0: 40, 1: 80, 2: 120, 3: 80, 4: 60, 5: 60, 6: 80, 7: 80,
    8: 120, 13: 60, 14: 80, 15: 100, 19: 60, 20: 80, 21: 80,
    22: 100, 23: 80, 29: 120,
  };

  if (worksheet.columns) {
    worksheet.columns.forEach((col, index) => {
      const excelWidth = col.width;
      // ✅ Si el ancho es muy pequeño, usar el predeterminado
      const width = (excelWidth && excelWidth > 1) ? excelWidth : (defaultWidths[index] || 60);
      columnData[index] = { w: Math.round(width * 7.5) };
    });
  }
  
  return Object.keys(columnData).length > 0 ? columnData : undefined;
}

// ✅ Configuración de filas mejorada
function getRowConfigs(worksheet: ExcelJS.Worksheet) {
  const rowData: any = {};
  
  const MIN_HEIGHT = 18;
  const MAX_HEIGHT = 200;

  worksheet.eachRow((row, index) => {
    const rowIdx = index - 1;
    
    // ✅ Verificar si la fila tiene contenido real
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

    // ✅ Si la fila no tiene contenido, no agregar rowData
    if (!hasContent) {
      return;
    }

    let height: number;

    // 1. Si tiene altura definida en Excel
    if (row.height) {
      height = Math.round(row.height * 1.33);
    } else {
      // 2. Calcular altura basada en el contenido
      // Cada línea ~18px, cada 40 caracteres ~1 línea
      const linesFromText = Math.ceil(maxTextLength / 40);
      const totalLines = Math.max(maxLines, linesFromText);
      height = totalLines * 18 + 6; // 18px por línea + padding
    }

    // Aplicar mínimos y máximos
    height = Math.max(height, MIN_HEIGHT);
    height = Math.min(height, MAX_HEIGHT);
    
    rowData[rowIdx] = { h: height };
  });

  return Object.keys(rowData).length > 0 ? rowData : undefined;
}