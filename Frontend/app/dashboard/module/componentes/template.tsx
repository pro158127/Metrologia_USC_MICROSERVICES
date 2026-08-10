'use client';

import React, { useEffect, useState ,useRef,useMemo} from 'react';
import { 
  FileSpreadsheet, 
  History, 
  Edit3, 
  LoaderCircle,
  X, 
  Save, 
  Upload, 
  AlertCircle, 
  CheckCircle2, 
  Layers ,Table,MousePointerClick
} from 'lucide-react';
import dynamic from 'next/dynamic';


// ============================================================================
// 1. TIPOS E INTERFACES DEL DOMINIO
// ============================================================================
export type DataType = 'text' | 'number' | 'currency' | 'date' | 'option';

// 1. Identificar: Interfaz de Props expuestas al Padre
interface UniverSheetProps {
  initialData?: PlantillaWithVersionResponse;
  activeVariable: SystemVariable | null; // 👈 Variable activa del menú lateral
  onCellSelected: (mapping: CellMapping) => void; // 👈 Callback para notificar al padre
}

const UniverSheet = dynamic(
  () => import('@/app/dashboard/module/componentes/UniverSheetCompoenete').then((mod) => mod.UniverSheet),
  {
    ssr: false, // Esto evita el renderizado en servidor
    loading: () => (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '500px' 
      }}>
        <p>Cargando la hoja de cálculo...</p>
      </div>
    ),
  }
);


export interface CellMapping {
  variableId: string;
  sheetName: string;
  row: number;
  col: number;
  cellAddress: string;
  type?: 'SINGLE_FIELD' | 'TABLE_FIELD';
  mappedRange?: {
    startRow: number;
    endRow: number;
    startColumn: number;
    endColumn: number;
  };
}

export interface PlantillaWithVersionResponse {
  success: boolean;
  data?: {
    idPlantilla: number;
    nombre: string;
    modulo: string;
    activa: boolean;
    versionActual: {
      idVersionPlantilla: number;
      version: number;
      mapeoExcelJson: any;
      createdAt: Date;
      documento: {
        idDocumento: number;
        nombre: string;
        rutaUrl: string;
        proveedor: string;
        mimeType: string;
      } | null;
    } | null;
  };
  error?: string;
}


export interface TemplateHistoryLog {
  name:string;
  id_plantilla: number;
  version: {
      idVersionPlantilla: number;
      version: number;
      mapeoExcelJson: any;
      createdAt: string;
      createby:string;
    }[] | null;

}


