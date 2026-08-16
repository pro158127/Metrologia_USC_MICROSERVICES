'use client';

import React, { useState, useRef, useEffect, useMemo, MouseEvent } from 'react';
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
  Award
} from 'lucide-react';
import type { SealConfig, BoundingBox, WatermarkArea, SelloConfigModalProps } from '@/tipos/sellos';
import type { SelloModel } from '@/tipos/entidades';
import { useDbTable, useDbActions } from '@/app/componets/tables_recharge';

// ============================================================================
// 2. COMPONENTE PADRE: GESTOR Y GALERÍA DE SELLOS
// ============================================================================

function SelloManagementDashboard() {
  const sellosStore = useDbTable('sellos');
  const { loadTable } = useDbActions();

  // Estado local que sincroniza los registros de la Base de Datos
  const [seals, setSeals] = useState<SealConfig[]>([]);
  const sincronizadoRef = useRef(false);

  // Mapeo de SelloModel → SealConfig
  const sellosMapeados = useMemo<SealConfig[]>(
    () =>
      sellosStore.map((s) => ({
        id: String(s.idSello),
        nombre: s.nombre,
        templatePdfUrl: null,
        documentArea: null,
        watermarkAreas: [],
      })),
    [sellosStore]
  );

  // Cargar sellos desde el store
  useEffect(() => {
    loadTable('sellos');
  }, [loadTable]);

  // Inicializar el estado local una sola vez cuando el store tenga datos
  useEffect(() => {
    if (sincronizadoRef.current) return;
    if (sellosMapeados.length > 0) {
      setSeals(sellosMapeados);
      sincronizadoRef.current = true;
    }
  }, [sellosMapeados]);

  // Estado para controlar qué sello se está editando en el modal (null = cerrado)
  const [editingSeal, setEditingSeal] = useState<SealConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Abrir modal para CREAR un nuevo sello
  const handleCreateNew = () => {
    setEditingSeal({
      id: `sello_${Date.now()}`,
      nombre: 'Nueva Plantilla de Sello',
      descripcion: 'Descripción del área de sellado',
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

  // Eliminar un sello del catálogo
  const handleDelete = (id: string) => {
    if (confirm('¿Estás seguro de eliminar este sello de la base de datos?')) {
      setSeals((prev) => prev.filter((s) => s.id !== id));
    }
  };

  // Guardar/Actualizar la configuración procesada por el Modal
  const handleSaveSeal = (updatedConfig: SealConfig) => {
    setSeals((prev) => {
      const exists = prev.some((s) => s.id === updatedConfig.id);
      if (exists) {
        return prev.map((s) =>
          s.id === updatedConfig.id
            ? { ...updatedConfig, updatedAt: new Date().toISOString().split('T')[0] }
            : s
        );
      }
      return [
        ...prev,
        { ...updatedConfig, updatedAt: new Date().toISOString().split('T')[0] },
      ];
    });

    loadTable('sellos');

    setIsModalOpen(false);
    setEditingSeal(null);
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

        {/* Grid de Sellos Guardados */}
        {seals.length === 0 ? (
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
                    <div
                      className="w-full h-full relative"
                      style={{
                        backgroundImage: `url(${seal.templatePdfUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    >
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
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);

  // Documento cliente de prueba
  const [sampleDocUrl, setSampleDocUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setConfig((prev) => ({ ...prev, templatePdfUrl: url }));
    }
  };

  const handleSampleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setSampleDocUrl(url);
    }
  };

  const getCanvasCoordinates = (e: MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!config.templatePdfUrl) return;
    const coords = getCanvasCoordinates(e);
    setStartPos(coords);
    setIsDrawing(true);
    setCurrentBox({ x: coords.x, y: coords.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPos) return;
    const coords = getCanvasCoordinates(e);
    
    const x = Math.min(startPos.x, coords.x);
    const y = Math.min(startPos.y, coords.y);
    const width = Math.abs(coords.x - startPos.x);
    const height = Math.abs(coords.y - startPos.y);

    setCurrentBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);

    if (currentBox.width < 2 || currentBox.height < 2) {
      setCurrentBox(null);
      return;
    }

    if (drawMode === 'DOC_AREA') {
      setConfig((prev) => ({ ...prev, documentArea: currentBox }));
    } else {
      const newWatermark: WatermarkArea = {
        id: `wm_${Date.now()}`,
        label: `Sello ${config.watermarkAreas.length + 1}`,
        box: currentBox,
        opacity: 0.8,
      };
      setConfig((prev) => ({
        ...prev,
        watermarkAreas: [...prev.watermarkAreas, newWatermark],
      }));
      setSelectedWatermarkId(newWatermark.id);
    }

    setCurrentBox(null);
    setStartPos(null);
  };

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
              Identificador: <span className="font-mono text-slate-700">{config.id}</span>
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
                {config.templatePdfUrl ? (
                  <div
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className="relative w-[500px] h-[700px] bg-white shadow-lg rounded border border-slate-300 overflow-hidden cursor-crosshair"
                    style={{
                      backgroundImage: `url(${config.templatePdfUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
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
                  onClick={() => onSave(config)}
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
                {config.templatePdfUrl ? (
                  <div
                    className="relative w-[500px] h-[700px] bg-white shadow-2xl rounded border border-slate-300 overflow-hidden"
                    style={{
                      backgroundImage: `url(${config.templatePdfUrl})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
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