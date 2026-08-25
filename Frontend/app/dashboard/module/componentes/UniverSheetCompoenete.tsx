'use client';

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { createUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import sheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import type {
  UniverSheetProps,
  UniverSheetHandle,
  UniverAPI,
  UniverWorkbook,
  CellSelection,
  HighlightRange,
} from '@/tipos/plantillas';

import '@univerjs/preset-sheets-core/lib/index.css';

function columnToLetter(col: number): string {
  let s = '';
  let c = col + 1;
  while (c > 0) {
    const rem = (c - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

/** Resuelve la hoja por nombre; si no existe o no se provee, usa la activa o la primera. */
function resolveSheet(workbook: UniverWorkbook, name?: string) {
  if (name) {
    const byName = workbook.getSheetByName?.(name);
    if (byName) return byName;
  }
  const active = workbook.getActiveSheet?.();
  if (active) return active;
  return workbook.getSheets?.()?.[0] ?? null;
}

interface MergeRect {
  sr: number;
  sc: number;
  er: number;
  ec: number;
}

/**
 * Construye el mapa de regiones combinadas por hoja a partir del snapshot,
 * para normalizar cualquier celda seleccionada al ancla (esquina superior
 * izquierda) del merge al que pertenece.
 */
function buildMergeMap(snapshot: unknown): Record<string, MergeRect[]> {
  const map: Record<string, MergeRect[]> = {};
  if (!snapshot || typeof snapshot !== 'object') return map;
  const wb = snapshot as { sheets?: Record<string, { name?: string; mergeData?: MergeRect[] }> };
  if (!wb.sheets) return map;
  for (const sheet of Object.values(wb.sheets)) {
    if (!sheet?.name || !Array.isArray(sheet.mergeData)) continue;
    map[sheet.name] = sheet.mergeData.filter((m) => m && typeof m.sr === 'number');
  }
  return map;
}

function normalizeToMergeAnchor(
  merges: MergeRect[] | undefined,
  row: number,
  col: number
): { row: number; col: number } {
  if (!merges?.length) return { row, col };
  for (const m of merges) {
    if (row >= m.sr && row <= m.er && col >= m.sc && col <= m.ec) {
      return { row: m.sr, col: m.sc };
    }
  }
  return { row, col };
}

export const UniverSheet = forwardRef<UniverSheetHandle, UniverSheetProps>(
  function UniverSheet({ snapshot, onCellSelect, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const univerAPIRef = useRef<UniverAPI | null>(null);
    const workbookRef = useRef<UniverWorkbook | null>(null);
    const selectionSubRef = useRef<{ dispose: () => void } | null>(null);
    const highlightedRef = useRef<HighlightRange[]>([]);
    const mergeMapRef = useRef<Record<string, MergeRect[]>>({});
    const onCellSelectRef = useRef(onCellSelect);
    const onReadyRef = useRef(onReady);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    onCellSelectRef.current = onCellSelect;
    onReadyRef.current = onReady;

    // 1. Inicializar Univer (una sola vez)
    useEffect(() => {
      if (!containerRef.current) return;

      const { univerAPI } = createUniver({
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: mergeLocales([sheetsCoreEnUS]),
        },
        presets: [
          UniverSheetsCorePreset({
            container: containerRef.current,
          }),
        ],
      });

      univerAPIRef.current = univerAPI;

      return () => {
        selectionSubRef.current?.dispose();
        univerAPI.dispose();
      };
    }, []);

    // 2. Cargar snapshot del backend (payload listo para createWorkbook)
    useEffect(() => {
      if (!snapshot || !univerAPIRef.current) return;

      const univerAPI = univerAPIRef.current;
      setIsLoading(true);
      setError(null);

      try {
        // Crear el workbook a partir del snapshot generado en el backend
        workbookRef.current = univerAPI.createWorkbook(
          snapshot as Parameters<UniverAPI['createWorkbook']>[0]
        );
        mergeMapRef.current = buildMergeMap(snapshot);

        // 2a. Escuchar cambios de selección para emitir la celda/columna elegida
        selectionSubRef.current?.dispose();
        const workbook = workbookRef.current;
        const sub = workbook.onSelectionChange((selections) => {
          if (!onCellSelectRef.current || !selections?.length) return;
          const first = selections[0];
          const sheet = workbook.getActiveSheet?.();
          const sheetName = sheet?.getSheetName?.() ?? '';

          const rawRow = first?.startRow ?? 0;
          const rawCol = first?.startColumn ?? 0;
          const endRow = first?.endRow ?? rawRow;
          const endColumn = first?.endColumn ?? rawCol;

          const anchor = normalizeToMergeAnchor(mergeMapRef.current[sheetName], rawRow, rawCol);
          const row = anchor.row;
          const col = anchor.col;

          const selection: CellSelection = {
            sheetName,
            cellAddress: `${columnToLetter(col)}${row + 1}`,
            row,
            col,
            endRow,
            endColumn,
          };
          onCellSelectRef.current(selection);
        });
        selectionSubRef.current = sub as { dispose: () => void };

        setIsLoading(false);
        onReadyRef.current?.();
      } catch (err) {
        console.error('Error al crear workbook desde snapshot:', err);
        setError('Error al renderizar el documento');
        setIsLoading(false);
      }
    }, [snapshot]);

    // 3. API imperativa: resaltar / limpiar mapeos en el canvas
    useImperativeHandle(ref, () => ({
      highlightRanges: (ranges: HighlightRange[]) => {
        const workbook = workbookRef.current;
        if (!workbook) return;

        // Limpiar resaltados previos (solo color de fondo, sin tocar otros formatos)
        for (const prev of highlightedRef.current) {
          resolveSheet(workbook, prev.sheetName)?.getRange(prev.a1)?.setBackground("");
        }
        highlightedRef.current = [];

        for (const range of ranges) {
          const sheet = resolveSheet(workbook, range.sheetName);
          if (!sheet) continue;
          sheet.getRange(range.a1)?.setBackground(range.color);
          highlightedRef.current.push(range);
        }
      },
      clearHighlights: () => {
        const workbook = workbookRef.current;
        if (!workbook) return;
        for (const range of highlightedRef.current) {
          resolveSheet(workbook, range.sheetName)?.getRange(range.a1)?.setBackground("");
        }
        highlightedRef.current = [];
      },
    }));

    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {isLoading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
            }}
          >
            Cargando documento...
          </div>
        )}

        {error && (
          <div
            style={{
              color: 'red',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
            }}
          >
            {error}
          </div>
        )}

        <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: '500px' }} />
      </div>
    );
  }
);
