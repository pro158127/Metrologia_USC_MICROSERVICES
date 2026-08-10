// 1. Imports
import React, { useState, useEffect } from "react";
import { Link, CheckCircle, FileText, Unlink, Layers, AlertTriangle } from "lucide-react";

// Interfaces y Tipos
interface GeneratedOT {
  id: number;
  number: string;
  client: string;
  date: string;
  equipmentCount: number;
  status: "Pendiente" | "En proceso" | "Completada";
  cotizacionReferencia?: string; 
}

interface RecepcionPorCotizacion {
  cotizacion: string;
  cliente: string;
  fechaRecepcion: string;
  equiposContados: number;
}

// Datos Mock (Constantes del dominio)
const initialOTs: GeneratedOT[] = [
  { id: 1, number: "OT-2026-001", client: "Clínica del Sur", date: "2026-06-10", equipmentCount: 3, status: "En proceso" },
  { id: 2, number: "OT-2026-002", client: "Industrias Andinas", date: "2026-06-15", equipmentCount: 5, status: "Completada" },
  { id: 3, number: "OT-2026-003", client: "USC Ingeniería", date: "2026-06-20", equipmentCount: 2, status: "Pendiente" },
];

const mockRecepcionesPorCotizacion: RecepcionPorCotizacion[] = [
  { cotizacion: "COT-2026-881", cliente: "Clínica del Sur", fechaRecepcion: "2026-07-01", equiposContados: 3 },
  { cotizacion: "COT-2026-902", cliente: "Laboratorios Alfa", fechaRecepcion: "2026-07-02", equiposContados: 4 },
  { cotizacion: "COT-2026-945", cliente: "Ingeniería Biomédica S.A.", fechaRecepcion: "2026-07-03", equiposContados: 2 }
];

// 2. Declaración de Componentes Hijos

// Notificación Flotante (Toast)
interface ToastProps {
  message: string;
}
const ToastNotification: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl z-50 text-xs font-bold border border-slate-800 animate-fadeIn">
      {message}
    </div>
  );
};