// ============================================================================
// 2. COMPONENTE PRINCIPAL (PADRE)
// ============================================================================
import { getTodasLasPlantillasCompletas } from '@/app/action_module/template';
import { wrap } from 'module';
import { url } from 'inspector';
export default function TemplatesMappingPage() {
  // Estado de plantillas
  const [templates,setTemplates] = useState<PlantillaWithVersionResponse[]>();

  // Filtros de búsqueda (idéntico al estilo provisto)
  const [busqueda, setBusqueda] = useState('');

  // Control de Modales
  const [selectedTemplateForEdit, setSelectedTemplateForEdit] = useState<PlantillaWithVersionResponse | null|false>(null);
  const [HistoryFromTemplate, setSelectedTemplateForHistory] = useState<Record<number, TemplateHistoryLog> | null|undefined>(null);
  const [openmodalhistoia,setOpenmodalhistoia]=useState<TemplateHistoryLog|null>(null);
  const plantillasFiltradas = templates?.filter((t) =>
    t.data?.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  

useEffect(() => {
     async function preload() {
        console.log("inciados procesos de pre load platillas")
        try {
          const load = await getTodasLasPlantillasCompletas();
          console.log(load,"aqui essEE")
          if (load.success) {
            //historias 
          const formarteo_history = load.data?.reduce<Record<number, TemplateHistoryLog>>((acc, p) => {
        acc[p.idPlantilla] = {
          name: p.nombre,
          id_plantilla: p.idPlantilla,
          version: p.versiones.map((n) => ({
            idVersionPlantilla: n.idPlantilla,
            version: n.version,
            mapeoExcelJson: n.mapeoExcelJson,
            createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
            createby: typeof n.createdby === 'string' ? n.createdby : n.createdby?.nombre ?? '',
          })),
        };
        return acc;
      }, {}) ?? {};

            const formarteo = load.data?.map((p): PlantillaWithVersionResponse => {
              const ultimaVersion = p.versiones[p.versiones.length - 1];
              console.log(ultimaVersion)
              return {
                success: true,
                data: {
                  idPlantilla: p.idPlantilla,
                  activa: p.activa,
                  modulo: p.modulo,
                  nombre: p.modulo,
                  versionActual: ultimaVersion
                    ? {
                        idVersionPlantilla: ultimaVersion.idPlantilla,
                        version: ultimaVersion.version,
                        mapeoExcelJson: ultimaVersion.mapeoExcelJson,
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
                error: "",
              };
            });
            console.log(formarteo)
            return {formateo:formarteo,historia_template:formarteo_history};
          } else {
            console.log("error");
            return undefined;
          }
        } catch (error) {
            console.log("Error posible de conexion con base de datos", error);
            return undefined;
        }
     }

     preload().then((result) => {
       setTemplates(result?.formateo);
       setSelectedTemplateForHistory(result?.historia_template);
     });
},[])



  return (
    <div className="w-full px-2 md:px-0 py-4">
      {/* Alerta Informativa */}
      <div 
        className="flex items-start md:items-center gap-3 p-3.5 mb-5 rounded-xl" 
        style={{ background: "#F8FAFC", border: "1px solid #CBD2E1" }}
      >
        <Layers size={18} color="#0F172A" className="shrink-0 mt-0.5 md:mt-0" />
        <span style={{ color: "#1E293B", fontSize: 13, fontWeight: 500, lineHeight: "1.4" }}>
          Gestión de Plantillas de Excel y Editor de Mapeo de Variables para Procesamiento Automatizado.
        </span>
      </div>

      {/* Panel de Filtros Responsivo */}
      <div className="flex flex-col gap-3 mb-5 p-4 rounded-xl" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#1E293B" }}>
          Buscar Plantilla de Excel
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label style={{ color: "#1E293B", fontSize: 12, fontWeight: 600 }}>Nombre / Descripción</label>
            <input
              type="text"
              placeholder="Buscar plantilla..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg text-slate-900 placeholder:text-slate-400"
              style={{
                border: "1px solid #CBD2E1",
                fontSize: 13,
                outline: "none",
                background: "#FFFFFF",
                color: "#0F172A",
              }}
            />
          </div>
        </div>
      </div>

      {/* Grid de Tarjetas de Plantillas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {plantillasFiltradas?.map((tpl) => (
          <div
            key={tpl.data?.idPlantilla}
            className="p-4 rounded-xl flex flex-col justify-between"
            style={{ background: "#FFFFFF", border: "1px solid #CBD2E1" }}
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-base" style={{ color: "#0F172A" }}>
                  {tpl.data?.nombre}
                </h3>
                <span
                  className="px-2 py-0.5 rounded text-xs font-bold"
                  style={{ background: "#F1F5F9", color: "#1E293B", border: "1px solid #CBD2E1" }}
                >
                  v{tpl.data?.versionActual?.version}
                </span>
              </div>
              <p className="text-xs mb-4" style={{ color: "#475569" }}>
                {tpl.data?.versionActual?.documento?.nombre}
              </p>
            </div>

            <div className="flex gap-2 pt-3 border-t" style={{ borderColor: "#E2E8F0" }}>
              <button
                onClick={() => setSelectedTemplateForEdit(tpl)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs text-white transition-all active:scale-95"
                style={{ background: "#2563EB" }}
              >
                <Edit3 size={14} />
                <span>Editar Plantilla</span>
              </button>

              <button
                onClick={() =>{
                  const id_plantlla=tpl?.data?.idPlantilla;
                  if (!id_plantlla) return; // O throw new Error('ID no provisto');

// Aquí TypeScript ya sabe automáticamente que id_plantlla es de tipo 'string'
                  const historia = HistoryFromTemplate?.[id_plantlla];
                  console.log(historia)
                   setOpenmodalhistoia(historia??null)
                }}
                className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-xs transition-all active:scale-95"
                style={{ background: "#F8FAFC", border: "1px solid #CBD2E1", color: "#0F172A" }}
              >
                <History size={14} />
                <span>Historial</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Editor de Mapeo + Univer */}
      {selectedTemplateForEdit && selectedTemplateForEdit.data && (
        <EditorModal
          template={selectedTemplateForEdit}
          onClose={() => setSelectedTemplateForEdit(null)}
        />
      )}

      {/* Modal: Historial */}
      {openmodalhistoia && (
        <HistorialModal
          template={openmodalhistoia}
          onClose={() => setOpenmodalhistoia(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// 3. SUB-COMPONENTE LOCAL: MODAL EDITOR (UNIVER + BANDEJA DE VARIABLES)
// ============================================================================
// ---------- Tipos (igual que antes) ----------
interface SystemVariable {
  id: string;
  key: string;
  label: string;
  dataType: string;
  required: boolean;
  color: string;
  type?: 'SINGLE_FIELD' | 'TABLE_FIELD';
  columns?: { label: string; key?: string; dataType?: string }[];
}






interface EditorModalProps {
  template: any;
  onClose: () => void;
  onSaveMapping?: (mappings: Record<string, CellMapping>) => Promise<void>;
}

export function EditorModal({ template, onClose, onSaveMapping }: EditorModalProps) {
  const [variableActiva, setVariableActiva] = useState<SystemVariable | null>(null);
  const [mappeos, setMappeos] = useState<Record<string, CellMapping>>({});
  const [saving, setSaving] = useState(false);

  // 1. Extraer o construir el endpoint de descarga a través del Proxy de Fastify
  const fileUrl = useMemo(() => {
    const doc = template?.data?.versionActual?.documento;
    if (!doc) return null;

    // Si guardas el ID o Key de S3 en la base de datos (e.g. doc.fileId o doc.s3Key)
     // El nombre del archivo en MinIO
  const fileId = doc.rutaUrl;  // ya contiene "rcm005ordendetrabajo1.xlsx"
  if (!fileId) return null;

  return `/api/v1/excel/download/${encodeURIComponent(fileId)}`;
  }, [template]);

  console.log(fileUrl)

    console.log(fileUrl,"fdsfsfsdf")
  // 2. Cargar mapeos previamente guardados al inicializar el modal
  useEffect(() => {
    const rawData = template?.data?.versionActual?.mapeoExcelJson;
    if (rawData?.savedMappings) {
      setMappeos(rawData.savedMappings);
    }
  }, [template]);

  const categoriesList = useMemo(() => {
    const rawData = template?.data?.versionActual?.mapeoExcelJson;
    if (!rawData || !Array.isArray(rawData.categories)) return [];
    return rawData.categories;
  }, [template]);

  const handleCellSelected = (mapping: any) => {
    if (variableActiva && mapping?.cellAddress) {
      const cellMapping: CellMapping = {
        variableId: variableActiva.id,
        sheetName: mapping.sheetName || '',
        row: mapping.row || 0,
        col: mapping.col || 0,
        cellAddress: mapping.cellAddress,
        type: variableActiva.type || 'SINGLE_FIELD',
      };
      setMappeos((prev) => ({
        ...prev,
        [variableActiva.id]: cellMapping,
      }));
    }
  };

  const handleSave = async () => {
    if (!onSaveMapping) return;
    try {
      setSaving(true);
      await onSaveMapping(mappeos);
      onClose();
    } catch (error) {
      console.error('Error al guardar mapeo:', error);
    } finally {
      setSaving(false);
    }
  };

  // Instrucción dinámica según la variable activa
  const instructionText = !variableActiva
    ? 'Selecciona una variable del panel derecho y luego haz clic o arrastra en la hoja de cálculo.'
    : variableActiva?.type === 'TABLE_FIELD'
    ? `Arrastra para seleccionar el rango completo de "${variableActiva.label}" (encabezado + filas).`
    : `Haz clic en la celda destino para "${variableActiva.label}".`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      <div className="w-full h-[95vh] max-w-7xl rounded-xl flex flex-col overflow-hidden shadow-2xl bg-white border border-slate-300">
        
        {/* Header Modal */}
        <div className="flex justify-between items-center px-4 py-3 border-b bg-slate-50 border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Mapeador de Plantilla: {template?.data?.nombre || 'Formato Metrología'}
            </h2>
            <p
              className={`text-[11px] mt-0.5 flex items-center gap-1 ${
                variableActiva ? 'text-blue-700 font-medium' : 'text-slate-500'
              }`}
            >
              {variableActiva && <MousePointerClick size={11} />}
              {instructionText}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onSaveMapping && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
              >
                <Save size={13} />
                {saving ? 'Guardando...' : 'Guardar Mapeo'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Lado Izquierdo: Visor de Excel */}
          <div className="flex-1 p-3 bg-slate-100 flex flex-col items-center justify-center relative overflow-hidden">
            {fileUrl ? (
            <UniverSheet
            fileUrl={fileUrl}
            />
            ) : (
              <div className="text-slate-500 text-sm font-medium bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                No hay archivo o endpoint disponible para mostrar la hoja de cálculo.
              </div>
            )}
          </div>

          {/* Lado Derecho: Panel de Variables */}
          <div className="w-96 border-l border-slate-200 p-4 flex flex-col gap-4 overflow-y-auto bg-slate-50">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Layers size={14} className="text-blue-600" />
                Estructura del Formulario
              </span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                {Object.keys(mappeos).length} Mapeados
              </span>
            </div>

            {/* Recorrido Por Categorías */}
            <div className="flex flex-col gap-5">
              {categoriesList.map((category: any) => (
                <div key={category.id} className="flex flex-col gap-2">
                  
                  {/* Encabezado Categoría */}
                  <div className="sticky top-0 bg-slate-50 py-1 z-10 border-b border-slate-200">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-tight">
                      {category.name}
                    </p>
                    {category.subtitle && (
                      <p className="text-[10px] text-slate-500 italic">{category.subtitle}</p>
                    )}
                  </div>

                  {/* SINGLE_FIELD */}
                  {Array.isArray(category.fields) &&
                    category.fields.map((field: any) => {
                      const variableData: SystemVariable = {
                        id: field.id,
                        key: field.id,
                        label: field.name,
                        dataType: 'STRING',
                        required: true,
                        color: field.color || '#3b82f6',
                        type: 'SINGLE_FIELD',
                      };

                      const esSeleccionada = variableActiva?.id === field.id;
                      const mapeo = mappeos[field.id];

                      return (
                        <div
                          key={field.id}
                          onClick={() => setVariableActiva(variableData)}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                            esSeleccionada
                              ? 'bg-blue-50/50 border-blue-600 shadow-sm ring-1 ring-blue-600'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800 leading-snug">
                              {field.name}
                            </span>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-0.5"
                              style={{ backgroundColor: variableData.color }}
                            />
                          </div>

                          <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
                            <span className="text-slate-500">Ubicación:</span>
                            {mapeo ? (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 size={10} />
                                {mapeo.sheetName}!{mapeo.cellAddress}
                              </span>
                            ) : (
                              <span className="italic text-slate-400">Sin asignar</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* TABLE_FIELD */}
                  {Array.isArray(category.tables) &&
                    category.tables.map((table: any) => {
                      const variableData: SystemVariable = {
                        id: table.id,
                        key: table.id,
                        label: table.name,
                        dataType: 'ARRAY',
                        required: true,
                        color: table.color || '#10b981',
                        type: 'TABLE_FIELD',
                        columns: table.columns,
                      };

                      const esSeleccionada = variableActiva?.id === table.id;
                      const mapeo = mappeos[table.id];
                      const expectedCols = table.columns?.length || 0;

                      const mappedCols = mapeo?.mappedRange
                        ? mapeo.mappedRange.endColumn - mapeo.mappedRange.startColumn + 1
                        : 0;
                      const columnMismatch =
                        !!mapeo && expectedCols > 0 && mappedCols !== expectedCols;

                      return (
                        <div
                          key={table.id}
                          onClick={() => setVariableActiva(variableData)}
                          className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                            esSeleccionada
                              ? 'bg-emerald-50/50 border-emerald-600 shadow-sm ring-1 ring-emerald-600'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <Table size={13} className="text-emerald-600 shrink-0" />
                              <span className="text-xs font-bold text-slate-800 leading-snug">
                                {table.name}
                              </span>
                            </div>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-0.5"
                              style={{ backgroundColor: variableData.color }}
                            />
                          </div>

                          <p className="text-[10px] text-slate-500 mt-1">
                            {expectedCols} columnas configuradas
                          </p>

                          <div className="mt-2 pt-1.5 border-t border-slate-100 flex justify-between items-center text-[10px]">
                            <span className="text-slate-500">Rango Tabla:</span>
                            {mapeo ? (
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 size={10} />
                                {mapeo.sheetName}!{mapeo.cellAddress}
                              </span>
                            ) : (
                              <span className="italic text-slate-400">Sin asignar</span>
                            )}
                          </div>

                          {columnMismatch && (
                            <p className="text-[10px] text-amber-600 mt-1 font-semibold">
                              ⚠️ Se esperaban {expectedCols} cols, se mapearon {mappedCols}.
                            </p>
                          )}
                        </div>
                      );
                    })}

                </div>
              ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
// ============================================================================
// 4. SUB-COMPONENTE LOCAL: MODAL HISTORIAL
// ============================================================================
interface HistorialModalProps {
  template: TemplateHistoryLog;
  onClose: () => void;
}

function HistorialModal({ template, onClose }: HistorialModalProps) {

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div 
        className="w-full max-w-lg rounded-xl p-4 flex flex-col gap-4 shadow-xl"
        style={{ background: "#FFFFFF", border: "1px solid #CBD2E1" }}
      >
        <div className="flex justify-between items-center border-b pb-2" style={{ borderColor: "#E2E8F0" }}>
          <h3 className="text-sm font-bold" style={{ color: "#0F172A" }}>
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
              style={{ background: "#F8FAFC", borderColor: "#CBD2E1" }}
            >
              <div>
                <span className="text-xs font-bold" style={{ color: "#0F172A" }}>
                  Plantilla {template.name}
                </span>
                <p className="text-[11px]" style={{ color: "#475569" }}>
                  {log.version ? `${log.version} versiones` : 'Sin versiones'}
                </p>
              </div>
              <span className="text-[10px]" style={{ color: "#64748B" }}>
                {log.createdAt || 'N/A'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}