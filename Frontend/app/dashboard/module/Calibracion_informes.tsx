// 1. Imports
import React, { useState, useMemo } from "react";
import { Upload, FileText, UserCheck, AlertTriangle, RefreshCw, ChevronDown } from "lucide-react";

// Interfaces y Datos
interface InstrumentoAsignado {
  id: string;
  estampilla: string; 
  workOrder: string;
  equipment: string;
  client: string;
  technician: string;
  uploadDate?: string;
  fileName?: string;
  status: "Pendiente" | "Adjuntado" | "En revisión" | "Devuelto" | "Firmado";
  motivoDevolucion?: string;
}

const mockInstrumentos: InstrumentoAsignado[] = [
  {
    id: "INS-101",
    estampilla: "USC-EST-2026-0091",
    workOrder: "OT-2026-085",
    equipment: "Balanza Analítica XPR204",
    client: "Laboratorio Química Central",
    technician: "Ana Pérez",
    status: "Pendiente",
  },
  {
    id: "INS-102",
    estampilla: "USC-EST-2026-0092",
    workOrder: "OT-2026-085",
    equipment: "Higrómetro Digital",
    client: "Laboratorio Química Central",
    technician: "Ana Pérez",
    status: "Adjuntado",
    uploadDate: "2026-07-02",
    fileName: "cert_higrom_0092.pdf",
  },
  {
    id: "INS-103",
    estampilla: "USC-EST-2026-0114",
    workOrder: "OT-2026-087",
    equipment: "Termómetro Industrial",
    client: "Clínica del Sur",
    technician: "Luis Gómez",
    status: "En revisión",
    uploadDate: "2026-07-01",
    fileName: "termo_indust_0114.pdf",
  },
  {
    id: "INS-104",
    estampilla: "USC-EST-2026-0115",
    workOrder: "OT-2026-087",
    equipment: "Calibrador de Procesos",
    client: "Clínica del Sur",
    technician: "Luis Gómez",
    status: "Devuelto",
    uploadDate: "2026-06-30",
    fileName: "calibrador_fallido.pdf",
    motivoDevolucion: "Error en el cálculo de la incertidumbre expandida en el segundo punto de calibración.",
  },
  {
    id: "INS-105",
    estampilla: "USC-EST-2026-0201",
    workOrder: "OT-2026-083",
    equipment: "Transductor de Presión",
    client: "Metales del Valle",
    technician: "Carlos Ruiz",
    status: "Pendiente",
  },
];

const listaDeTecnicos = ["Todos", "Ana Pérez", "Luis Gómez", "Carlos Ruiz"];

// 2. Declaración de Componentes Hijos

const ToastNotification: React.FC<{ toast: string }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800 animate-fadeIn">
      {toast}
    </div>
  );
};

interface HeaderSectionProps {
  tecnicoActivo: string;
  onSelectTecnico: (tecnico: string) => void;
}

