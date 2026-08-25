'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  History,
  Edit3,
  LoaderCircle,
  X,
  Save,
  Upload,
  AlertCircle,
  CheckCircle2,
  Layers,
  Table,
  MousePointerClick,
  RefreshCw,
  Info,
  Trash2,
  MapPin,
  FileUp,
  Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import type {
  InputSchema,
  MappingConfig,
  PlantillaWithVersionResponse,
  TemplateHistoryLog,
  CellSelection,
  HighlightRange,
  UniverSheetHandle,
} from '@/tipos/plantillas';
import {
  getTodasLasPlantillasCompletas,
  getSnapshot,
  pollSnapshotJob,
  saveMappingConfig,
  crearNuevaVersion,
} from '@/app/action_module/template';

// ============================================================================
// 1. COMPONENTE UNIVER (CARGA DINÁMICA)
// ============================================================================

const UniverSheet = dynamic(
  () => import('@/app/dashboard/module/componentes/UniverSheetCompoenete').then((mod) => mod.UniverSheet),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '500px' }}>
        <p>Cargando la hoja de cálculo...</p>
      </div>
    ),
  }
);

// ============================================================================
// 2. HELPERS DE MAPEO
// ============================================================================

const COLOR_SCALAR = '#FDE68A';
const COLOR_COLUMN = '#BBF7D0';
const COLOR_STARTROW = '#93C5FD';

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

interface DraftScalar {
  key: string;
  label: string;
  dataType: string;
  cell: string | null;
  sheet: string | null;
}

interface DraftColumn {
  key: string;
  label: string;
  dataType?: string;
  column: string | null;
}

interface DraftTable {
  key: string;
  label: string;
  startRow: number | null;
  sheet: string | null;
  columns: DraftColumn[];
}

interface DraftMapping {
  scalars: DraftScalar[];
  tables: DraftTable[];
}

type ActiveTarget =
  | { kind: 'scalar'; key: string }
  | { kind: 'column'; tableKey: string; key: string }
  | { kind: 'startRow'; tableKey: string }
  | null;

function buildDraft(schema: InputSchema): DraftMapping {
  return {
    scalars: (schema.fields?.scalars ?? []).map((s) => ({
      key: s.key,
      label: s.label,
      dataType: s.dataType,
      cell: null,
      sheet: null,
    })),
    tables: (schema.fields?.tables ?? []).map((t) => ({
      key: t.key,
      label: t.label,
      startRow: null,
      sheet: null,
      columns: t.columns.map((c) => ({
        key: c.key,
        label: c.label,
        dataType: c.type === 'OBJECT' ? 'OBJECT' : c.dataType,
        column: null,
      })),
    })),
  };
}

function hydrateDraft(schema: InputSchema | null, mc: MappingConfig | null): DraftMapping {
  if (!schema) return { scalars: [], tables: [] };
  const draft = buildDraft(schema);
  if (!mc?.mappings) return draft;

  for (const s of mc.mappings.scalars ?? []) {
    const d = draft.scalars.find((x) => x.key === s.key);
    if (d) {
      d.cell = s.cell ?? null;
      d.sheet = s.sheet ?? null;
    }
  }
  for (const t of mc.mappings.tables ?? []) {
    const dt = draft.tables.find((x) => x.key === t.key);
    if (dt) {
      if (typeof t.startRow === 'number') dt.startRow = t.startRow;
      dt.sheet = t.sheet ?? null;
      for (const c of t.columns ?? []) {
        const dc = dt.columns.find((x) => x.key === c.key);
        if (dc) dc.column = c.column ?? null;
      }
    }
  }
  return draft;
}

const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ============================================================================
// 3. COMPONENTES UI REUTILIZABLES
// ============================================================================

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex group">
      <Info size={12} className="text-slate-400 cursor-help shrink-0" />
      <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block w-60 z-40 bg-slate-800 text-white text-[10px] leading-snug p-2 rounded-lg shadow-lg font-normal">
        {text}
      </span>
    </span>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: 'mapped' | 'pending' | 'info' }) {
  const styles = {
    mapped: { bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' },
    pending: { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' },
    info: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ background: styles.bg, color: styles.color, border: `1px solid ${styles.border}` }}
    >
      {children}
    </span>
  );
}

// ============================================================================
// 4. COMPONENTE PRINCIPAL (LISTA DE PLANTILLAS)
// ============================================================================

