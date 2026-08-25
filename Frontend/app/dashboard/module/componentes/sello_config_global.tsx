'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Upload,
  Eye,
  Maximize2,
  Sparkles,
  FileText,
  CheckCircle2,
  Sliders,
  Plus,
  Edit3,
  Trash2,
  Layers,
  Award,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { SealConfig, BoundingBox, WatermarkArea, SelloConfigModalProps } from '@/tipos/sellos';
import {
  obtenerPlantillasSellos,
  crearPlantillaSello,
  actualizarPlantillaSello,
  eliminarPlantillaSello,
} from '@/app/action_module/sellos';

// ============================================================================
// 1. VISOR DE PLANTILLA CON PDF.JS (object-fit: contain + matriz normalizada)
// ============================================================================

const VIEWPORT_MAX_WIDTH = 520;
const VIEWPORT_MAX_HEIGHT = 700;

interface PageSize {
  width: number;
  height: number;
}

export interface ViewportTransform {
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
}

function computeContainBox(
  pageWidth: number,
  pageHeight: number,
  maxWidth: number = VIEWPORT_MAX_WIDTH,
  maxHeight: number = VIEWPORT_MAX_HEIGHT
): { width: number; height: number } {
  const ratio = pageWidth / pageHeight;
  let width = maxHeight * ratio;
  let height = maxHeight;
  if (width > maxWidth) {
    width = maxWidth;
    height = maxWidth / ratio;
  }
  return { width, height };
}

function buildTransform(page: PageSize, box: { width: number; height: number }): ViewportTransform {
  return {
    scaleX: box.width / page.width,
    scaleY: box.height / page.height,
    translateX: 0,
    translateY: 0,
  };
}

/** Codifica una key de MinIO preservando las "/" como separadores de ruta. */
function encodeObjectKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function configurePdfWorker(): Promise<typeof import('pdfjs-dist')> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      const mod = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = mod.default;
    } catch {
      // Sin worker: pdf.js cae a main-thread (fake worker).
    }
  }
  return pdfjs;
}

/**
 * Renderiza la página 1 del PDF de plantilla sobre un <canvas> con escala
 * "contain" exacta. Reporta el tamaño real de la página (en puntos) vía onSize.
 * Usa el proxy del backend (/api/v1/pdf/ver/*) para evitar problemas de CORS.
 */
