// lib/univer-parser/parseDimensions.ts

const MIN_ROW_COUNT = 100;
const MIN_COLUMN_COUNT = 26;

export function getActualDimensions(cellData: Record<number, Record<number, any>>) {
  const rowIndices = Object.keys(cellData).map(Number);

  if (rowIndices.length === 0) {
    return { rowCount: MIN_ROW_COUNT, columnCount: MIN_COLUMN_COUNT };
  }

  const maxRow = Math.max(...rowIndices);

  let maxCol = 0;
  rowIndices.forEach((rowIdx) => {
    const colIndices = Object.keys(cellData[rowIdx]).map(Number);
    if (colIndices.length > 0) {
      maxCol = Math.max(maxCol, Math.max(...colIndices));
    }
  });

  return {
    rowCount: Math.max(maxRow + 1, MIN_ROW_COUNT),
    columnCount: Math.max(maxCol + 1, MIN_COLUMN_COUNT),
  };
}