const HeaderSection: React.FC<HeaderSectionProps> = ({ tecnicoActivo, onSelectTecnico }) => {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-200 pb-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight pl-4 border-l-4 border-blue-600 uppercase">
          Simulador de Canvas de Técnicos
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Asignación visual, control de devoluciones e inyección de archivos por estampilla única.
        </p>
      </div>

      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <label htmlFor="session-select" className="text-xs font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">
          Simular Sesión:
        </label>
        <select
          id="session-select"
          value={tecnicoActivo}
          onChange={(e) => onSelectTecnico(e.target.value)}
          className="text-xs font-bold bg-slate-50 border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          {listaDeTecnicos.map((t) => (
            <option key={t} value={t}>
              {t === "Todos" ? "🌍 Ver Todos los Técnicos" : `👤 Vista: ${t}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

interface FilterBarProps {
  filterWorkOrder: string;
  setFilterWorkOrder: (val: string) => void;
  showODropdown: boolean;
  setShowODropdown: (show: boolean) => void;
  sugerenciasOT: string[];
  filterClient: string;
  setFilterClient: (val: string) => void;
  showCDropdown: boolean;
  setShowCDropdown: (show: boolean) => void;
  sugerenciasCliente: string[];
}

const FilterBar: React.FC<FilterBarProps> = ({
  filterWorkOrder,
  setFilterWorkOrder,
  showODropdown,
  setShowODropdown,
  sugerenciasOT,
  filterClient,
  setFilterClient,
  showCDropdown,
  setShowCDropdown,
  sugerenciasCliente,
}) => {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* COMBOBOX DE NUMERO DE OT */}
      <div className="relative">
        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
          Filtrar por Número de OT
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Escribe o selecciona una OT..."
            value={filterWorkOrder}
            onChange={(e) => {
              setFilterWorkOrder(e.target.value);
              setShowODropdown(true);
            }}
            onFocus={() => setShowODropdown(true)}
            onBlur={() => setTimeout(() => setShowODropdown(false), 200)}
            className="w-full text-xs font-medium pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {showODropdown && sugerenciasOT.length > 0 && (
          <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto py-1 text-xs font-medium text-slate-700 animate-fadeIn">
            {sugerenciasOT.map((ot) => (
              <li
                key={ot}
                onMouseDown={() => setFilterWorkOrder(ot)}
                className="px-3 py-1.5 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                {ot}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* COMBOBOX DE CLIENTE */}
      <div className="relative">
        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">
          Filtrar por Cliente
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Escribe o selecciona un Cliente..."
            value={filterClient}
            onChange={(e) => {
              setFilterClient(e.target.value);
              setShowCDropdown(true);
            }}
            onFocus={() => setShowCDropdown(true)}
            onBlur={() => setTimeout(() => setShowCDropdown(false), 200)}
            className="w-full text-xs font-medium pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 placeholder-slate-400"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {showCDropdown && sugerenciasCliente.length > 0 && (
          <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto py-1 text-xs font-medium text-slate-700 animate-fadeIn">
            {sugerenciasCliente.map((cliente) => (
              <li
                key={cliente}
                onMouseDown={() => setFilterClient(cliente)}
                className="px-3 py-1.5 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                {cliente}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

interface UploadDockProps {
  selectedInstrumento: InstrumentoAsignado;
  selectedFile: File | null;
  onCancel: () => void;
  onRemoveFile: () => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
}

const UploadDock: React.FC<UploadDockProps> = ({
  selectedInstrumento,
  selectedFile,
  onCancel,
  onRemoveFile,
  onFileChange,
  onUpload,
}) => {
  const isDevuelto = selectedInstrumento.status === "Devuelto";

  return (
    <section className="mb-8 animate-fadeIn">
      <div
        className={`bg-white border-2 rounded-2xl p-6 shadow-md max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-center ${
          isDevuelto ? "border-rose-500" : "border-blue-500"
        }`}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 rounded-md ${
                isDevuelto ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700"
              }`}
            >
              {isDevuelto ? "Reenvío Obligatorio" : "Estampilla en Foco"}
            </span>
            <span className="text-xs font-mono font-bold text-slate-500">
              {selectedInstrumento.workOrder}
            </span>
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">
            {selectedInstrumento.equipment}
          </h3>

          {isDevuelto && selectedInstrumento.motivoDevolucion && (
            <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-3 text-xs flex gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold block">Motivo de Devolución del Director:</span>
                <p className="mt-0.5 text-rose-800 italic">{selectedInstrumento.motivoDevolucion}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1 text-xs font-medium text-slate-600">
            <div>
              <span className="text-slate-400">Código Único:</span>{" "}
              <span className="font-mono font-bold text-slate-800">{selectedInstrumento.estampilla}</span>
            </div>
            <div>
              <span className="text-slate-400">Cliente Destino:</span>{" "}
              <span className="text-slate-800">{selectedInstrumento.client}</span>
            </div>
            <div>
              <span className="text-slate-400">Técnico Responsable:</span>{" "}
              <span className="text-slate-800">{selectedInstrumento.technician}</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-slate-500 hover:text-slate-800 font-bold bg-transparent border-none cursor-pointer"
          >
            ✕ Cancelar acción
          </button>
        </div>

        <div className="flex flex-col items-center justify-center border border-slate-200 bg-slate-50/50 p-4 rounded-xl min-h-[160px]">
          {selectedFile ? (
            <div className="text-center w-full space-y-3">
              <div className="inline-flex p-2.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                <FileText size={20} />
              </div>
              <div className="text-xs font-bold font-mono text-slate-800 truncate px-4">{selectedFile.name}</div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={onRemoveFile}
                  className="text-[11px] text-slate-400 hover:text-slate-600 bg-transparent border-none font-bold cursor-pointer"
                >
                  Remover
                </button>
                <button
                  onClick={onUpload}
                  className="text-xs bg-blue-600 text-white font-bold px-4 py-1.5 rounded-lg border-none hover:bg-blue-700 cursor-pointer shadow-sm transition flex items-center gap-1.5"
                >
                  {isDevuelto && <RefreshCw size={12} />}
                  {isDevuelto ? "Reenviar con Correcciones" : "Vincular Archivo"}
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="canvas-file-upload"
              className={`flex flex-col items-center justify-center w-full h-full p-4 text-center cursor-pointer hover:bg-slate-100/80 transition rounded-xl border border-dashed ${
                isDevuelto ? "border-rose-300 hover:border-rose-400 bg-rose-50/20" : "border-slate-300"
              }`}
            >
              <Upload size={20} className={`${isDevuelto ? "text-rose-500" : "text-blue-500"} mb-1.5`} />
              <span className="text-xs font-bold text-slate-800">
                {isDevuelto ? "Cargar nuevo PDF corregido" : "Cargar Certificado PDF"}
              </span>
              <input
                id="canvas-file-upload"
                type="file"
                accept="application/pdf"
                onChange={onFileChange}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>
    </section>
  );
};

interface InstrumentCardProps {
  instrumento: InstrumentoAsignado;
  isSelected: boolean;
  onSelect: (instrumento: InstrumentoAsignado) => void;
  badgeEstado: string;
}

const InstrumentCard: React.FC<InstrumentCardProps> = ({
  instrumento,
  isSelected,
  onSelect,
  badgeEstado,
}) => {
  const isDevuelto = instrumento.status === "Devuelto";

  return (
    <div
      onClick={() => onSelect(instrumento)}
      className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between relative ${
        isSelected
          ? "bg-blue-600 border-blue-600 text-white shadow-md scale-[1.01]"
          : isDevuelto
          ? "bg-rose-50/60 border-rose-200 hover:border-rose-400 text-slate-800 shadow-sm"
          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-sm hover:shadow-md"
      }`}
    >
      <div>
        <div className="flex justify-between items-start gap-2 mb-2">
          <span
            className={`font-mono text-[10px] font-bold tracking-tight rounded px-1.5 py-0.5 truncate max-w-[150px] ${
              isSelected ? "bg-blue-700 text-blue-100" : isDevuelto ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            🏷️ {instrumento.workOrder}
          </span>
          <span className={isSelected ? "text-[10px] text-blue-100 font-bold uppercase" : badgeEstado}>
            {instrumento.status}
          </span>
        </div>

        <h4 className={`text-xs font-black ${isSelected ? "text-white" : "text-slate-900"}`}>
          {instrumento.equipment}
        </h4>
        <p className={`text-[11px] mt-1 font-medium ${isSelected ? "text-blue-200" : "text-slate-400"}`}>
          Estampilla: <span className="font-mono">{instrumento.estampilla}</span> — {instrumento.client}
        </p>

        {isDevuelto && !isSelected && instrumento.motivoDevolucion && (
          <div className="mt-3 bg-white border border-rose-200 p-2 rounded-lg text-[11px] text-rose-700 font-medium">
            <span className="font-bold flex items-center gap-1">
              <AlertTriangle size={12} /> Devuelto por:
            </span>
            <p className="line-clamp-2 italic text-slate-600 mt-0.5">{instrumento.motivoDevolucion}</p>
          </div>
        )}
      </div>

      {instrumento.fileName && (
        <div
          className={`mt-3 pt-2 border-t flex items-center gap-1.5 text-[10px] font-mono ${
            isSelected ? "border-blue-500 text-blue-100" : isDevuelto ? "border-rose-100 text-slate-500" : "border-slate-100 text-slate-500"
          }`}
        >
          <FileText size={12} /> {instrumento.fileName}
        </div>
      )}
    </div>
  );
};

interface TechnicianCanvasProps {
  tecnicosVisibles: string[];
  instrumentos: InstrumentoAsignado[];
  filterWorkOrder: string;
  filterClient: string;
  selectedInstrumento: InstrumentoAsignado | null;
  onSelectInstrumento: (ins: InstrumentoAsignado) => void;
  obtenerBadgeEstado: (status: InstrumentoAsignado["status"]) => string;
}

const TechnicianCanvas: React.FC<TechnicianCanvasProps> = ({
  tecnicosVisibles,
  instrumentos,
  filterWorkOrder,
  filterClient,
  selectedInstrumento,
  onSelectInstrumento,
  obtenerBadgeEstado,
}) => {
  return (
    <section>
      <h2 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
        <UserCheck size={14} className="text-slate-500" /> Pizarra de Instrumentos Asignados
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-slate-200/40 p-6 rounded-2xl border border-slate-300/60 shadow-inner">
        {tecnicosVisibles.map((tecnico) => {
          const instrumentosDelTecnico = instrumentos.filter((i) => {
            const matchesTecnico = i.technician === tecnico;
            const matchesOT = i.workOrder.toLowerCase().includes(filterWorkOrder.toLowerCase());
            const matchesCliente = i.client.toLowerCase().includes(filterClient.toLowerCase());
            return matchesTecnico && matchesOT && matchesCliente;
          });

          return (
            <div key={tecnico} className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[400px] animate-fadeIn">
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 rounded-t-xl flex justify-between items-center">
                <span className="font-black text-xs text-slate-900 uppercase tracking-tight">
                  👤 {tecnico}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-bold">
                  {instrumentosDelTecnico.length} filtrados
                </span>
              </div>

              <div className="p-4 flex-1 space-y-3 overflow-y-auto max-h-[450px]">
                {instrumentosDelTecnico.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 font-medium">
                    No hay instrumentos que coincidan.
                  </div>
                ) : (
                  instrumentosDelTecnico.map((ins) => (
                    <InstrumentCard
                      key={ins.id}
                      instrumento={ins}
                      isSelected={selectedInstrumento?.id === ins.id}
                      onSelect={onSelectInstrumento}
                      badgeEstado={obtenerBadgeEstado(ins.status)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// 3. Declaración del Componente Padre (MainRenderer)

export const CalibracionInformesMockup: React.FC = () => {
  const [instrumentos, setInstrumentos] = useState<InstrumentoAsignado[]>(mockInstrumentos);
  const [tecnicoActivo, setTecnicoActivo] = useState<string>("Todos");
  const [selectedInstrumento, setSelectedInstrumento] = useState<InstrumentoAsignado | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState("");

  const [filterWorkOrder, setFilterWorkOrder] = useState("");
  const [filterClient, setFilterClient] = useState("");

  const [showODropdown, setShowODropdown] = useState(false);
  const [showCDropdown, setShowCDropdown] = useState(false);

  const listaOTs = useMemo(() => {
    const ots = instrumentos.map((i) => i.workOrder);
    return Array.from(new Set(ots));
  }, [instrumentos]);

  const listaClientes = useMemo(() => {
    const clientes = instrumentos.map((i) => i.client);
    return Array.from(new Set(clientes));
  }, [instrumentos]);

  const sugerenciasOT = useMemo(() => {
    return listaOTs.filter((ot) => ot.toLowerCase().includes(filterWorkOrder.toLowerCase()));
  }, [listaOTs, filterWorkOrder]);

  const sugerenciasCliente = useMemo(() => {
    return listaClientes.filter((c) => c.toLowerCase().includes(filterClient.toLowerCase()));
  }, [listaClientes, filterClient]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const ejecutarSubidaCertificado = () => {
    if (!selectedInstrumento || !selectedFile) return;

    setInstrumentos((prev) =>
      prev.map((ins) =>
        ins.estampilla === selectedInstrumento.estampilla
          ? {
              ...ins,
              status: "Adjuntado",
              fileName: selectedFile.name,
              uploadDate: new Date().toISOString().split("T")[0],
              motivoDevolucion: undefined,
            }
          : ins
      )
    );

    showToast(`🚀 Certificado corregido/reenviado a la estampilla: ${selectedInstrumento.estampilla}`);
    setSelectedFile(null);
    setSelectedInstrumento(null);
  };

  const obtenerBadgeEstado = (status: InstrumentoAsignado["status"]) => {
    const config = {
      Pendiente: "bg-amber-50 text-amber-700 border-amber-200",
      Adjuntado: "bg-blue-50 text-blue-700 border-blue-200",
      "En revisión": "bg-purple-50 text-purple-700 border-purple-200",
      Devuelto: "bg-rose-50 text-rose-700 border-rose-200",
      Firmado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
    return `px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider uppercase ${config[status]}`;
  };

  const tecnicosVisibles = tecnicoActivo === "Todos" 
    ? listaDeTecnicos.filter((t) => t !== "Todos") 
    : [tecnicoActivo];

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans text-slate-800 antialiased">
      <ToastNotification toast={toast} />

      <HeaderSection
        tecnicoActivo={tecnicoActivo}
        onSelectTecnico={(tecnico) => {
          setTecnicoActivo(tecnico);
          setSelectedInstrumento(null);
          setSelectedFile(null);
        }}
      />

      <FilterBar
        filterWorkOrder={filterWorkOrder}
        setFilterWorkOrder={setFilterWorkOrder}
        showODropdown={showODropdown}
        setShowODropdown={setShowODropdown}
        sugerenciasOT={sugerenciasOT}
        filterClient={filterClient}
        setFilterClient={setFilterClient}
        showCDropdown={showCDropdown}
        setShowCDropdown={setShowCDropdown}
        sugerenciasCliente={sugerenciasCliente}
      />

      {selectedInstrumento && (
        <UploadDock
          selectedInstrumento={selectedInstrumento}
          selectedFile={selectedFile}
          onCancel={() => {
            setSelectedInstrumento(null);
            setSelectedFile(null);
          }}
          onRemoveFile={() => setSelectedFile(null)}
          onFileChange={handleFileChange}
          onUpload={ejecutarSubidaCertificado}
        />
      )}

      <TechnicianCanvas
        tecnicosVisibles={tecnicosVisibles}
        instrumentos={instrumentos}
        filterWorkOrder={filterWorkOrder}
        filterClient={filterClient}
        selectedInstrumento={selectedInstrumento}
        onSelectInstrumento={setSelectedInstrumento}
        obtenerBadgeEstado={obtenerBadgeEstado}
      />
    </div>
  );
};

// 4. Exportación por defecto
export default CalibracionInformesMockup;