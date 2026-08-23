// lib/univer-parser/parseCell.ts
import ExcelJS from 'exceljs';

export function parseCell(cell: ExcelJS.Cell, styleId: string | null) {
  const out: any = {};

  if (cell.formula) {
    out.f = cell.formula;
    if (cell.result !== null && cell.result !== undefined) {
      out.v = cell.result;
    }
  } else if (cell.value !== null && cell.value !== undefined) {
    if (typeof cell.value === 'object' && cell.value !== null) {
      if (cell.value instanceof Date) {
        out.v = dateToExcelSerial(cell.value);
        out.t = 2;
      } else if ('richText' in cell.value && Array.isArray((cell.value as any).richText)) {
        out.v = (cell.value as any).richText.map((r: any) => r.text || '').join('');
        out.t = 1;
      } else if ('text' in cell.value && 'hyperlink' in cell.value) {
        out.v = (cell.value as any).text || (cell.value as any).hyperlink || '';
        out.t = 1;
      } else {
        out.v = JSON.stringify(cell.value);
        out.t = 1;
      }
    } else if (typeof cell.value === 'number') {
      out.v = cell.value;
      out.t = 2;
    } else if (typeof cell.value === 'boolean') {
      out.v = cell.value ? 1 : 0;
      out.t = 3;
    } else {
      out.v = String(cell.value);
      out.t = 1;
    }
  }

  if (styleId) {
    out.s = styleId;
  }

  return out;
}

function dateToExcelSerial(date: Date): number {
  const origin = new Date(1899, 11, 30);
  const diff = date.getTime() - origin.getTime();
  return diff / (1000 * 60 * 60 * 24);
}
