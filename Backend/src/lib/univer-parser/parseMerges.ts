// lib/univer-parser/parseMerges.ts

export function parseMerges(worksheet: any) {
  let merges: string[] = [];

  if (worksheet.model?.merges) {
    merges = worksheet.model.merges;
  } else if (worksheet.merges) {
    merges = worksheet.merges;
  } else if (worksheet._merges) {
    merges = worksheet._merges;
  }

  if (!merges || !Array.isArray(merges) || merges.length === 0) {
    return [];
  }

  const validMerges = merges
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