function PdfTemplateCanvas({
  source,
  onSize,
}: {
  source: File | string;
  onSize: (size: PageSize) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      let data: ArrayBuffer;
      try {
        data =
          source instanceof File
            ? await source.arrayBuffer()
            : await (await fetch(source)).arrayBuffer();
      } catch {
        return;
      }
      if (cancelled) return;

      const pdfjs = await configurePdfWorker();
      const loadingTask = pdfjs.getDocument({ data });
      const doc = await loadingTask.promise;
      try {
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        const size: PageSize = { width: base.width, height: base.height };
        const box = computeContainBox(size.width, size.height);
        if (cancelled) return;

        const dpr = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: (box.width / size.width) * dpr });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${box.width}px`;
        canvas.style.height = `${box.height}px`;

        await page.render({ canvas, viewport }).promise;
        if (!cancelled) onSize(size);
      } finally {
        await loadingTask.destroy();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [source, onSize]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// ============================================================================
// 2. COMPONENTE PADRE: GESTOR Y GALERÍA DE SELLOS
// ============================================================================

function SelloManagementDashboard() {
  // Estado local vinculado a la API (sin sincronizadoRef / doble source of truth).
  const [seals, setSeals] = useState<SealConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Estado para controlar qué sello se está editando en el modal (null = cerrado)
  const [editingSeal, setEditingSeal] = useState<SealConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  const applySellosResult = useCallback((res: Awaited<ReturnType<typeof obtenerPlantillasSellos>>) => {
    if (res.success && res.data) {
      setSeals(res.data);
    } else {
      setError(res.error ?? 'Error al cargar los sellos');
    }
    setLoading(false);
  }, []);

  const fetchSellos = useCallback(async () => {
    applySellosResult(await obtenerPlantillasSellos());
  }, [applySellosResult]);

  useEffect(() => {
    let active = true;
    obtenerPlantillasSellos().then((res) => {
      if (!active) return;
      applySellosResult(res);
    });
    return () => {
      active = false;
    };
  }, [applySellosResult]);

  // Abrir modal para CREAR un nuevo sello
  const handleCreateNew = () => {
    setEditingSeal({
      id: -Date.now(),
      nombre: 'Nueva Plantilla de Sello',
      descripcion: 'Descripción del área de sellado',
      templatePdfKey: null,
      templatePdfUrl: null,
      documentArea: null,
      watermarkAreas: [],
    });
    setIsModalOpen(true);
  };

  // Abrir modal para EDITAR un sello existente
  const handleEdit = (seal: SealConfig) => {
    setEditingSeal(seal);
    setIsModalOpen(true);
  };

  // Eliminar un sello del catálogo (llamada real a la API)
  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar este sello de la base de datos?')) return;
    const res = await eliminarPlantillaSello(id);
    if (res.success) {
      fetchSellos();
    } else {
      alert(res.error ?? 'Error al eliminar el sello');
    }
  };

  // Guardar/Actualizar la configuración procesada por el Modal (llamada real a la API)
  const handleSaveSeal = async (updatedConfig: SealConfig, templateFile?: File | null) => {
    const res =
      updatedConfig.id < 0
        ? await crearPlantillaSello(updatedConfig, templateFile ?? undefined)
        : await actualizarPlantillaSello(updatedConfig.id, updatedConfig, templateFile ?? undefined);

    if (res.success) {
      await fetchSellos();
      setIsModalOpen(false);
      setEditingSeal(null);
    } else {
      alert(res.error ?? 'Error al guardar la configuración');
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabecera del Módulo */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Award className="text-blue-600" /> Catálogo de Sellos y Plantillas Base
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Gestiona las coordenadas de inserción de certificados y las marcas de agua registradas en el sistema.
            </p>
          </div>

          <button
            onClick={handleCreateNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            <Plus size={16} /> Crear Nueva Plantilla
          </button>
        </div>

        {/* Estados de carga / error / vacío / grid */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-10 h-10 text-slate-300 animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Cargando sellos...</p>
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
            <AlertTriangle className="w-10 h-10 text-red-400" />
            <p className="text-sm font-semibold text-red-700">{error}</p>
            <button
              onClick={() => {
                setLoading(true);
                setError(null);
                void fetchSellos();
              }}
              className="mt-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-2 rounded-lg"
            >
              Reintentar
            </button>
          </div>
        ) : seals.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
            <Layers className="w-12 h-12 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No hay sellos ni plantillas configuradas</p>
            <p className="text-xs text-slate-400">Crea un nuevo registro para mapear coordenadas de documentos.</p>
            <button
              onClick={handleCreateNew}
              className="mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-2 rounded-lg"
            >
              Agregar Primer Sello
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seals.map((seal) => (
              <div
                key={seal.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                {/* Visualizador Miniatura de Coordenadas Bounding Box */}
                <div className="h-48 bg-slate-800 relative flex items-center justify-center overflow-hidden border-b border-slate-200">
                  {seal.templatePdfUrl ? (
                    <div className="w-full h-full relative">
                      <iframe
                        src={seal.templatePdfUrl}
                        title={seal.nombre}
                        loading="lazy"
                        className="absolute inset-0 w-full h-full border-none pointer-events-none"
                      />
                      {/* Render de BoundingBox: Document Area */}
                      {seal.documentArea && (
                        <div
                          className="absolute border border-blue-400 bg-blue-500/30 flex items-center justify-center"
                          style={{
                            left: `${seal.documentArea.x}%`,
                            top: `${seal.documentArea.y}%`,
                            width: `${seal.documentArea.width}%`,
                            height: `${seal.documentArea.height}%`,
                          }}
                        >
                          <span className="text-[9px] bg-blue-900/90 text-white px-1 rounded font-mono">
                            Documento
                          </span>
                        </div>
                      )}

                      {/* Render de BoundingBox: Sellos / Watermarks */}
                      {seal.watermarkAreas.map((wm) => (
                        <div
                          key={wm.id}
                          className="absolute border border-amber-400"
                          style={{
                            left: `${wm.box.x}%`,
                            top: `${wm.box.y}%`,
                            width: `${wm.box.width}%`,
                            height: `${wm.box.height}%`,
                            backgroundColor: `rgba(245, 158, 11, ${wm.opacity})`,
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-4 text-slate-400">
                      <Upload className="w-8 h-8 mx-auto mb-1 opacity-50" />
                      <span className="text-[11px]">Sin Plantilla Base</span>
                    </div>
                  )}
                </div>

                {/* Info Card */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{seal.nombre}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                      {seal.descripcion || 'Sin descripción asignada.'}
                    </p>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                        seal.documentArea
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {seal.documentArea ? 'Área Documento OK' : 'Sin Área Mapeada'}
                      </span>

                      <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200">
                        {seal.watermarkAreas.length} Sellos / Marcas
                      </span>
                    </div>
                  </div>

                  {/* Acciones de Tarjeta */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-mono">
                      Editado: {seal.updatedAt || 'Reciente'}
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEdit(seal)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Editar Mapeo y Sellos"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(seal.id)}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Eliminar Registro"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Renderizado Condicional del Modal Editor */}
      {isModalOpen && editingSeal && (
        <SelloConfigModal
          sealData={editingSeal}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveSeal}
        />
      )}
    </div>
  );
}

// ============================================================================
// 3. COMPONENTE HIJO: MODAL EDITOR DE COORDENADAS (MAPPER & PREVIEW)
// ============================================================================

export function SelloConfigModal({ sealData, onClose, onSave }: SelloConfigModalProps) {
  const [activeTab, setActiveTab] = useState<'MAPPER' | 'PREVIEW'>('MAPPER');

  // Estado local para la edición activa
  const [config, setConfig] = useState<SealConfig>(sealData);

  // Modo de dibujo: 'DOC_AREA' (Zona de documento) o 'WATERMARK' (Sello u opacidad)
  const [drawMode, setDrawMode] = useState<'DOC_AREA' | 'WATERMARK'>('DOC_AREA');
  const [selectedWatermarkId, setSelectedWatermarkId] = useState<string | null>(null);

  // Estados para simulación de arrastre/dibujo
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);

  // Documento cliente de prueba (preview)
  const [sampleDocUrl, setSampleDocUrl] = useState<string | null>(null);
  // Archivo de plantilla seleccionado para enviar al backend en el guardado
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Tamaño real de la página de la plantilla (puntos) y viewport "contain".
  const [pageSize, setPageSize] = useState<PageSize | null>(null);
  const renderBox = useMemo(() => {
    if (pageSize) return computeContainBox(pageSize.width, pageSize.height);
    return { width: VIEWPORT_MAX_WIDTH, height: VIEWPORT_MAX_HEIGHT };
  }, [pageSize]);
  const viewportTransform = useMemo<ViewportTransform | null>(() => {
    if (!pageSize) return null;
    return buildTransform(pageSize, renderBox);
  }, [pageSize, renderBox]);

  const handlePageSize = useCallback((size: PageSize) => {
    setPageSize(size);
  }, []);

  // Fuente de bytes para el visor: archivo nuevo (blob) o key vía proxy del backend.
  const renderSource = useMemo<File | string | null>(() => {
    if (templateFile) return templateFile;
    if (config.templatePdfKey) return `/api/v1/pdf/ver/${encodeObjectKey(config.templatePdfKey)}`;
    if (config.templatePdfUrl) return config.templatePdfUrl;
    return null;
  }, [templateFile, config.templatePdfKey, config.templatePdfUrl]);

  const hasTemplate = !!config.templatePdfUrl || !!templateFile;

  // Refs espejo para los listeners globales de arrastre (sin closures obsoletos)
  const isDrawingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const currentBoxRef = useRef<BoundingBox | null>(null);
  const drawModeRef = useRef<'DOC_AREA' | 'WATERMARK'>('DOC_AREA');
  const configRef = useRef<SealConfig>(sealData);
  // Registro de URLs blob para revocarlas al reemplazar/desmontar (evita memory leaks)
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

  useEffect(() => {
    currentBoxRef.current = currentBox;
  }, [currentBox]);

  const createBlobUrl = useCallback((file: File): string => {
    const url = URL.createObjectURL(file);
    blobUrlsRef.current.push(url);
    return url;
  }, []);

  const revokeBlobUrl = useCallback((url: string | null | undefined) => {
    if (!url || !url.startsWith('blob:')) return;
    URL.revokeObjectURL(url);
    blobUrlsRef.current = blobUrlsRef.current.filter((u) => u !== url);
  }, []);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateFile(file);
    revokeBlobUrl(config.templatePdfUrl);
    const url = createBlobUrl(file);
    setConfig((prev) => ({ ...prev, templatePdfUrl: url }));
  };

  const handleSampleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    revokeBlobUrl(sampleDocUrl);
    const url = createBlobUrl(file);
    setSampleDocUrl(url);
  };

  const getCanvasCoordinates = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    };
  }, []);

  // Listeners GLOBALES de arrastre: no se pierde el trazo si el ratón sale del canvas
  const onMouseMove = useCallback(
    (e: globalThis.MouseEvent) => {
      if (!isDrawingRef.current || !startPosRef.current) return;
      const coords = getCanvasCoordinates(e.clientX, e.clientY);
      if (!coords) return;
      const start = startPosRef.current;
      const box: BoundingBox = {
        x: Math.min(start.x, coords.x),
        y: Math.min(start.y, coords.y),
        width: Math.abs(coords.x - start.x),
        height: Math.abs(coords.y - start.y),
      };
      currentBoxRef.current = box;
      setCurrentBox(box);
    },
    [getCanvasCoordinates]
  );

  const onMouseUp = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    const box = currentBoxRef.current;
    startPosRef.current = null;
    currentBoxRef.current = null;
    setCurrentBox(null);
    setIsDrawing(false);

    if (!box || box.width < 2 || box.height < 2) return;

    const mode = drawModeRef.current;
    if (mode === 'DOC_AREA') {
      setConfig((prev) => ({ ...prev, documentArea: box }));
    } else {
      const newWatermark: WatermarkArea = {
        id: `wm_${Date.now()}`,
        label: `Sello ${configRef.current.watermarkAreas.length + 1}`,
        box,
        opacity: 0.8,
      };
      setConfig((prev) => ({
        ...prev,
        watermarkAreas: [...prev.watermarkAreas, newWatermark],
      }));
      setSelectedWatermarkId(newWatermark.id);
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!config.templatePdfUrl) return;
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (!coords) return;

    startPosRef.current = coords;
    isDrawingRef.current = true;
    setIsDrawing(true);
    const box: BoundingBox = { x: coords.x, y: coords.y, width: 0, height: 0 };
    currentBoxRef.current = box;
    setCurrentBox(box);
  };

  // Adjunta listeners globales de arrastre mientras isDrawing esté activo;
  // se limpian automáticamente al soltar (mouseup) o al desmontar.
  useEffect(() => {
    if (!isDrawing) return;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDrawing, onMouseMove, onMouseUp]);

  // Limpieza al desmontar: URLs blob (evita memory leaks)
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      blobUrlsRef.current = [];
    };
  }, []);

  const handleOpacityChange = (id: string, newOpacity: number) => {
    setConfig((prev) => ({
      ...prev,
      watermarkAreas: prev.watermarkAreas.map((wm) =>
        wm.id === id ? { ...wm, opacity: newOpacity } : wm
      ),
    }));
  };

  const handleRemoveWatermark = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      watermarkAreas: prev.watermarkAreas.filter((wm) => wm.id !== id),
    }));
    if (selectedWatermarkId === id) setSelectedWatermarkId(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full h-[95vh] max-w-7xl rounded-xl flex flex-col overflow-hidden shadow-2xl bg-white border border-slate-300">
        
        {/* Header Modal */}
        <div className="flex justify-between items-center px-4 py-3 border-b bg-slate-50 border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Configurador de Plantilla y Bounding Boxes
            </h2>
            <p className="text-[11px] text-slate-500">
              Identificador:{' '}
              <span className="font-mono text-slate-700">
                {config.id < 0 ? 'Nuevo (sin guardar)' : config.id}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('MAPPER')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'MAPPER' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Maximize2 size={13} /> Mapear Cuadrícula
            </button>
            <button
              onClick={() => setActiveTab('PREVIEW')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'PREVIEW' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={13} /> Previsualizar Certificado
            </button>
          </div>

          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* TAB 1: MAPPER */}
          {activeTab === 'MAPPER' && (
            <>
              {/* Canvas Izquierda */}
              <div className="flex-1 p-4 bg-slate-100 flex items-center justify-center relative overflow-auto select-none">
                {hasTemplate ? (
                  <div
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    className="relative bg-white shadow-lg rounded border border-slate-300 overflow-hidden cursor-crosshair"
                    style={{ width: renderBox.width, height: renderBox.height }}
                  >
                    {renderSource && (
                      <PdfTemplateCanvas source={renderSource} onSize={handlePageSize} />
                    )}
                    {/* Render Area Documento */}
                    {config.documentArea && (
                      <div
                        className="absolute border-2 border-blue-600 bg-blue-500/20 flex items-center justify-center text-blue-900 font-bold text-xs shadow-sm"
                        style={{
                          left: `${config.documentArea.x}%`,
                          top: `${config.documentArea.y}%`,
                          width: `${config.documentArea.width}%`,
                          height: `${config.documentArea.height}%`,
                        }}
                      >
                        <span className="bg-white/90 px-2 py-0.5 rounded border border-blue-300 text-[10px] font-mono shadow-sm">
                          Área Documento ({Math.round(config.documentArea.width)}% x {Math.round(config.documentArea.height)}%)
                        </span>
                      </div>
                    )}

                    {/* Render Marcas/Sellos */}
                    {config.watermarkAreas.map((wm) => (
                      <div
                        key={wm.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWatermarkId(wm.id);
                        }}
                        className={`absolute border-2 border-amber-500 transition-all ${
                          selectedWatermarkId === wm.id ? 'ring-2 ring-amber-400 border-amber-600' : ''
                        }`}
                        style={{
                          left: `${wm.box.x}%`,
                          top: `${wm.box.y}%`,
                          width: `${wm.box.width}%`,
                          height: `${wm.box.height}%`,
                          backgroundColor: `rgba(245, 158, 11, ${wm.opacity})`,
                        }}
                      >
                        <span className="absolute top-1 left-1 bg-amber-900/80 text-white text-[9px] px-1 rounded font-mono">
                          {wm.label} ({(wm.opacity * 100).toFixed(0)}%)
                        </span>
                      </div>
                    ))}

                    {/* Feedback al dibujar */}
                    {isDrawing && currentBox && (
                      <div
                        className={`absolute border-2 border-dashed ${
                          drawMode === 'DOC_AREA'
                            ? 'border-blue-500 bg-blue-500/30'
                            : 'border-amber-500 bg-amber-500/30'
                        }`}
                        style={{
                          left: `${currentBox.x}%`,
                          top: `${currentBox.y}%`,
                          width: `${currentBox.width}%`,
                          height: `${currentBox.height}%`,
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 bg-white border-2 border-dashed border-slate-300 rounded-xl gap-3">
                    <Upload className="w-10 h-10 text-slate-400" />
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-800">Cargar Imagen o PDF de la Plantilla Sello</p>
                      <p className="text-[11px] text-slate-500">Formatos soportados: PNG, JPG, PDF</p>
                    </div>
                    <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors">
                      Seleccionar Archivo
                      <input type="file" accept="image/*,.pdf" onChange={handleTemplateUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {/* Controles Derecha */}
              <div className="w-96 border-l border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto bg-slate-50">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase">Nombre de la Plantilla</label>
                  <input
                    type="text"
                    value={config.nombre}
                    onChange={(e) => setConfig((prev) => ({ ...prev, nombre: e.target.value }))}
                    className="w-full mt-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold text-slate-600">Herramienta de Trazo:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setDrawMode('DOC_AREA')}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                        drawMode === 'DOC_AREA'
                          ? 'bg-blue-50 border-blue-600 ring-1 ring-blue-600'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <FileText size={16} className="text-blue-600" />
                      <span className="text-xs font-bold text-slate-800">Zona Documento</span>
                    </button>

                    <button
                      onClick={() => setDrawMode('WATERMARK')}
                      className={`p-2.5 rounded-lg border text-left flex flex-col gap-1 transition-all ${
                        drawMode === 'WATERMARK'
                          ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <Sparkles size={16} className="text-amber-600" />
                      <span className="text-xs font-bold text-slate-800">Zona Sello/Opacidad</span>
                    </button>
                  </div>
                </div>

                {/* Info Estado Documento */}
                <div className="p-3 bg-white border border-slate-200 rounded-lg flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Área de Inserción</span>
                    {config.documentArea ? (
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={10} /> Mapeado
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        Pendiente
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {viewportTransform
                      ? `Escala ${viewportTransform.scaleX.toFixed(2)}x / ${viewportTransform.scaleY.toFixed(2)}x · página ${pageSize?.width.toFixed(0)}×${pageSize?.height.toFixed(0)} pt`
                      : 'Normalizando viewport...'}
                  </span>
                </div>

                {/* Lista de Sellos Mapeados */}
                <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                  <span className="text-xs font-bold text-slate-800">Sellos y Opacidades ({config.watermarkAreas.length})</span>
                  {config.watermarkAreas.map((wm) => (
                    <div
                      key={wm.id}
                      className={`p-2.5 bg-white border rounded-lg flex flex-col gap-2 ${
                        selectedWatermarkId === wm.id ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">{wm.label}</span>
                        <button
                          onClick={() => handleRemoveWatermark(wm.id)}
                          className="text-red-500 hover:text-red-700 text-[11px]"
                        >
                          Eliminar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Sliders size={12} className="text-slate-500" />
                        <input
                          type="range"
                          min="0.1"
                          max="1"
                          step="0.05"
                          value={wm.opacity}
                          onChange={(e) => handleOpacityChange(wm.id, parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[10px] font-mono w-8 text-right">
                          {(wm.opacity * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => onSave(config, templateFile)}
                  className="mt-auto bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  Guardar Configuración en Base de Datos
                </button>
              </div>
            </>
          )}

          {/* TAB 2: PREVIEW */}
          {activeTab === 'PREVIEW' && (
            <div className="flex-1 flex bg-slate-100 overflow-hidden">
              <div className="flex-1 p-4 flex items-center justify-center">
                {hasTemplate ? (
                  <div
                    className="relative bg-white shadow-2xl rounded border border-slate-300 overflow-hidden"
                    style={{ width: renderBox.width, height: renderBox.height }}
                  >
                    {renderSource && (
                      <PdfTemplateCanvas source={renderSource} onSize={handlePageSize} />
                    )}
                    {config.documentArea && (
                      <div
                        className="absolute overflow-hidden bg-slate-200 border border-slate-400/50 shadow-inner"
                        style={{
                          left: `${config.documentArea.x}%`,
                          top: `${config.documentArea.y}%`,
                          width: `${config.documentArea.width}%`,
                          height: `${config.documentArea.height}%`,
                        }}
                      >
                        {sampleDocUrl ? (
                          <iframe src={sampleDocUrl} className="w-full h-full border-none" title="Documento de Prueba" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                            <FileText size={24} className="mb-1" />
                            <span className="text-[11px]">Sube un certificado de prueba para validar en el canvas</span>
                          </div>
                        )}
                      </div>
                    )}

                    {config.watermarkAreas.map((wm) => (
                      <div
                        key={wm.id}
                        className="absolute pointer-events-none backdrop-blur-[1px]"
                        style={{
                          left: `${wm.box.x}%`,
                          top: `${wm.box.y}%`,
                          width: `${wm.box.width}%`,
                          height: `${wm.box.height}%`,
                          backgroundColor: `rgba(255, 255, 255, ${1 - wm.opacity})`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Primero sube una plantilla base en el mapeador.</p>
                )}
              </div>

              <div className="w-80 border-l border-slate-200 p-4 bg-slate-50 flex flex-col gap-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b pb-2">
                  Prueba de Integración
                </span>
                <label className="cursor-pointer bg-white border border-slate-300 hover:border-slate-400 p-3 rounded-lg flex flex-col items-center justify-center gap-1.5 text-center">
                  <Upload size={18} className="text-slate-500" />
                  <span className="text-xs font-semibold text-slate-700">Subir Certificado Muestra</span>
                  <input type="file" accept="image/*,.pdf" onChange={handleSampleDocUpload} className="hidden" />
                </label>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default SelloManagementDashboard;
