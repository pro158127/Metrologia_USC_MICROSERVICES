"use client";

import type { ReactNode } from "react";

export interface ResponsiveColumn<T> {
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
}

export interface ResponsiveCardField<T> {
  label: string;
  value: (row: T) => ReactNode;
}

interface ResponsiveTableProps<T> {
  columns: ResponsiveColumn<T>[];
  data: T[];
  rowKey: (row: T) => string | number;
  cardTitle: (row: T) => ReactNode;
  cardFields: ResponsiveCardField<T>[];
  cardActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  minWidth?: string;
  emptyText?: string;
  loading?: boolean;
  skeletonRows?: number;
}

/**
 * Tabla responsiva: se renderiza como `<table>` en pantallas medianas/grandes
 * (con scroll horizontal) y como lista de tarjetas apiladas en móvil.
 */
export default function ResponsiveTable<T>({
  columns,
  data,
  rowKey,
  cardTitle,
  cardFields,
  cardActions,
  onRowClick,
  minWidth = "min-w-[720px]",
  emptyText = "Sin registros.",
  loading = false,
  skeletonRows = 5,
}: ResponsiveTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-6 space-y-3">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-10 text-center text-xs text-slate-400">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      {/* Vista de tabla (md en adelante) */}
      <div className="hidden md:block overflow-x-auto">
        <table className={`w-full text-left text-xs ${minWidth}`}>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={`px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px] ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? "cursor-pointer" : ""} hover:bg-slate-50/50 transition-colors`}
              >
                {columns.map((c, i) => (
                  <td key={i} className="px-4 py-3.5 align-middle">
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Vista de tarjetas (móvil) */}
      <div className="md:hidden divide-y divide-slate-100">
        {data.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`p-4 space-y-2 ${onRowClick ? "cursor-pointer active:bg-slate-50" : ""}`}
          >
            <div className="font-bold text-slate-800 text-sm break-words">{cardTitle(row)}</div>
            <dl className="space-y-1">
              {cardFields.map((f) => (
                <div key={f.label} className="flex items-start justify-between gap-3 text-xs">
                  <dt className="text-slate-400 shrink-0">{f.label}</dt>
                  <dd className="text-slate-700 text-right font-medium break-words">{f.value(row)}</dd>
                </div>
              ))}
            </dl>
            {cardActions && (
              <div className="flex items-center gap-2 pt-1 flex-wrap">{cardActions(row)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
