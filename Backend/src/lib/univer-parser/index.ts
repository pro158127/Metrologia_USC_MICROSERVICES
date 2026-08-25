// lib/univer-parser/index.ts
import ExcelJS from 'exceljs';
import { parseSheet } from './parseWorkbook.js';
import { createStyleRegistry } from './styleRegistry.js';

export async function excelToUniverSnapshot(
  buffer: Buffer | ArrayBuffer,
  fileName?: string
) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const styleRegistry = createStyleRegistry();
  const sheets: Record<string, any> = {};
  const sheetOrder: string[] = [];

  workbook.worksheets.forEach((worksheet, index) => {
    const sheetId = `sheet-${index + 1}`;
    sheetOrder.push(sheetId);
    sheets[sheetId] = parseSheet(worksheet, styleRegistry, index);
  });

  return {
    id: `workbook-${Date.now()}`,
    name: fileName || workbook.creator || 'Excel Importado',
    appVersion: '0.25.1',
    locale: 'enUS',
    styles: styleRegistry.getAll(),
    sheetOrder,
    sheets,
  };
}