export default function TemplatesMappingPage() {
  const [templates, setTemplates] = useState<PlantillaWithVersionResponse[]>();
  const [busqueda, setBusqueda] = useState('');
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<PlantillaWithVersionResponse | null>(null);
  const [HistoryFromTemplate, setSelectedTemplateForHistory] = useState<Record<number, TemplateHistoryLog> | null>(null);
  const [openmodalhistoia, setOpenmodalhistoia] = useState<TemplateHistoryLog | null>(null);

  const plantillasFiltradas = useMemo(
    () =>
      templates?.filter((t) => t.data?.nombre.toLowerCase().includes(busqueda.toLowerCase())) ?? [],
    [templates, busqueda]
  );

  const reload = useCallback(async () => {
    try {
      const load = await getTodasLasPlantillasCompletas();
      if (!load.success || !load.data) return;

      const formateo_history = load.data.reduce<Record<number, TemplateHistoryLog>>((acc, p) => {
        acc[p.idPlantilla] = {
          name: p.nombre,
          id_plantilla: p.idPlantilla,
          version: p.versiones.map((n) => ({
            idVersionPlantilla: n.idVersionPlantilla,
            version: n.version,
            mapeoExcelJson: n.mapeoExcelJson,
            createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
            createby: typeof n.createdby === 'string' ? n.createdby : n.createdby?.nombre ?? '',
          })),
        };
        return acc;
      }, {});

      const formateo: PlantillaWithVersionResponse[] = load.data.map((p) => {
        const ultimaVersion = p.versiones[p.versiones.length - 1];
        return {
          success: true,
          data: {
            idPlantilla: p.idPlantilla,
            activa: p.activa,
            modulo: p.modulo,
            nombre: p.modulo,
            versionActual: ultimaVersion
              ? {
                  idVersionPlantilla: ultimaVersion.idVersionPlantilla,
                  version: ultimaVersion.version,
                  mapeoExcelJson: ultimaVersion.mapeoExcelJson,
                  inputSchema: ultimaVersion.inputSchema,
                  mappingConfig: ultimaVersion.mappingConfig,
                  createdAt: ultimaVersion.createdAt,
                  documento: ultimaVersion.documento
                    ? {
                        idDocumento: ultimaVersion.documento.idDocumento,
                        nombre: ultimaVersion.documento.nombre,
                        rutaUrl: ultimaVersion.documento.rutaUrl,
                        proveedor: ultimaVersion.documento.proveedor,
                        mimeType: ultimaVersion.documento.mimeType,
                      }
                    : null,
                }
              : null,
          },
          error: '',
        };
      });

      setTemplates(formateo);
      setSelectedTemplateForHistory(formateo_history);

      setSelectedTemplateForEdit((prev) => {
        if (!prev?.data) return prev;
        const refreshed = formateo.find((f) => f.data?.idPlantilla === prev.data!.idPlantilla);
        return refreshed ?? prev;
      });
    } catch (error) {
      console.log('Error posible de conexion con base de datos', error);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => reload(), 0);
    return () => clearTimeout(id);
  }, [reload]);

  return (
    <div className="w-full px-2 md:px-0 py-4">
      <div
        className="flex items-start md:items-center gap-3 p-3.5 mb-5 rounded-xl"
        style={{ background: '#F8FAFC', border: '1px solid #CBD2E1' }}
      >
        <Layers size={18} color="#0F172A" className="shrink-0 mt-0.5 md:mt-0" />
        <span style={{ color: '#1E293B', fontSize: 13, fontWeight: 500, lineHeight: '1.4' }}>
          Gestión de Plantillas de Excel y Editor de Mapeo de Variables para Procesamiento Automatizado.
        </span>
      </div>

      <div className="flex flex-col gap-3 mb-5 p-4 rounded-xl" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#1E293B' }}>
          Buscar Plantilla de Excel
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label style={{ color: '#1E293B', fontSize: 12, fontWeight: 600 }}>Nombre / Descripción</label>
            <input
              type="text"
              placeholder="Buscar plantilla..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-slate-900 placeholder:text-slate-400"
              style={{ border: '1px solid #CBD2E1', fontSize: 13, outline: 'none', background: '#FFFFFF', color: '#0F172A' }}
            />
          </div>
          <div className="flex items-end justify-end">
            <button
              onClick={reload}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all active:scale-95"
              style={{ background: '#FFFFFF', border: '1px solid #CBD2E1', color: '#334155' }}
            >
              <RefreshCw size={13} /> Recargar
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plantillasFiltradas?.map((tpl) => (
          <div
            key={tpl.data?.idPlantilla}
            className="p-4 rounded-xl flex flex-col justify-between"
            style={{ background: '#FFFFFF', border: '1px solid #CBD2E1' }}
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-base" style={{ color: '#0F172A' }}>
                  {tpl.data?.nombre}
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: '#F1F5F9', color: '#1E293B', border: '1px solid #CBD2E1' }}
                >
                  v{tpl.data?.versionActual?.version}
                </span>
              </div>
              <p className="text-xs mb-2" style={{ color: '#475569' }}>
                {tpl.data?.versionActual?.documento?.nombre}
              </p>
              <p className="text-[10px] mb-4" style={{ color: '#94A3B8' }}>
                {tpl.data?.versionActual?.inputSchema
                  ? `${tpl.data.versionActual.inputSchema.templateType} · Schema v${tpl.data.versionActual.inputSchema.version}`
                  : 'Sin schema de variables'}
              </p>
            </div>

            <div className="flex gap-2 pt-3 border-t" style={{ borderColor: '#E2E8F0' }}>
              <button
                onClick={() => setSelectedTemplateForEdit(tpl)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs text-white transition-all active:scale-95"
                style={{ background: '#2563EB' }}
              >
                <Edit3 size={14} />
                <span>Editar Plantilla</span>
              </button>

              <button
                onClick={() => {
                  const id_plantlla = tpl?.data?.idPlantilla;
                  if (!id_plantlla) return;
                  const historia = HistoryFromTemplate?.[id_plantlla];
                  setOpenmodalhistoia(historia ?? null);
                }}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-xs transition-all active:scale-95"
                style={{ background: '#F8FAFC', border: '1px solid #CBD2E1', color: '#0F172A' }}
              >
                <History size={14} />
                <span>Historial</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedTemplateForEdit && selectedTemplateForEdit.data && (
        <EditorModal
          key={`${selectedTemplateForEdit.data.idPlantilla}-${selectedTemplateForEdit.data.versionActual?.idVersionPlantilla ?? 'sin-version'}`}
          template={selectedTemplateForEdit}
          onClose={() => setSelectedTemplateForEdit(null)}
          onReload={reload}
        />
      )}

      {openmodalhistoia && (
        <HistorialModal template={openmodalhistoia} onClose={() => setOpenmodalhistoia(null)} />
      )}
    </div>
  );
}

