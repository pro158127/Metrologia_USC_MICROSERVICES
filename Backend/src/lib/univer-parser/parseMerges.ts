// lib/univer-parser/parseMerges.ts

export function parseMerges(worksheet: any) {
 let mergeRefs: string[] = [];

  // 1. Extraer las referencias de forma segura (soportando Arrays y Objetos)
  if (worksheet.model?.merges && Array.isArray(worksheet.model.merges)) {
    mergeRefs = worksheet.model.merges;
  } else if (worksheet._merges) {
    // Si es un objeto, extraemos sus llaves (ej. ['A1:C1', 'D2:E2'])
    mergeRefs = Array.isArray(worksheet._merges) 
      ? worksheet._merges 
      : Object.keys(worksheet._merges);
  } else if (worksheet.merges) {
    mergeRefs = Array.isArray(worksheet.merges)
      ? worksheet.merges
      : Object.keys(worksheet.merges);
  }

  // 2. Si no hay combinaciones, retornamos vacío
  if (!mergeRefs || mergeRefs.length === 0) {
    return [];
  }

  // 3. El resto de tu validación sigue exactamente igual
  const validMerges = mergeRefs
    .filter((mergeRef: any) => {
      if (typeof mergeRef !== 'string') return false;
      if (!mergeRef.includes(':')) return false;

      const parts = mergeRef.split(':');
      if (parts.length !== 2) return false;

      const startMatch = parts[0].match(/^[A-Z]+\d+$/);
      const endMatch = parts[1].match(/^[A-Z]+\d+$/);

      return startMatch && endMatch;
    })
    .map((mergeRef: string) => {
      const [start, end] = mergeRef.split(':');
      const startPos = parseCellRef(start);
      const endPos = parseCellRef(end);

      const startRow = Math.min(startPos.row, endPos.row);
      const endRow = Math.max(startPos.row, endPos.row);
      const startColumn = Math.min(startPos.col, endPos.col);
      const endColumn = Math.max(startPos.col, endPos.col);

      return {
        startRow,
        startColumn,
        endRow,
        endColumn,
      };
    });

  const uniqueMerges = validMerges.filter((merge, index, self) => {
    return (
      index ===
      self.findIndex(
        (m) =>
          m.startRow === merge.startRow &&
          m.startColumn === merge.startColumn &&
          m.endRow === merge.endRow &&
          m.endColumn === merge.endColumn
      )
    );
  });

  return uniqueMerges;
}

function parseCellRef(ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { row: 0, col: 0 };

  const colStr = match[1];
  const rowStr = match[2];

  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }

  return {
    row: parseInt(rowStr, 10) - 1,
    col: col - 1,
  };
}
