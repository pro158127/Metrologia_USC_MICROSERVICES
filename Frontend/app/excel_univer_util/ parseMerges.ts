// utils/excel-univer/parseMerges.ts

export function parseMerges(worksheet: any) {
  // ✅ Intentar obtener merges de diferentes formas
  let merges: string[] = [];
  
  // Forma 1: worksheet.model.merges (más común)
  if (worksheet.model?.merges) {
    merges = worksheet.model.merges;
  }
  // Forma 2: worksheet.merges (algunas versiones)
  else if (worksheet.merges) {
    merges = worksheet.merges;
  }
  // Forma 3: worksheet._merges (internamente)
  else if (worksheet._merges) {
    merges = worksheet._merges;
  }

  // ✅ Si no hay merges, retornar array vacío
  if (!merges || !Array.isArray(merges) || merges.length === 0) {
    return [];
  }

  // ✅ Filtrar y procesar solo merges válidos
  const validMerges = merges
    .filter((mergeRef: any) => {
      if (typeof mergeRef !== 'string') return false;
      if (!mergeRef.includes(':')) return false;
      
      // ✅ Verificar que sea una referencia de celda válida
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

      // ✅ Asegurar que startRow <= endRow y startColumn <= endColumn
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

  // ✅ Remover duplicados (por si hay merges repetidos)
  const uniqueMerges = validMerges.filter((merge, index, self) => {
    return index === self.findIndex((m) => 
      m.startRow === merge.startRow &&
      m.startColumn === merge.startColumn &&
      m.endRow === merge.endRow &&
      m.endColumn === merge.endColumn
    );
  });

  return uniqueMerges;
}

// Convertir referencia de celda (ej: 'A1') a { row, col }
function parseCellRef(ref: string) {
  const match = ref.match(/^([A-Z]+)(\d+)$/);
  if (!match) return { row: 0, col: 0 };

  const colStr = match[1];
  const rowStr = match[2];

  // Convertir letras a número (A=0, B=1, ...)
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }

  return {
    row: parseInt(rowStr, 10) - 1,
    col: col - 1,
  };
}