// Seleccionador de Flujo Operativo
interface FlowSelectorProps {
  tipoFlujo: "estandar" | "inverso";
  onSelectFlow: (flujo: "estandar" | "inverso") => void;
}
const FlowSelector: React.FC<FlowSelectorProps> = ({ tipoFlujo, onSelectFlow }) => {
  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 max-w-xl">
      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
        <Layers size={12} /> Configuración del Flujo Operativo
      </label>
      <div className="grid grid-cols-2 gap-2">
        <button 
          type="button"
          onClick={() => onSelectFlow("estandar")}
          className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
            tipoFlujo === "estandar" ? "bg-white border-blue-500 text-blue-600 shadow-sm" : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          🔄 Flujo Estándar (Extraer Excel)
        </button>
        <button 
          type="button"
          onClick={() => onSelectFlow("inverso")}
          className={`py-2 px-3 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
            tipoFlujo === "inverso" ? "bg-white border-blue-500 text-blue-600 shadow-sm" : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          ↪️ Flujo Inverso (Vincular Manual)
        </button>
      </div>
    </div>
  );
};

// Zona de Carga / Selección de Archivo Excel
interface FileUploadZoneProps {
  tipoFlujo: "estandar" | "inverso";
  file: File | null;
  showForm: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  onExtract: () => void;
  onStartManual: () => void;
}
const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  tipoFlujo,
  file,
  showForm,
  onFileChange,
  onRemoveFile,
  onExtract,
  onStartManual,
}) => {
  if (tipoFlujo === "estandar" && !file) {
    return (
      <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full max-w-md border-2 border-dashed border-slate-200 rounded-2xl p-8 cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition">
        <span className="text-4xl mb-2">📁</span>
        <span className="text-sm font-bold text-slate-700">Adjunta OT Excel</span>
        <input id="file-upload" type="file" accept=".xlsx" onChange={onFileChange} className="hidden" />
      </label>
    );
  }

  if (tipoFlujo === "inverso" && !showForm) {
    return (
      <button onClick={onStartManual} className="bg-blue-600 text-white px-5 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 border-none cursor-pointer">
        Iniciar Vinculación Manual
      </button>
    );
  }

  if (file && !showForm && tipoFlujo === "estandar") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-slate-50 rounded-xl border border-slate-200 p-3.5">
          <span className="text-slate-800 text-xs font-semibold">📄 {file.name}</span>
          <button onClick={onRemoveFile} className="text-xs text-blue-600 hover:underline bg-transparent border-none cursor-pointer font-bold">Cambiar archivo</button>
        </div>
        <button onClick={onExtract} className="bg-blue-600 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 border-none cursor-pointer shadow-sm transition">
          Extraer información
        </button>
      </div>
    );
  }

  return null;
};

// Formulario de Edición y Asignación de Cotización
interface OTFormSectionProps {
  tipoFlujo: "estandar" | "inverso";
  cotizacionExtraida: string;
  otNumber: string;
  date: string;
  client: string;
  cotizacionSeleccionada: string;
  recepciones: RecepcionPorCotizacion[];
  setOtNumber: (val: string) => void;
  setDate: (val: string) => void;
  setClient: (val: string) => void;
  onCotizacionChange: (cotiz: string) => void;
  onGenerateOT: () => void;
}
const OTFormSection: React.FC<OTFormSectionProps> = ({
  tipoFlujo,
  cotizacionExtraida,
  otNumber,
  date,
  client,
  cotizacionSeleccionada,
  recepciones,
  setOtNumber,
  setDate,
  setClient,
  onCotizacionChange,
  onGenerateOT,
}) => {
  return (
    <div className="mt-4 space-y-5 border-t border-slate-100 pt-4 animate-fadeIn">
      {tipoFlujo === "estandar" && cotizacionExtraida && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Información de control:</span> Se detectó la cotización <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded font-bold text-amber-900">{cotizacionExtraida}</span> dentro del documento. Verifique si es correcta o cámbiela en el listado inferior.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">N° OT</label>
          <input className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium" value={otNumber} onChange={(e) => setOtNumber(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fecha</label>
          <input type="date" className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cliente / Solicitante</label>
          <input className="w-full border border-slate-200 rounded-xl p-2 mt-1 text-xs outline-none focus:border-blue-500 font-medium bg-slate-50" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Razón social..." />
        </div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
          {tipoFlujo === "estandar" ? "Asociar / Reemplazar por Cotización Vigente del Sistema" : "Seleccionar Cotización Origen Obligatoria"}
        </label>
        <select 
          value={cotizacionSeleccionada} 
          onChange={(e) => onCotizacionChange(e.target.value)}
          className="w-full max-w-xl px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white outline-none focus:border-blue-500 font-medium text-slate-700 font-mono"
        >
          <option value="">{tipoFlujo === "estandar" ? "-- Mantener sin vincular a formato preexistente --" : "-- Seleccionar cotización vigente --"}</option>
          {recepciones.map(rec => (
            <option key={rec.cotizacion} value={rec.cotizacion}>
              {rec.cotizacion} — {rec.cliente} ({rec.equiposContados} Equipos registrados)
            </option>
          ))}
        </select>
      </div>

      <button onClick={onGenerateOT} disabled={tipoFlujo === "inverso" && !cotizacionSeleccionada} className="w-full bg-blue-600 text-white py-2.5 rounded-xl hover:bg-blue-700 font-bold text-xs shadow-sm border-none cursor-pointer transition disabled:bg-slate-300 disabled:cursor-not-allowed">
        {cotizacionSeleccionada ? `Generar OT Vinculada a ${cotizacionSeleccionada}` : "Generar Orden de Trabajo"}
      </button>
    </div>
  );
};

// Tabla de Historial de Órdenes de Trabajo Generadas
interface OTTableSectionProps {
  generatedOTs: GeneratedOT[];
}
const OTTableSection: React.FC<OTTableSectionProps> = ({ generatedOTs }) => {
  return (
    <section>
      <h2 className="text-xl font-bold mb-4 text-slate-800">
        Órdenes de Trabajo Generadas <span className="text-xs font-normal text-slate-400">({generatedOTs.length} en total)</span>
      </h2>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold tracking-wider border-b border-slate-200">
                <th className="px-5 py-3">N° OT</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Fecha</th>
                <th className="px-5 py-3 text-center">Equipos</th>
                <th className="px-5 py-3">Cotización Referencia</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {generatedOTs.map((ot) => (
                <tr key={ot.id} className="hover:bg-slate-50/50 transition">
                  <td className="px-5 py-3 font-mono font-bold text-blue-600">{ot.number}</td>
                  <td className="px-5 py-3 font-semibold text-slate-700">{ot.client}</td>
                  <td className="px-5 py-3 font-medium text-slate-400 font-mono">{ot.date}</td>
                  <td className="px-5 py-3 text-center"><span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">{ot.equipmentCount}</span></td>
                  
                  <td className="px-5 py-3">
                    {ot.cotizacionReferencia ? (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-100 font-bold text-[10px]">
                        <Link size={10} /> {ot.cotizacionReferencia}
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-400 border border-slate-100 font-medium text-[10px]">
                        <Unlink size={10} /> Sin Vincular
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    {ot.status === "Pendiente" && <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-md text-[10px] font-bold">Pendiente</span>}
                    {ot.status === "En proceso" && <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-md text-[10px] font-bold">En proceso</span>}
                    {ot.status === "Completada" && <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md text-[10px] font-bold">Completada</span>}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <button className="bg-slate-100 text-slate-700 font-bold px-3 py-1 rounded-xl text-[11px] hover:bg-slate-200 border-none cursor-pointer transition">
                      Ver
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

// 3. Declaración del Componente Padre (MainRenderer)
export const MainRenderer2: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [otNumber, setOtNumber] = useState("");
  const [date, setDate] = useState("");
  const [client, setClient] = useState("");
  const [generatedOTs, setGeneratedOTs] = useState<GeneratedOT[]>(initialOTs);
  const [nextId, setNextId] = useState(4);
  const [toast, setToast] = useState("");

  const [tipoFlujo, setTipoFlujo] = useState<"estandar" | "inverso">("estandar");
  const [cotizacionExtraida, setCotizacionExtraida] = useState(""); 
  const [cotizacionSeleccionada, setCotizacionSeleccionada] = useState("");

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
  };

  const handleCotizacionChange = (cotiz: string) => {
    setCotizacionSeleccionada(cotiz);
    const datosRecepcion = mockRecepcionesPorCotizacion.find(r => r.cotizacion === cotiz);
    if (datosRecepcion) {
      setClient(datosRecepcion.cliente);
    }
  };

  const handleExtract = () => {
    setOtNumber(`OT-2026-00${nextId}`);
    setDate(new Date().toISOString().split("T")[0]);
    
    if (tipoFlujo === "estandar") {
      const cotizSimuladaExcel = "COT-2026-999"; 
      setCotizacionExtraida(cotizSimuladaExcel);
      
      const existe = mockRecepcionesPorCotizacion.some(r => r.cotizacion === cotizSimuladaExcel);
      if (existe) {
        handleCotizacionChange(cotizSimuladaExcel);
      } else {
        setCotizacionSeleccionada("");
        setClient("Cliente Extraído de Excel");
      }
    }
    setShowForm(true);
  };

  const handleGenerateOT = () => {
    let countEquip = 1;
    
    if (cotizacionSeleccionada) {
      const rec = mockRecepcionesPorCotizacion.find(r => r.cotizacion === cotizacionSeleccionada);
      if (rec) countEquip = rec.equiposContados;
    }

    const newOT: GeneratedOT = {
      id: nextId,
      number: otNumber || `OT-2026-00${nextId}`,
      client,
      date,
      equipmentCount: countEquip,
      status: "Pendiente",
      cotizacionReferencia: cotizacionSeleccionada || undefined
    };

    setGeneratedOTs([newOT, ...generatedOTs]);
    setNextId(nextId + 1);
    
    if (cotizacionSeleccionada) {
      setToast(`🔗 Sincronizado bajo Cotización: ${cotizacionSeleccionada}`);
    } else {
      setToast("✅ OT generada de forma aislada (Sin Cotización Vinculada)");
    }

    // Resetear formulario
    setFile(null);
    setShowForm(false);
    setOtNumber("");
    setDate("");
    setClient("");
    setTipoFlujo("estandar");
    setCotizacionExtraida("");
    setCotizacionSeleccionada("");
  };

  const handleSelectFlow = (flujo: "estandar" | "inverso") => {
    setTipoFlujo(flujo);
    setCotizacionSeleccionada("");
    setShowForm(false);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
      {/* 1. Componente Hijo: Toast */}
      <ToastNotification message={toast} />

      {/* SECCIÓN DE IMPORTACIÓN */}
      <section className="mb-8">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-slate-800">
          <FileText size={20} className="text-blue-600" /> Importar Orden de Trabajo
        </h2>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
          {/* 2. Componente Hijo: Seleccionador de Flujo */}
          <FlowSelector tipoFlujo={tipoFlujo} onSelectFlow={handleSelectFlow} />

          {/* 3. Componente Hijo: Zona de Archivo / Inicio */}
          <FileUploadZone 
            tipoFlujo={tipoFlujo}
            file={file}
            showForm={showForm}
            onFileChange={handleFileChange}
            onRemoveFile={() => setFile(null)}
            onExtract={handleExtract}
            onStartManual={() => { setCotizacionExtraida(""); setShowForm(true); }}
          />

          {/* 4. Componente Hijo: Formulario */}
          {showForm && (
            <OTFormSection 
              tipoFlujo={tipoFlujo}
              cotizacionExtraida={cotizacionExtraida}
              otNumber={otNumber}
              date={date}
              client={client}
              cotizacionSeleccionada={cotizacionSeleccionada}
              recepciones={mockRecepcionesPorCotizacion}
              setOtNumber={setOtNumber}
              setDate={setDate}
              setClient={setClient}
              onCotizacionChange={handleCotizacionChange}
              onGenerateOT={handleGenerateOT}
            />
          )}
        </div>
      </section>

      {/* 5. Componente Hijo: Tabla / Historial */}
      <OTTableSection generatedOTs={generatedOTs} />
    </div>
  );
};

// 4. Exportación por Defecto
export default MainRenderer2;