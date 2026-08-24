'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { LoaderCircle, Save } from 'lucide-react';
import type { MapeoConfigTarifas } from '@/tipos/plantillas';
import { consolidarTarifas, consultarEstadoJob } from '@/app/action_module/template';

type ColumnasExcel =
  | string[]
  | Record<number, string>
  | Record<string, string>;

const AÑOS_REGEX = /^\d{4}$/;

function mensajeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Error desconocido');
}

function headerColumna(columnasExcel: ColumnasExcel | undefined, idx: number): string {
  if (!columnasExcel) return '';
  if (Array.isArray(columnasExcel)) return columnasExcel[idx] ?? '';
  const col = columnasExcel as Record<string, string>;
  return col[String(idx)] ?? '';
}

function detectarAnios(columnasExcel: ColumnasExcel | undefined): Record<string, number> {
  const anios: Record<string, number> = {};
  if (!columnasExcel) return anios;
  if (Array.isArray(columnasExcel)) {
    columnasExcel.forEach((v, idx) => {
      const header = String(v).trim();
      if (AÑOS_REGEX.test(header)) anios[header] = idx;
    });
  } else {
    for (const [k, v] of Object.entries(columnasExcel)) {
      const idx = Number(k);
      const header = String(v).trim();
      if (!Number.isNaN(idx) && AÑOS_REGEX.test(header)) anios[header] = idx;
    }
  }
  return anios;
}

export function EditorMapeoPlantilla({
  idVersion,
  columnasExcel,
}: {
  idVersion: number;
  columnasExcel?: ColumnasExcel;
}) {
  const [mapeoState, setMapeoState] = useState<MapeoConfigTarifas>(() => ({
    filaInicialDatos: 1,
    columnas: { magnitud: 0, instrumento: 2, norma: 4, tipoServicio: 1 },
    anios: detectarAnios(columnasExcel),
  }));
  const [consolidando, setConsolidando] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cabeceras = useMemo(() => {
    const total = Array.isArray(columnasExcel)
      ? columnasExcel.length
      : columnasExcel
        ? Math.max(...Object.keys(columnasExcel).map((k) => Number(k) || 0)) + 1
        : 0;
    return Array.from({ length: Math.max(total, 10) }, (_, i) => i);
  }, [columnasExcel]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const setAnio = (anio: string, col: number) => {
    setMapeoState((prev) => ({ ...prev, anios: { ...prev.anios, [anio]: col } }));
  };

  const setColumna = (campo: keyof MapeoConfigTarifas['columnas'], col: number) => {
    setMapeoState((prev) => ({ ...prev, columnas: { ...prev.columnas, [campo]: col } }));
  };

  const handleConsolidar = async () => {
    if (pollRef.current) clearInterval(pollRef.current);

    // 1. Desplegar Toast persistente
    const toastId = toast.loading(
      'Las tarifas se están actualizando con la información del formato actual...'
    );
    setConsolidando(true);

    try {
      // 2. Enviar la configuración del mapeo
      const res = await consolidarTarifas(idVersion, mapeoState);

      if (!res.success) {
        throw new Error(res.error || 'No se pudo iniciar la consolidación');
      }

      // 3. Iniciar Polling al endpoint de estado
      let intentos = 0;
      const pollInterval = setInterval(async () => {
        intentos += 1;
        try {
          const resEstado = await consultarEstadoJob(idVersion);
          const data = resEstado.data;
          if (!data) throw new Error(resEstado.error || 'Sin estado del job');

          if (data.estado === 'COMPLETADO') {
            clearInterval(pollInterval);
            setConsolidando(false);
            toast.success('¡Tarifas e historial actualizados exitosamente!', { id: toastId });
          } else if (data.estado === 'ERROR') {
            clearInterval(pollInterval);
            setConsolidando(false);
            toast.error(`Error al actualizar tarifas: ${data.errorLog ?? 'Error desconocido'}`, {
              id: toastId,
            });
          } else if (intentos >= 150) {
            clearInterval(pollInterval);
            setConsolidando(false);
            toast.error('La consolidación tardó demasiado. Verifica el estado del job.', {
              id: toastId,
            });
          }
        } catch (error) {
          clearInterval(pollInterval);
          setConsolidando(false);
          toast.error(mensajeError(error) || 'Error de conexión durante el sondeo', { id: toastId });
        }
      }, 2000);
      pollRef.current = pollInterval;
    } catch (error) {
      setConsolidando(false);
      toast.error(mensajeError(error) || 'Error de conexión', { id: toastId });
    }
  };

  return (
    <div className="w-full p-4 rounded-xl bg-white border border-slate-200 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
          Mapeo de columnas para tarifas
        </span>
        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
          Versión {idVersion}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-slate-600">Fila inicial de datos</span>
          <input
            type="number"
            min={0}
            value={mapeoState.filaInicialDatos}
            onChange={(e) =>
              setMapeoState((prev) => ({
                ...prev,
                filaInicialDatos: Number(e.target.value) || 0,
              }))
            }
            className="w-full px-3 py-2 rounded-lg text-sm text-slate-900"
            style={{ border: '1px solid #CBD2E1', outline: 'none', background: '#FFFFFF' }}
          />
        </label>

        {(['magnitud', 'instrumento', 'norma', 'tipoServicio'] as const).map((campo) => (
          <label key={campo} className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-slate-600 capitalize">{campo}</span>
            <select
              value={mapeoState.columnas[campo] ?? ''}
              onChange={(e) => setColumna(campo, Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg text-sm text-slate-900"
              style={{ border: '1px solid #CBD2E1', outline: 'none', background: '#FFFFFF' }}
            >
              <option value="" disabled>
                Seleccionar columna
              </option>
              {cabeceras.map((idx) => (
                <option key={idx} value={idx}>
                  {String.fromCharCode(65 + idx)} · {headerColumna(columnasExcel, idx) || '(sin nombre)'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold text-slate-600">
          Años de tarifa → columna del precio
        </span>
        {Object.keys(mapeoState.anios).length === 0 && (
          <p className="text-[11px] text-slate-400 italic">
            No se detectaron años en las cabeceras. Agrégalos manualmente.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Object.entries(mapeoState.anios).map(([anio, col]) => (
            <label key={anio} className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-slate-600">Año {anio}</span>
              <select
                value={col}
                onChange={(e) => setAnio(anio, Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg text-sm text-slate-900"
                style={{ border: '1px solid #CBD2E1', outline: 'none', background: '#FFFFFF' }}
              >
                {cabeceras.map((idx) => (
                  <option key={idx} value={idx}>
                    {String.fromCharCode(65 + idx)} · {headerColumna(columnasExcel, idx) || '(sin nombre)'}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleConsolidar}
        disabled={consolidando}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white transition-all active:scale-95 disabled:opacity-50"
        style={{ background: '#2563EB' }}
      >
        {consolidando ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
        {consolidando ? 'Consolidando tarifas...' : 'Terminar y Consolidar'}
      </button>
    </div>
  );
}