// ============================================================================
// 5. MODAL EDITOR: SPLIT (Univer + Panel de Variables) CON MÁQUINA DE ESTADOS
// ============================================================================

export function EditorModal({
  template,
  onClose,
  onReload,
}: {
  template: PlantillaWithVersionResponse;
  onClose: () => void;
  onReload: () => void;
}) {
  const inputSchema = template?.data?.versionActual?.inputSchema ?? null;
  const versionActual = template?.data?.versionActual ?? null;

  const [draft, setDraft] = useState<DraftMapping>(() =>
    hydrateDraft(inputSchema, template?.data?.versionActual?.mappingConfig ?? null)
  );
  const [activeTarget, setActiveTarget] = useState<ActiveTarget>(null);

  const [snapshot, setSnapshot] = useState<unknown | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [uploading, setUploading] = useState(false);
  const [fileForUpdate, setFileForUpdate] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const univerRef = useRef<UniverSheetHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildRanges = useCallback((): HighlightRange[] => {
    const ranges: HighlightRange[] = [];
    for (const s of draft.scalars) {
      if (s.cell) ranges.push({ sheetName: s.sheet ?? '', a1: s.cell, color: COLOR_SCALAR });
    }
    for (const t of draft.tables) {
      if (!t.startRow) continue;
      for (const c of t.columns) {
        if (c.column) {
          ranges.push({ sheetName: t.sheet ?? '', a1: `${c.column}${t.startRow}`, color: COLOR_COLUMN, isColumn: true });
        }
      }
      ranges.push({ sheetName: t.sheet ?? '', a1: `A${t.startRow}`, color: COLOR_STARTROW });
    }
    return ranges;
  }, [draft]);

  const applyHighlights = useCallback(() => {
    univerRef.current?.highlightRanges(buildRanges());
  }, [buildRanges]);

  const mappedCount = useMemo(() => {
    const scalars = draft.scalars.filter((s) => s.cell).length;
    const cols = draft.tables.reduce(
      (acc, t) => acc + (t.startRow ? t.columns.filter((c) => c.column).length : 0),
      0
    );
    return scalars + cols;
  }, [draft]);

  // 1. Cargar snapshot (backend → Redis/BullMQ) y hacer polling hasta completar
  useEffect(() => {
    let cancelled = false;
    const versionId = versionActual?.idVersionPlantilla;
    const idPlantilla = template?.data?.idPlantilla;
    if (!versionId || !idPlantilla) return;
    const vId: number = versionId;
    const pId: number = idPlantilla;

    async function load() {
      setSnapshotLoading(true);
      setSnapshotError(null);
      const first = await getSnapshot(pId, vId);
      if (cancelled) return;

      if (first.data?.status === 'completed' && first.data.snapshot) {
        setSnapshot(first.data.snapshot);
        setSnapshotLoading(false);
        return;
      }
      if (first.data?.jobId) {
        const jobId = first.data.jobId;
        for (let i = 0; i < 90; i++) {
          await new Promise((res) => setTimeout(res, 1200));
          const r = await pollSnapshotJob(jobId);
          if (cancelled) return;
          if (r.data?.status === 'completed' && r.data.snapshot) {
            setSnapshot(r.data.snapshot);
            setSnapshotLoading(false);
            return;
          }
          if (r.data?.status === 'failed') {
            setSnapshotError(r.data.error ?? 'Error al generar el documento');
            setSnapshotLoading(false);
            return;
          }
        }
        setSnapshotLoading(false);
      } else {
        setSnapshotError(first.error ?? 'No se pudo obtener el documento');
        setSnapshotLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  // 3. Resaltar mapeos existentes en el canvas Univer
  useEffect(() => {
    if (!snapshot) return;
    applyHighlights();
  }, [snapshot, applyHighlights]);

  const handleCellSelect = useCallback((sel: CellSelection) => {
    if (!activeTarget) return;
    setDraft((prev) => {
      const next = deepClone(prev);
      if (activeTarget.kind === 'scalar') {
        const d = next.scalars.find((x) => x.key === activeTarget.key);
        if (d) {
          d.cell = sel.cellAddress;
          d.sheet = sel.sheetName;
        }
      } else if (activeTarget.kind === 'column') {
        const t = next.tables.find((x) => x.key === activeTarget.tableKey);
        if (t) {
          const c = t.columns.find((x) => x.key === activeTarget.key);
          if (c) {
            c.column = columnToLetter(sel.col);
            t.sheet = sel.sheetName || null;
            if (!t.startRow) t.startRow = sel.row + 1;
          }
        }
      } else if (activeTarget.kind === 'startRow') {
        const t = next.tables.find((x) => x.key === activeTarget.tableKey);
        if (t) {
          t.startRow = sel.row + 1;
          t.sheet = sel.sheetName || null;
        }
      }
      return next;
    });
  }, [activeTarget]);

  const unmapScalar = (key: string) => {
    setDraft((prev) => {
      const next = deepClone(prev);
      const d = next.scalars.find((x) => x.key === key);
      if (d) {
        d.cell = null;
        d.sheet = null;
      }
      return next;
    });
    if (activeTarget?.kind === 'scalar' && activeTarget.key === key) setActiveTarget(null);
  };

  const unmapColumn = (tableKey: string, key: string) => {
    setDraft((prev) => {
      const next = deepClone(prev);
      const t = next.tables.find((x) => x.key === tableKey);
      if (t) {
        const c = t.columns.find((x) => x.key === key);
        if (c) c.column = null;
      }
      return next;
    });
    if (activeTarget?.kind === 'column' && activeTarget.key === key) setActiveTarget(null);
  };

  const resetStartRow = (tableKey: string) => {
    setDraft((prev) => {
      const next = deepClone(prev);
      const t = next.tables.find((x) => x.key === tableKey);
      if (t) t.startRow = null;
      return next;
    });
    if (activeTarget?.kind === 'startRow' && activeTarget.tableKey === tableKey) setActiveTarget(null);
  };

  const draftToMappingConfig = (): MappingConfig => {
    const schema = inputSchema;
    return {
      templateId: template?.data?.idPlantilla ?? '',
      templateType: schema?.templateType ?? '',
      version: schema?.version ?? '',
      fileRef: versionActual?.documento?.rutaUrl ?? '',
      mappings: {
        scalars: draft.scalars
          .filter((s) => s.cell)
          .map((s) => ({ key: s.key, cell: s.cell!, dataType: s.dataType, sheet: s.sheet ?? undefined })),
        tables: draft.tables
          .filter((t) => t.startRow)
          .map((t) => ({
            key: t.key,
            startRow: t.startRow!,
            sheet: t.sheet ?? undefined,
            columns: t.columns
              .filter((c) => c.column)
              .map((c) => ({ key: c.key, column: c.column! })),
          })),
      },
    };
  };

  const handleSave = async () => {
    if (!versionActual) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveError(null);
    const mc = draftToMappingConfig();
    const res = await saveMappingConfig({
      versionId: versionActual.idVersionPlantilla,
      version: versionActual.version,
      mappingConfig: mc,
      inputSchema: inputSchema ?? undefined,
    });
    setSaving(false);
    if (res.success) {
      setSaveMsg('Mapeo guardado correctamente.');
      onReload();
      setTimeout(() => setSaveMsg(null), 3500);
    } else {
      setSaveError(res.error ?? 'Error al guardar el mapeo.');
      setTimeout(() => setSaveError(null), 6000);
    }
  };

  const handleActualizarFormato = async () => {
    if (!fileForUpdate || !template?.data) return;
    setUploading(true);
    setUploadMsg(null);
    const res = await crearNuevaVersion({
      idPlantilla: template.data.idPlantilla,
      file: fileForUpdate,
      inputSchema: inputSchema,
      templateType: inputSchema?.templateType,
    });
    setUploading(false);
    if (res.success) {
      setUploadMsg('Nueva versión creada. El mapeo se reinició y se recargará el nuevo formato.');
      setFileForUpdate(null);
      onReload();
      setTimeout(() => setUploadMsg(null), 5000);
    } else {
      setSaveError(res.error ?? 'Error al crear la nueva versión.');
      setTimeout(() => setSaveError(null), 6000);
    }
  };

  const activeLabel = (() => {
    if (!activeTarget) return null;
    if (activeTarget.kind === 'scalar') {
      return draft.scalars.find((s) => s.key === activeTarget.key)?.label ?? 'variable';
    }
    if (activeTarget.kind === 'column') {
      return draft.tables.find((t) => t.key === activeTarget.tableKey)?.columns.find((c) => c.key === activeTarget.key)?.label ?? 'columna';
    }
    return draft.tables.find((t) => t.key === activeTarget.tableKey)?.label ?? 'tabla';
  })();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full h-[95vh] max-w-[1400px] rounded-xl flex flex-col overflow-hidden shadow-2xl bg-white border border-slate-300">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b bg-slate-50 border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Mapeador de Plantilla: {template?.data?.nombre || 'Formato Metrología'}
            </h2>
            <p
              className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                activeTarget ? 'text-blue-700 font-medium' : 'text-slate-500'
              }`}
            >
              {activeTarget ? <MousePointerClick size={11} /> : <Sparkles size={11} />}
              {activeTarget
                ? `Asignando: ${activeLabel} → haz clic en la celda o columna del Excel a la izquierda.`
                : 'Selecciona una variable del panel derecho y luego haz clic en la hoja de cálculo.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? 'Guardando...' : 'Guardar Mapeo'}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mensajes de estado */}
        {(saveMsg || saveError || uploadMsg) && (
          <div
            className="px-4 py-2 text-[12px] font-semibold border-b"
            style={{
              background: saveError ? '#FEF2F2' : '#F0FDF4',
              color: saveError ? '#B91C1C' : '#166534',
              borderColor: saveError ? '#FCA5A5' : '#BBF7D0',
            }}
          >
            {saveError ?? saveMsg ?? uploadMsg}
          </div>
        )}

        {/* Workspace split */}
        <div className="flex-1 flex overflow-hidden">
          {/* Izquierda: Canvas Univer */}
          <div className="flex-1 flex flex-col bg-slate-100 relative overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Documento (versión v{versionActual?.version})
              </span>
              <div className="flex items-center gap-2">
                {snapshotLoading && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <LoaderCircle size={11} className="animate-spin" /> Generando...
                  </span>
                )}
                {!!snapshot && !snapshotLoading && (
                  <StatusBadge tone="mapped">
                    <CheckCircle2 size={10} /> {mappedCount} mapeados
                  </StatusBadge>
                )}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {!versionActual ? (
                <div className="flex items-center justify-center h-full text-sm text-slate-500 bg-white m-4 rounded-lg border border-slate-200 p-6">
                  Esta plantilla aún no tiene una versión con documento asociado.
                </div>
              ) : snapshotError ? (
                <div className="flex items-center justify-center h-full text-sm text-red-600 bg-white m-4 rounded-lg border border-red-200 p-6">
                  <div className="text-center">
                    <AlertCircle size={22} className="mx-auto mb-2" />
                    {snapshotError}
                  </div>
                </div>
              ) : (
                <UniverSheet
                  ref={univerRef}
                  snapshot={snapshot}
                  onCellSelect={handleCellSelect}
                  onReady={applyHighlights}
                />
              )}
            </div>
          </div>

          {/* Derecha: Panel de Variables */}
          <div className="w-[380px] border-l border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto bg-slate-50">
            {/* Banner asistente */}
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 flex gap-2 items-start">
              <MousePointerClick size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-800">¿Cómo mapear?</p>
                <p className="text-[11px] text-blue-700 leading-snug mt-0.5">
                  1. Haz clic en la variable a asignar. 2. Selecciona la celda o columna correspondiente en el Excel a la izquierda.
                </p>
              </div>
            </div>

            {/* Actualizar Formato */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <FileUp size={14} className="text-amber-600" /> Actualizar Formato
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  v{versionActual?.version}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">
                Sube un nuevo .xlsx: se incrementa la versión, se limpia el mapeo y se re-renderiza el documento.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setFileForUpdate(e.target.files?.[0] ?? null)}
              />
              {!fileForUpdate ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Upload size={13} /> Seleccionar archivo .xlsx
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] text-slate-700 truncate font-medium">
                    <CheckCircle2 size={11} className="inline text-emerald-600 mr-1" />
                    {fileForUpdate.name}
                  </span>
                  <button
                    onClick={handleActualizarFormato}
                    disabled={uploading}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploading ? 'Subiendo y versionando...' : 'Crear nueva versión'}
                  </button>
                  <button
                    onClick={() => setFileForUpdate(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 text-left"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            {/* Título de variables */}
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Layers size={14} className="text-blue-600" />
                Estructura del Formulario
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                {mappedCount} Mapeados
              </span>
            </div>

            {!inputSchema ? (
              <div className="p-4 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                Esta versión no tiene un schema de variables (input_schema).
                <br />
                <span className="text-slate-400">Sube una nueva versión con el contrato definido.</span>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* ============ SCALARS ============ */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">Campos Escalares</p>
                    <Tooltip text="💡 Haz clic en la variable y luego selecciona la celda exacta del Excel donde se escribirá el dato (ej: C4)." />
                  </div>
                  {draft.scalars.length === 0 && (
                    <p className="text-[11px] text-slate-400 italic">No hay campos escalares en este contrato.</p>
                  )}
                  {draft.scalars.map((s) => {
                    const esSeleccionada = activeTarget?.kind === 'scalar' && activeTarget.key === s.key;
                    return (
                      <div
                        key={s.key}
                        onClick={() => setActiveTarget({ kind: 'scalar', key: s.key })}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                          esSeleccionada
                            ? 'bg-amber-50/60 border-amber-500 shadow-sm ring-1 ring-amber-500'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-slate-800 leading-snug">{s.label}</span>
                          <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-0.5" style={{ background: COLOR_SCALAR }} />
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between items-center text-[10px] gap-2">
                          <span className="text-slate-500 flex items-center gap-1">
                            {s.dataType}
                            {s.cell && (
                              <StatusBadge tone="mapped">
                                <MapPin size={9} /> Mapeado en {s.cell}
                              </StatusBadge>
                            )}
                            {!s.cell && <StatusBadge tone="pending">Pendiente</StatusBadge>}
                          </span>
                          {s.cell && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                unmapScalar(s.key);
                              }}
                              title="Quitar asignación"
                              className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ============ TABLES ============ */}
                {draft.tables.map((t) => {
                  const schemaTable = inputSchema.fields?.tables.find((x) => x.key === t.key);
                  const esCondicional = !!schemaTable?.dependsOn;
                  return (
                    <div key={t.key} className="flex flex-col gap-2">
                      <div className="sticky top-0 bg-slate-50 py-1 z-10 border-b border-slate-200 flex items-center gap-1.5">
                        <Table size={13} className="text-emerald-600 shrink-0" />
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-tight flex-1">
                          {t.label}
                        </p>
                        <Tooltip
                          text={
                            esCondicional
                              ? '💡 Tabla condicional: solo se llena cuando la bandera asociada está activa. Selecciona la columna para cada dato y define la primera fila de registros.'
                              : '💡 Selecciona la columna para cada dato y define únicamente la primera fila donde inician los registros (startRow).'
                          }
                        />
                      </div>

                      {esCondicional && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          ⚡ Condicional: depende de {schemaTable?.dependsOn?.fieldKey}
                        </span>
                      )}
                      {typeof schemaTable?.maxRowsLimit === 'number' && (
                        <span className="text-[10px] text-slate-400">Hasta {schemaTable.maxRowsLimit} filas.</span>
                      )}

                      {/* Control de fila de inicio */}
                      <div
                        onClick={() => setActiveTarget({ kind: 'startRow', tableKey: t.key })}
                        className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                          activeTarget?.kind === 'startRow' && activeTarget.tableKey === t.key
                            ? 'bg-blue-50/60 border-blue-500 ring-1 ring-blue-500'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-[11px] font-medium text-slate-700">Fila de inicio de registros</span>
                        <span className="flex items-center gap-1.5">
                          {t.startRow ? (
                            <>
                              <StatusBadge tone="info">Fila {t.startRow}</StatusBadge>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetStartRow(t.key);
                                }}
                                className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="Quitar fila de inicio"
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          ) : (
                            <StatusBadge tone="pending">Sin definir</StatusBadge>
                          )}
                        </span>
                      </div>

                      {/* Columnas de la tabla */}
                      <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-emerald-100">
                        {t.columns.map((c) => {
                          const esSeleccionada =
                            activeTarget?.kind === 'column' &&
                            activeTarget.tableKey === t.key &&
                            activeTarget.key === c.key;
                          return (
                            <div
                              key={c.key}
                              onClick={() => setActiveTarget({ kind: 'column', tableKey: t.key, key: c.key })}
                              className={`p-2 rounded-lg border cursor-pointer transition-all ${
                                esSeleccionada
                                  ? 'bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-[11px] font-medium text-slate-800 leading-snug">
                                  {c.dataType === 'OBJECT' ? '▣ ' : ''}
                                  {c.label}
                                </span>
                                <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0 mt-0.5" style={{ background: COLOR_COLUMN }} />
                              </div>
                              <div className="mt-1.5 pt-1 border-t border-slate-100 flex justify-between items-center text-[10px] gap-2">
                                <span className="text-slate-500">
                                  {c.column ? (
                                    <StatusBadge tone="mapped">
                                      Columna {c.column}
                                      {t.startRow ? `, Fila ${t.startRow}` : ''}
                                    </StatusBadge>
                                  ) : (
                                    <StatusBadge tone="pending">Pendiente</StatusBadge>
                                  )}
                                </span>
                                {c.column && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      unmapColumn(t.key, c.key);
                                    }}
                                    title="Quitar asignación"
                                    className="p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 6. MODAL HISTORIAL
// ============================================================================
function HistorialModal({ template, onClose }: { template: TemplateHistoryLog; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="w-full max-w-lg rounded-xl p-4 flex flex-col gap-4 shadow-xl"
        style={{ background: '#FFFFFF', border: '1px solid #CBD2E1' }}
      >
        <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="text-sm font-bold" style={{ color: '#0F172A' }}>
            Historial de Versiones: {template.name}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
          {template.version?.map((log) => (
            <div
              key={log.idVersionPlantilla}
              className="p-3 rounded-lg border flex justify-between items-center"
              style={{ background: '#F8FAFC', borderColor: '#CBD2E1' }}
            >
              <div>
                <span className="text-xs font-bold" style={{ color: '#0F172A' }}>
                  Plantilla {template.name}
                </span>
                <p className="text-[11px]" style={{ color: '#475569' }}>
                  {log.version ? `Versión ${log.version}` : 'Sin versiones'}
                </p>
              </div>
              <span className="text-[10px]" style={{ color: '#64748B' }}>
                {log.createdAt || 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
