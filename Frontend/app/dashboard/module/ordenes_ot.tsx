// 1. IMPORTS
import React, { useState,useEffect, useMemo,useRef } from "react";
import { 
  AlertTriangle, 
  Search, 
  Eye, 
  Edit3, 
  Layers, 
  ChevronLeft, 
  ChevronRight ,
  Wrench
  ,User,Calendar
} from "lucide-react";

// ==========================================
// TIPOS Y DATOS CONSTANTES
// ==========================================
type ViewMode = "kanban" | "list";


const ots = [
  { id: "OT-2026-089", cliente: "Empresa ABC", tecnico: "J. Martínez", fecha: "12/06/2026", tipo: "Acreditado", estado: "Certificado en revisión", retraso: false, equipos: 3 },
  { id: "OT-2026-087", cliente: "Clínica del Sur", tecnico: "M. Torres", fecha: "10/06/2026", tipo: "No acreditado", estado: "En calibración", retraso: false, equipos: 5 },
  { id: "OT-2026-085", cliente: "USC Ingeniería", tecnico: "J. Martínez", fecha: "05/06/2026", tipo: "Acreditado", estado: "Asignada", retraso: false, equipos: 2 },
  { id: "OT-2026-083", cliente: "Metales del Valle", tecnico: "P. Ríos", fecha: "01/06/2026", tipo: "Acreditado", estado: "En calibración", retraso: true, equipos: 7 },
  { id: "OT-2026-080", cliente: "Empresa ABC", tecnico: "M. Torres", fecha: "25/05/2026", tipo: "No acreditado", estado: "Certificado en revisión", retraso: true, equipos: 4 },
  { id: "OT-2026-078", cliente: "Industrias Andinas", tecnico: "P. Ríos", fecha: "20/05/2026", tipo: "Acreditado", estado: "Certificado aprobado", retraso: false, equipos: 6 },
  { id: "OT-2026-075", cliente: "USC Ingeniería", tecnico: "J. Martínez", fecha: "15/05/2026", tipo: "No acreditado", estado: "Creada", retraso: true, equipos: 2 },
];
type OTBase = {
  id: string;
  cliente: string;
  tecnico: string|"sin asingar responsable";
  fecha: string;
  estado: string;
  retraso: boolean;
  equipos: number;
  codigo:string;
  warns:Warning[]
};



type EditableOrderFields = {
  razonSocialCert: string;
  nitCert: string;
  correoCertificados: string;
  fechaLimiteFacturacion: string;
  direccionCert: string;
  ciudadCert: string;
  correoFactura: string;
  
  lugarCalibracion: "Interno USC" | "En sitio" | "Laboratorio permanente";
  personaContactar: string;
  telefonoCalibracion: string;
  fechaCalibracion: string;
  horaCalibracion: string;

  razonSocialSolicitante: string;
  nitSolicitante: string;
  direccionSolicitante: string;
  ciudadSolicitante: string;
  contactoSolicitante: string;
  telefonoSolicitante: string;

  noOrdenTrabajo: string;
  noCotizacion: string;
  responsableUsc: string;
  fechaDiligenciamiento: string;
  requiereAnexo: "Si" | "No";
  estadoOrden: string;
  estado_revision?:string;
  ultima_version?:string;
  observacionesGenerales: string;
};

type OTType = typeof ots[number] & Partial<EditableOrderFields> & {
  maquinas?: string[];
  tecnicos?: string[];
  asignaciones?: Record<string, string[]>;
  instrumentos?: Instrument[];
};

const defaultInstrumentos: Instrument[] = [
  {
    id: "INS-01",
    item: "1",
    tipoServicio: "Calibración",
    instrumento: "Balanza analítica",
    fabricante: "Mettler Toledo",
    modelo: "XPR204",
    serie: "MT554321",
    codigoInternoInventario: "INV-0092",
    ubicacion: "Laboratorio Quimica",
    puntosCalibrar: "0 g, 50 g, 100 g, 200 g",
    unidad: "g",
    intervaloMedicion: "0 a 220g",
    resolucionDivisionEscala: "0.1 mg",
    declaracionConformidad: "Aplica",
    empLimiteControl: "0.01 g",
    documentoEspecificacion: "OIML R76",
    reglaDecision: "Regla simple",
  },
];

const buildOrderDraft = (ot: OTType): EditableOrderFields => ({
  razonSocialCert: ot.razonSocialCert ?? ot.cliente,
  nitCert: ot.nitCert ?? "900.123.456-1",
  correoCertificados: ot.correoCertificados ?? "cliente@correo.com",
  fechaLimiteFacturacion: ot.fechaLimiteFacturacion ?? "2026-07-30",
  direccionCert: ot.direccionCert ?? "Calle 5 # 62-00",
  ciudadCert: ot.ciudadCert ?? "Cali",
  correoFactura: ot.correoFactura ?? "facturacion@correo.com",
  
  lugarCalibracion: (ot.lugarCalibracion as any) ?? "Interno USC",
  personaContactar: ot.personaContactar ?? "Laura Gómez",
  telefonoCalibracion: ot.telefonoCalibracion ?? "300 555 0188",
  fechaCalibracion: ot.fechaCalibracion ?? "2026-07-15",
  horaCalibracion: ot.horaCalibracion ?? "09:00",

  razonSocialSolicitante: ot.razonSocialSolicitante ?? "Universidad Santiago de Cali",
  nitSolicitante: ot.nitSolicitante ?? "890.303.797-1",
  direccionSolicitante: ot.direccionSolicitante ?? "Pampalinda, Cali",
  ciudadSolicitante: ot.ciudadSolicitante ?? "Cali",
  contactoSolicitante: ot.contactoSolicitante ?? "Coordinador Laboratorio",
  telefonoSolicitante: ot.telefonoSolicitante ?? "5183000",

  noOrdenTrabajo: ot.noOrdenTrabajo ?? ot.id,
  noCotizacion: ot.noCotizacion ?? "26-0045A",
  responsableUsc: ot.responsableUsc ?? ot.tecnico,
  fechaDiligenciamiento: ot.fechaDiligenciamiento ?? "2026-07-02",
  requiereAnexo: ot.requiereAnexo ?? "No",
  estadoOrden: ot.estadoOrden ?? ot.estado,
  observacionesGenerales: ot.observacionesGenerales ?? "Priorizar entrega por cierre de auditoria.",
  ultima_version:ot.ultima_version?.toString()
});

// ==========================================
// 2. COMPONENTES HIJOS (EXTRAÍDOS Y ORGANIZADOS)
// ==========================================

const ToastNotification = ({ message }: { message: string }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

type Warning = {
  tipo: "retraso" | "sin_responsable" | "sin_fecha" | "exceso_instrumentos" | "pendiente_revision";
  mensaje: string;
  
};

const HeaderSection = ({
  selectedOT,
  search,
  setSearch,
  viewMode,
  setViewMode,
  onBack,
  totalOTs,
  warnings = [],
}: {
  selectedOT: OTType | null;
  search: string;
  setSearch: (val: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onBack: () => void;
  totalOTs: number;
  warnings?: Warning[];
}) => {
  return (
    <div className="flex items-center justify-between mb-6 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-3">
        {selectedOT && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-transparent border-none cursor-pointer hover:underline transition-colors"
          >
            ← Volver al Panel
          </button>
        )}
        <h1 className="text-2xl font-black text-slate-900 tracking-tight pl-4 border-l-4 border-blue-600">
          {selectedOT ? `— ${selectedOT.cliente}` : "Órdenes de Trabajo"}
        </h1>
        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold uppercase tracking-wider">
          {selectedOT?`Equipo: ${selectedOT?.equipos.toString()}`:  `Activos ${totalOTs}`}
        </span>
      </div>

      {!selectedOT && (
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° OT o cliente..."
              className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
            />
          </div>
          <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-white p-0.5">
            {(["kanban", "list"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition ${
                  viewMode === m ? "bg-slate-900 text-white shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {m === "kanban" ? "Tablero" : "Lista"}
              </button>
            ))}
          </div>
        </div>
      )}

     
      {selectedOT  && (
        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100">
          {`CONSECUTIVO: ${selectedOT.noOrdenTrabajo} · VERSIÓN: ${selectedOT.ultima_version} · VIGENCIA: ${selectedOT.fechaLimiteFacturacion}`}
        </div>
      )}
    </div>
  );
};
const OrderAlertsBanner = ({ 
  selectedOT,
  warnings = [] 
}: { 
  selectedOT: OTType;
  warnings?: Warning[];
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">Cliente Operativo</span>
        <span className="text-sm font-bold text-slate-800">{selectedOT.cliente}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase border border-blue-200">
          {selectedOT.estado}
        </span>
        {warnings.length > 0 ? (
          warnings.map((warn, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold uppercase tracking-wider animate-pulse"
            >
              <AlertTriangle size={12} />
              {warn.mensaje}
            </span>
          ))
        ) : (
          selectedOT.retraso && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100 text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <AlertTriangle size={12} /> Alerta Retraso
            </span>
          )
        )}
      </div>
    </div>
  );
};

const StaffAssignmentSection = ({
  editingTechnician,
  setEditingTechnician,
  machineOptions,
  technicians,
  assignedMachines,
  activeMachine,
  setActiveMachine,
  handleMachineSelection,
  machineAssignments,
  toggleMachineAssignment,
  assignTechnician,
}: {
  editingTechnician: boolean;
  setEditingTechnician: (val: boolean) => void;
  machineOptions: string[];
  technicians: string[];
  assignedMachines: string[];
  activeMachine: string | null;
  setActiveMachine: (val: string | null) => void;
  handleMachineSelection: (machine: string) => void;
  machineAssignments: Record<string, string[]>;
  toggleMachineAssignment: (machine: string, tech: string) => void;
  assignTechnician: () => void;
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Layers size={13} /> Gestión de Personal y Equipamiento
          </h3>
          <p className="text-[11px] text-slate-400">Asignación física de metrólogos y maquinaria para la ejecución del servicio.</p>
        </div>
        <button
          onClick={() => setEditingTechnician(!editingTechnician)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer border-none shadow-sm"
        >
          {editingTechnician ? "Ocultar Panel Asignación" : "Asignar Técnico / Máquina"}
        </button>
      </div>

      {editingTechnician && (
        <div className="space-y-5 animate-fadeIn">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">
                Maquinaria / Equipamiento en esta OT
              </div>
              <div className="grid gap-2">
                {machineOptions.map((machine) => {
                  const isSelected = assignedMachines.includes(machine);
                  const isActive = activeMachine === machine;
                  return (
                    <div
                      key={machine}
                      onClick={() => {
                        if (isSelected) setActiveMachine(machine);
                      }}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-xs font-semibold transition cursor-pointer ${
                        isActive
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                          : isSelected
                          ? "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100/70"
                          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleMachineSelection(machine)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded text-blue-600 focus:ring-blue-400 w-3.5 h-3.5"
                        />
                        <span className="font-bold">{machine}</span>
                      </div>
                      {isSelected && !isActive && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold">Ver Metrólogos</span>
                      )}
                      {isActive && <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-500 text-white font-bold">Editando</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-3">Panel de Configuración de Personal</div>
                {!activeMachine ? (
                  <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-xs text-slate-400 font-medium">
                    Seleccione o active un equipo en el panel izquierdo para gestionar sus técnicos asignados.
                  </div>
                ) : (
                  <div className="rounded-xl border border-blue-200 p-4 bg-gradient-to-b from-blue-50/40 to-white shadow-sm animate-fadeIn">
                    <div className="flex justify-between items-start mb-3 border-b border-blue-100 pb-2">
                      <div>
                        <span className="text-[10px] text-blue-500 font-extrabold uppercase tracking-widest block">Equipo Seleccionado</span>
                        <span className="font-black text-sm text-slate-800">{activeMachine}</span>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
                        Activo
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">Vincule los metrólogos autorizados para calibrar este instrumento:</p>
                    <div className="grid gap-2 grid-cols-2">
                      {technicians.map((tech) => {
                        const assigned = machineAssignments[activeMachine]?.includes(tech);
                        return (
                          <button
                            key={`${activeMachine}-${tech}`}
                            type="button"
                            onClick={() => toggleMachineAssignment(activeMachine, tech)}
                            className={`text-left rounded-xl border px-3 py-2 text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                              assigned
                                ? "bg-slate-900 border-slate-900 text-white font-bold shadow-sm"
                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                            }`}
                          >
                            <span>{tech}</span>
                            {assigned && <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {activeMachine && (
                <div className="flex justify-end mt-4 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={assignTechnician}
                    className="rounded-xl bg-emerald-600 text-white px-5 py-2 text-xs font-bold hover:bg-emerald-700 shadow-sm border-none cursor-pointer transition"
                  >
                    Guardar y Vincular Asignación
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface ComboboxInstrumentoProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}
interface ComboboxInstrumentoProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const ComboboxInstrumento: React.FC<ComboboxInstrumentoProps> = ({
  value,
  options,
  onChange,
  placeholder = "Buscar...",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  // Sincronizar valor externo con la búsqueda
  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(option);
    setSearch(option);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm pr-6"
      />
      {/* Icono de lupa SVG inline */}
      <svg
        className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>

      {isOpen && filtered.length > 0 && (
        <ul
          ref={dropdownRef}
          className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm"
        >
          {filtered.map((opt) => (
            <li
              key={opt}
              onClick={() => handleSelect(opt)}
              className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                opt === value
                  ? "bg-blue-50 font-bold text-blue-700"
                  : "text-slate-700"
              }`}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
      {isOpen && search && filtered.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-400 shadow-lg">
          Sin coincidencias
        </div>
      )}
    </div>
  );
};


type Instrument = {
  id: string;
  item: string;
  tipoServicio: string;
  instrumento: string;
  fabricante: string;
  modelo: string;
  serie: string;
  codigoInternoInventario: string;
  ubicacion: string;
  puntosCalibrar: string; // "0 g, 50 g, 100 g, 200 g, 200 g"
  unidad: string;
  intervaloMedicion: string;
  resolucionDivisionEscala: string;
  declaracionConformidad: string;
  empLimiteControl: string;
  documentoEspecificacion: string;
  reglaDecision: string;
};

interface InstrumentosTableProps {
  instrumentDrafts: Instrument[];
  updateInstrumentDraft: (id: string, field: keyof Instrument, value: string) => void;
  onAddInstrument: () => void;
  onRemoveInstrument: (id: string) => void;
  excedioLimite: boolean;
  tarifas: Array<{ tipoServicio: string; Instrumento: string }>; // Aseguramos que tenga estos dos campos
}

export const InstrumentosTable: React.FC<InstrumentosTableProps> = ({
  instrumentDrafts,
  updateInstrumentDraft,
  onAddInstrument,
  onRemoveInstrument,
  excedioLimite,
  tarifas,
}) => {
  const itemOptions = Array.from({ length: instrumentDrafts.length }, (_, i) => i + 1);

  // Listas únicas para los combos
  const tiposServicio = useMemo(() => {
    const tipos = tarifas.map((t) => t.tipoServicio).filter(Boolean);
    return Array.from(new Set(tipos)).sort();
  }, [tarifas]);

  const instrumentosList = useMemo(() => {
    const nombres = tarifas.map((t) => t.Instrumento).filter(Boolean);
    return Array.from(new Set(nombres)).sort();
  }, [tarifas]);

  // Manejo de puntos de calibración (sin cambios lógicos, solo formato)
  const handlePuntoChange = (id: string, puntoIndex: number, value: string) => {
    const instrument = instrumentDrafts.find((i) => i.id === id);
    if (!instrument) return;
    const puntosArray = instrument.puntosCalibrar
      ? instrument.puntosCalibrar.split(",").map((p) => p.trim())
      : ["", "", "", "", ""];
    while (puntosArray.length < 5) puntosArray.push("");
    puntosArray[puntoIndex] = value;
    const nuevoPuntosCalibrar = puntosArray.join(", ");
    updateInstrumentDraft(id, "puntosCalibrar", nuevoPuntosCalibrar);
  };

  const getPuntosArray = (inst: Instrument): string[] => {
    if (!inst.puntosCalibrar) return ["", "", "", "", ""];
    const arr = inst.puntosCalibrar.split(",").map((p) => p.trim());
    while (arr.length < 5) arr.push("");
    return arr.slice(0, 5);
  };

  return (
    <>
      <div className="p-2 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-400 font-mono flex flex-wrap gap-4">
        <span>* Nota A: Datos se emiten con info del primer apartado.</span>
        <span>* Nota B: Observaciones al final del flujo.</span>
        <span>* Nota C: Si carece de serie, la USC asignará uno.</span>
      </div>

      {excedioLimite && (
        <div className="mx-2 my-2 bg-amber-100 border-l-4 border-amber-500 text-amber-700 p-3 rounded-r-lg text-xs font-bold flex items-center gap-2">
          <span className="text-lg">⚠️</span> Has superado el límite de 10 instrumentos. Se requiere un anexo obligatorio.
        </div>
      )}

      <div className="p-2 flex justify-between items-center">
        <span className="text-xs text-slate-500">
          {instrumentDrafts.length} / 10 instrumentos
          {instrumentDrafts.length > 10 && (
            <span className="text-amber-600 font-bold ml-2">(Excedido)</span>
          )}
        </span>
        <button
          onClick={onAddInstrument}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-xl transition"
        >
          + Agregar instrumento
        </button>
      </div>

      <div className="overflow-x-auto max-w-full shadow-inner">
        <table className="w-full text-left border-collapse text-sm"> {/* Aumentamos tamaño base */}
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold tracking-wider text-xs">
              <th className="p-2.5 border-r border-slate-200 text-center min-w-[50px]">Item</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Tipo Servicio</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[180px]">Instrumento</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">Fabricante</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[120px]">Modelo</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[120px]">Serie</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Cód. Inventario</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">Ubicación</th>
              <th className="p-2.5 border-r border-slate-200 text-center" colSpan={5}>
                Puntos a Calibrar
              </th>
              <th className="p-2.5 border-r border-slate-200 min-w-[80px]">Unidad</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Intervalo medición</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Resolución</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Decl. Conformidad</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">EMP</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Doc Especificación</th>
              <th className="p-2.5 min-w-[150px]">Regla Decisión</th>
              <th className="p-2.5 min-w-[60px]">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-medium bg-white">
            {instrumentDrafts.map((inst) => {
              const puntos = getPuntosArray(inst);
              return (
                <tr key={inst.id} className="hover:bg-slate-50/50">
                  {/* Item */}
                  <td className="p-2 border-r border-slate-200 text-center">
                    <select
                      value={inst.item}
                      onChange={(e) => updateInstrumentDraft(inst.id, "item", e.target.value)}
                      className="w-full text-center bg-white border-b border-slate-300 outline-none font-bold text-slate-700 cursor-pointer py-1 text-sm"
                    >
                      {itemOptions.map((num) => (
                        <option key={num} value={num.toString()}>
                          {num}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Tipo de Servicio: Combobox editable */}
                  <td className="p-2 border-r border-slate-200">
                    <ComboboxInstrumento
                      value={inst.tipoServicio}
                      options={tiposServicio}
                      onChange={(value) => updateInstrumentDraft(inst.id, "tipoServicio", value)}
                      placeholder="Tipo de servicio"
                    />
                  </td>

                  {/* Instrumento: Combobox editable */}
                  <td className="p-2 border-r border-slate-200 font-bold text-slate-900">
                    <ComboboxInstrumento
                      value={inst.instrumento}
                      options={instrumentosList}
                      onChange={(value) => updateInstrumentDraft(inst.id, "instrumento", value)}
                      placeholder="Buscar instrumento"
                    />
                  </td>

                  {/* Resto de campos igual pero con padding aumentado */}
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.fabricante}
                      onChange={(e) => updateInstrumentDraft(inst.id, "fabricante", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Fabricante"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.modelo}
                      onChange={(e) => updateInstrumentDraft(inst.id, "modelo", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Modelo"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 font-mono">
                    <input
                      value={inst.serie}
                      onChange={(e) => updateInstrumentDraft(inst.id, "serie", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Serie"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.codigoInternoInventario}
                      onChange={(e) => updateInstrumentDraft(inst.id, "codigoInternoInventario", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Cód. inventario"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.ubicacion}
                      onChange={(e) => updateInstrumentDraft(inst.id, "ubicacion", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Ubicación"
                    />
                  </td>

                  {/* Puntos a Calibrar */}
                  <td className="p-2 border-r border-slate-200" colSpan={5}>
                    <div className="flex items-center gap-1.5">
                      {puntos.map((punto, idx) => (
                        <input
                          key={idx}
                          value={punto}
                          onChange={(e) => handlePuntoChange(inst.id, idx, e.target.value)}
                          className="w-16 text-center bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                          placeholder={`P${idx + 1}`}
                        />
                      ))}
                    </div>
                  </td>

                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.unidad}
                      onChange={(e) => updateInstrumentDraft(inst.id, "unidad", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Unidad"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.intervaloMedicion}
                      onChange={(e) => updateInstrumentDraft(inst.id, "intervaloMedicion", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Intervalo"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.resolucionDivisionEscala}
                      onChange={(e) => updateInstrumentDraft(inst.id, "resolucionDivisionEscala", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Resolución"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.declaracionConformidad}
                      onChange={(e) => updateInstrumentDraft(inst.id, "declaracionConformidad", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Decl. conformidad"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.empLimiteControl}
                      onChange={(e) => updateInstrumentDraft(inst.id, "empLimiteControl", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="EMP"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.documentoEspecificacion}
                      onChange={(e) => updateInstrumentDraft(inst.id, "documentoEspecificacion", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Doc. especificación"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.reglaDecision}
                      onChange={(e) => updateInstrumentDraft(inst.id, "reglaDecision", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Regla decisión"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      onClick={() => onRemoveInstrument(inst.id)}
                      className="text-red-500 hover:text-red-700 font-bold text-lg"
                      title="Eliminar instrumento"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
interface OrderFormRCM05Props {
  editingOrder: boolean;
  setEditingOrder: (val: boolean) => void;
  orderDraft: EditableOrderFields | null;
  updateOrderDraft: <K extends keyof EditableOrderFields>(field: K, value: EditableOrderFields[K]) => void;
  instrumentDrafts: Instrument[];
  updateInstrumentDraft: (id: string, field: keyof Instrument, value: string) => void;
  technicians: string[];
  saveOrderEdits: () => void;
  onAddInstrument: () => void;
  onRemoveInstrument: (id: string) => void;
  tarifas:TarifaModel[];
}
export const OrderFormRCM05: React.FC<OrderFormRCM05Props> = ({
  editingOrder,
  setEditingOrder,
  orderDraft,
  updateOrderDraft,
  instrumentDrafts,
  updateInstrumentDraft,
  technicians,
  saveOrderEdits,
  onAddInstrument,
  onRemoveInstrument,
  tarifas,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    datosCertificado: true,
    instrumentos: true,
    calibracion: true,
    solicitante: true,
    consecutivo: true,
    observaciones: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // --- Estado para sugerencias (autocompletado) ---
  const [suggestions, setSuggestions] = useState<{
    razonesSociales: string[];
    instrumentos: string[];
    fabricantes: string[];
    modelos: string[];
  }>({
    razonesSociales: [],
    instrumentos: [],
    fabricantes: [],
    modelos: [],
  });

  useEffect(() => {
    const fetchSuggestions = async () => {
      // Simulación de datos
      const data = {
        razonesSociales: ['Empresa A', 'Empresa B', 'Corporación X', 'Laboratorio Y'],
        instrumentos: ['Multímetro', 'Osciloscopio', 'Termómetro', 'Balanza', 'Manómetro'],
        fabricantes: ['Fluke', 'Keysight', 'Tektronix', 'Thermo Fisher', 'Mettler Toledo'],
        modelos: ['87V', '34401A', 'TDS2024', 'Orion Star', 'XSR204'],
      };
      setSuggestions(data);
    };
    fetchSuggestions();
  }, []);

  // ===== REGLA DE ANEXO: si hay más de 10 instrumentos, forzar "Si" y mostrar aviso =====
  const requiereAnexo = orderDraft?.requiereAnexo || 'No';
  const excedioLimite = instrumentDrafts.length > 10;

  useEffect(() => {
    if (excedioLimite && orderDraft) {
      // Forzar "Si" si supera 10
      if (orderDraft.requiereAnexo !== 'Si') {
        updateOrderDraft('requiereAnexo', 'Si');
      }
    }
  }, [excedioLimite, orderDraft, updateOrderDraft]);

  if (!orderDraft) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      {/* Cabecera general */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Edit3 size={15} /> Formulario R-CM05
          </h3>
          <p className="text-xs text-slate-400">
            Edición en caliente estructurada según la disposición jerárquica del Excel original.
          </p>
        </div>
        <button
          onClick={() => setEditingOrder(!editingOrder)}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer border-none shadow-sm transition"
        >
          {editingOrder ? 'Bloquear Edición' : 'Habilitar Campos del Formulario'}
        </button>
      </div>

      {editingOrder && (
        <div className="space-y-6 animate-fadeIn">
          {/* ========== SECCIÓN 2: DATOS PARA CERTIFICADO ========== */}
          <Section
            title="2. DATOS PARA CERTIFICADO"
            subtitle="Información a diligenciar por el cliente"
            isExpanded={expandedSections.datosCertificado}
            onToggle={() => toggleSection('datosCertificado')}
            bgHeader="bg-slate-900"
          >
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Field
                  label="Razón Social"
                  value={orderDraft.razonSocialCert}
                  onChange={(v) => updateOrderDraft('razonSocialCert', v)}
                  list="razonesSociales"
                />
                <Field label="NIT" value={orderDraft.nitCert} onChange={(v) => updateOrderDraft('nitCert', v)} />
                <Field
                  label="Correo Certificados"
                  type="email"
                  value={orderDraft.correoCertificados}
                  onChange={(v) => updateOrderDraft('correoCertificados', v)}
                />
                <Field
                  label="Límite Facturación"
                  type="date"
                  value={orderDraft.fechaLimiteFacturacion}
                  onChange={(v) => updateOrderDraft('fechaLimiteFacturacion', v)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field
                  label="Dirección"
                  value={orderDraft.direccionCert}
                  onChange={(v) => updateOrderDraft('direccionCert', v)}
                />
                <Field label="Ciudad" value={orderDraft.ciudadCert} onChange={(v) => updateOrderDraft('ciudadCert', v)} />
                <Field
                  label="Correo Envío Factura"
                  type="email"
                  value={orderDraft.correoFactura}
                  onChange={(v) => updateOrderDraft('correoFactura', v)}
                />
              </div>
            </div>
          </Section>

          {/* ========== SECCIÓN 3: INFORMACIÓN DE LOS INSTRUMENTOS ========== */}
          <Section
            title="3. INFORMACIÓN DE LOS INSTRUMENTOS"
            subtitle="Información a diligenciar por el cliente"
            isExpanded={expandedSections.instrumentos}
            onToggle={() => toggleSection('instrumentos')}
            bgHeader="bg-blue-950"
          >

       <InstrumentosTable
  instrumentDrafts={instrumentDrafts}
  updateInstrumentDraft={updateInstrumentDraft}
  onAddInstrument={onAddInstrument}
  onRemoveInstrument={onRemoveInstrument} // implementar similar
  excedioLimite={instrumentDrafts.length > 10}
  tarifas={tarifas}
/>
            
          </Section>

          {/* ========== SECCIÓN 4: INFORMACIÓN DE CALIBRACIÓN ========== */}
          <Section
            title="4. INFORMACIÓN DE CALIBRACIÓN"
            subtitle="Llenar solo si la calibración es en sitio"
            isExpanded={expandedSections.calibracion}
            onToggle={() => toggleSection('calibracion')}
            bgHeader="bg-blue-900"
          >
            <div className="p-4 space-y-4">
              <div>
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Lugar de Calibración
                </span>
                <div className="flex gap-6">
                  {['Interno USC', 'En sitio', 'Laboratorio permanente'].map((lugar) => (
                    <label key={lugar} className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="lugarCalibracionRadio"
                        checked={orderDraft.lugarCalibracion === lugar}
                        onChange={() => updateOrderDraft('lugarCalibracion', lugar as any)}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      {lugar}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Field
                  label="Persona a Contactar"
                  value={orderDraft.personaContactar}
                  onChange={(v) => updateOrderDraft('personaContactar', v)}
                />
                <Field
                  label="Teléfono"
                  value={orderDraft.telefonoCalibracion}
                  onChange={(v) => updateOrderDraft('telefonoCalibracion', v)}
                />
                <Field
                  label="Fecha"
                  type="date"
                  value={
                        orderDraft.fechaCalibracion
                          ? new Date(orderDraft.fechaCalibracion).toISOString().split('T')[0]
                          : ''
                      }
                  onChange={(v) => updateOrderDraft('fechaCalibracion', v.toString())}
                />
                <Field
                  label="Hora"
                  type="time"
                  value={
                  orderDraft.horaCalibracion
                    ? new Date(orderDraft.horaCalibracion).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })
                    : ''
                }
                  onChange={(v) => updateOrderDraft('horaCalibracion', v)}
                />
              </div>
            </div>
          </Section>

          {/* ========== SECCIÓN 5 (dos bloques en paralelo) ========== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section
              title="5. INFORMACIÓN DEL SOLICITANTE"
              subtitle="Diligenciar por la USC"
              isExpanded={expandedSections.solicitante}
              onToggle={() => toggleSection('solicitante')}
              bgHeader="bg-slate-800"
            >
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Razón Social"
                  value={orderDraft.razonSocialSolicitante}
                  onChange={(v) => updateOrderDraft('razonSocialSolicitante', v)}
                  list="razonesSociales"
                />
                <Field
                  label="NIT"
                  value={orderDraft.nitSolicitante}
                  onChange={(v) => updateOrderDraft('nitSolicitante', v)}
                />
                <Field
                  label="Dirección"
                  value={orderDraft.direccionSolicitante}
                  onChange={(v) => updateOrderDraft('direccionSolicitante', v)}
                />
                <Field
                  label="Ciudad"
                  value={orderDraft.ciudadSolicitante}
                  onChange={(v) => updateOrderDraft('ciudadSolicitante', v)}
                />
                <Field
                  label="Contacto"
                  value={orderDraft.contactoSolicitante}
                  onChange={(v) => updateOrderDraft('contactoSolicitante', v)}
                />
                <Field
                  label="Teléfono"
                  value={orderDraft.telefonoSolicitante}
                  onChange={(v) => updateOrderDraft('telefonoSolicitante', v)}
                />
              </div>
            </Section>

            <Section
              title="5. CONSECUTIVO Y FECHA DE DILIGENCIAMIENTO"
              subtitle="Diligenciar por la USC"
              isExpanded={expandedSections.consecutivo}
              onToggle={() => toggleSection('consecutivo')}
              bgHeader="bg-blue-900"
            >
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="No. Orden de Trabajo"
                  value={orderDraft.noOrdenTrabajo}
                  onChange={(v) => updateOrderDraft('noOrdenTrabajo', v)}
                  className="font-mono font-bold text-blue-600"
                />
                <Field
                  label="No. Cotización"
                  value={orderDraft.noCotizacion}
                  onChange={(v) => updateOrderDraft('noCotizacion', v)}
                  className="font-mono"
                />
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Responsable
                  <select
                    value={orderDraft.responsableUsc}
                    onChange={(e) => updateOrderDraft('responsableUsc', e.target.value)}
                    className="w-full mt-1 border border-slate-200 rounded-xl p-2 text-xs bg-white outline-none focus:border-blue-500"
                  >
                    {technicians.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Fecha"
                  type="date"
                  value={orderDraft.fechaDiligenciamiento}
                  onChange={(v) => updateOrderDraft('fechaDiligenciamiento', v)}
                />
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider sm:col-span-2">
                  Estado Interno del Flujo
                  <select
                    value={orderDraft.estadoOrden}
                    onChange={(e) => updateOrderDraft('estadoOrden', e.target.value)}
                    className="w-full mt-1 border border-slate-200 rounded-xl p-2 text-xs bg-white outline-none focus:border-blue-500 font-bold"
                  >
                    {kanbanColumns.map((c) => (
                      <option key={c.key}>{c.key}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-3 border border-amber-200 bg-amber-50/50 rounded-xl px-3 py-2.5 sm:col-span-2 text-xs font-bold text-slate-700">
                  <select
                    value={orderDraft.requiereAnexo}
                    onChange={(e) => updateOrderDraft('requiereAnexo', e.target.value as any)}
                    className={`border p-1.5 rounded-lg text-xs font-black outline-none ${
                      excedioLimite ? 'border-red-400 bg-red-100 text-red-800' : 'border-amber-300 bg-amber-200 text-amber-950'
                    }`}
                    disabled={excedioLimite} // Bloqueamos el cambio si se excedió
                  >
                    <option value="No">No</option>
                    <option value="Si">Sí</option>
                  </select>
                  <span>¿Requiere de un anexo para el ingreso de información de más instrumentos?</span>
                  {excedioLimite && (
                    <span className="ml-auto text-red-600 text-[10px] font-bold">(Obligatorio por exceder 10)</span>
                  )}
                </label>
              </div>
            </Section>
          </div>

          {/* ========== SECCIÓN 6: OBSERVACIONES ========== */}
          <Section
            title="6. OBSERVACIONES (Cumplimiento Nota B)"
            isExpanded={expandedSections.observaciones}
            onToggle={() => toggleSection('observaciones')}
            bgHeader="bg-slate-700"
          >
            <div className="p-4">
              <textarea
                value={orderDraft.observacionesGenerales}
                onChange={(e) => updateOrderDraft('observacionesGenerales', e.target.value)}
                rows={3}
                className="w-full border border-slate-200 rounded-xl p-3 text-xs outline-none focus:border-blue-500 font-medium resize-none bg-white"
                placeholder="Indique aquí los requerimientos adicionales para el servicio o anomalías observadas..."
              />
            </div>
          </Section>

          {/* Botón guardar */}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={saveOrderEdits}
              className="rounded-xl bg-emerald-600 text-white px-6 py-2.5 font-bold text-xs hover:bg-emerald-700 shadow-md border-none cursor-pointer transition"
            >
              Consolidar Orden R-CM05
            </button>
          </div>
        </div>
      )}

      {/* Datalists globales para sugerencias */}
      <datalist id="razonesSociales">
        {suggestions.razonesSociales.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="instrumentos">
        {suggestions.instrumentos.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="fabricantes">
        {suggestions.fabricantes.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id="modelos">
        {suggestions.modelos.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </div>
  );
};

// ===== COMPONENTES AUXILIARES =====

interface SectionProps {
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  bgHeader?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({
  title,
  subtitle,
  isExpanded,
  onToggle,
  bgHeader = 'bg-slate-900',
  children,
}) => (
  <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/20">
    <div
      className={`${bgHeader} px-4 py-2.5 border-b border-slate-800 text-white font-bold text-[11px] uppercase tracking-wider flex justify-between items-center cursor-pointer select-none`}
      onClick={onToggle}
    >
      <span>{title}</span>
      <div className="flex items-center gap-3">
        {subtitle && <span className="text-[9px] text-slate-400 font-normal lowercase italic">{subtitle}</span>}
        <span className="text-lg font-light">{isExpanded ? '−' : '+'}</span>
      </div>
    </div>
    <div
      className={`transition-all duration-300 overflow-hidden ${
        isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'
      }`}
    >
      {children}
    </div>
  </div>
);

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  list?: string;
  className?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, type = 'text', list, className = '' }) => (
  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
    {label}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      list={list}
      className={`w-full mt-1 border border-slate-200 rounded-xl p-2 text-xs outline-none focus:border-blue-500 bg-white ${className}`}
    />
  </label>
);

export type OrdenTrabajoVista = {
  idOrdenTrabajo: number;
  codigo: string;
  clienteNombre: string;
  responsable: string | null;
  fechaCalibracion: Date | null;
  fechaLimiteFacturacion: Date | null;
  estado: string;
  equiposCount: number;
  retraso: boolean;
};

export const kanbanColumns = [
  { key: "Creada", label: "Creada", color: "#94A3B8" },
  { key: "En_recepción", label: "En recepción", color: "#F59C0B" },
  { key: "Asignada", label: "Asignada", color: "#5680F9" },
  { key: "En_calibración", label: "En calibración", color: "#9A8CF3" },
  { key: "Certificado_en_revisión", label: "Certificado en revisión", color: "#F59C0B" },
  { key: "Certificado_aprobado", label: "Certificado aprobado", color: "#22C55E" },
  { key: "Certificado_enviado", label: "Certificado enviado", color: "#4C36D0" },
];

interface KanbanBoardViewProps {
  otsList: Partial<OTBase>[];
  collapsedColumns: Record<string, boolean>;
  toggleColumnCollapse: (key: string) => void;
  onOpenOT: (ot: Partial<OTBase>) => void;
  warnigs?:Warning[]

}

// ====== COMPONENTE ======
export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  otsList,
  collapsedColumns,
  toggleColumnCollapse,
  onOpenOT,
  warnigs,

}) => {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4 items-start select-none scrollbar-none snap-x snap-mandatory">
      {kanbanColumns.map((col) => {
        const colOts = otsList.filter((o) => o.estado === col.key);
        const isCollapsed = collapsedColumns[col.key] || false;

        // Columna colapsada
        if (isCollapsed) {
          return (
            <div
              key={col.key}
              className="flex-shrink-0 w-11 bg-slate-200/70 border border-slate-300/80 rounded-2xl flex flex-col items-center py-4 gap-4 transition-all duration-300 hover:bg-slate-200 snap-start"
            >
              <button
                onClick={() => toggleColumnCollapse(col.key)}
                className="p-1 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer"
                title="Expandir columna"
              >
                <ChevronRight size={12} className="text-slate-600" />
              </button>
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black text-white shadow-sm"
                style={{ background: col.color }}
              >
                {colOts.length}
              </span>
              <div className="text-[11px] font-black uppercase text-slate-500 tracking-widest whitespace-nowrap [writing-mode:vertical-lr] rotate-180 select-none">
                {col.label}
              </div>
            </div>
          );
        }

        // Columna expandida
        return (
          <div
            key={col.key}
            className="flex-shrink-0 w-[260px] md:w-[280px] rounded-2xl bg-white border border-slate-200 transition-all duration-300 shadow-sm snap-start"
          >
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 bg-slate-50/50">
              <div className="flex items-center gap-2 truncate">
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white shadow-sm flex-shrink-0"
                  style={{ background: col.color }}
                >
                  {colOts.length}
                </span>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider truncate">
                  {col.label}
                </span>
              </div>
              <button
                onClick={() => toggleColumnCollapse(col.key)}
                title="Colapsar Columna"
                className="p-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer flex-shrink-0"
              >
                <ChevronLeft size={12} className="text-slate-400" />
              </button>
            </div>

            <div className="p-3 flex flex-col gap-3 min-h-[480px] max-h-[600px] overflow-y-auto bg-slate-50/20">
              {colOts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-300 font-medium text-[10px] uppercase tracking-wider border border-dashed border-slate-200/60 rounded-xl bg-white/40">
                  Sin Órdenes
                </div>
              ) : (
                colOts.map((ot) => (
                  <div
                    key={ot.id}
                    onClick={() => onOpenOT(ot)}
                    className="p-4 rounded-xl cursor-pointer bg-white border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                    style={{
                      borderLeft: ot.retraso ? "4px solid #EF4444" : "1px solid #E2E8F0",
                    }}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <span className="text-xs font-bold text-blue-600 font-mono">
                        {ot.codigo}
                      </span>
                      { (ot.warns?.length?ot.warns:false) && (
                        <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-700 mb-2 truncate">
                      {ot.cliente}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                      <User size={12} />
                      <span>{ot.tecnico || "Sin asignar"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5">
                      <Calendar size={12} />
                      <span>
                        {ot.fecha
                          ? new Date(ot.fecha).toLocaleDateString()
                          : "Sin fecha"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1">
                      <Wrench size={12} />
                      <span>
                        {ot.equipos} equipo{ot.equipos !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};




/**
 * Props para ListViewTable
 */
interface ListViewTableProps {
  otsList: Partial<OTBase>[];
  search: string;
  onOpenOT: (ot: Partial<OTBase>) => void;
}

/**
 * Vista de tabla para las órdenes de trabajo.
 * Filtra por código o nombre del cliente.
 */
export const ListViewTable: React.FC<ListViewTableProps> = ({
  otsList,
  search,
  onOpenOT,
}) => {
  const filteredOTs = useMemo(() => {
    if (!search) return otsList;
    const lowerSearch = search.toLowerCase();
    return otsList.filter(
      (ot) =>
        ot.codigo?.toLowerCase().includes(lowerSearch) ||
        ot.cliente?.toLowerCase().includes(lowerSearch)
    );
  }, [otsList, search]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Contenedor con scroll horizontal para tablas anchas */}
      <div className="overflow-x-auto">
        <table className="min-w-[600px] w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider">
                Código
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider">
                Cliente
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider hidden sm:table-cell">
                Equipos
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider hidden md:table-cell">
                Responsable
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider">
                Estado
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider hidden lg:table-cell">
                F. Calibración
              </th>
              <th className="px-4 py-3 text-slate-400 font-bold uppercase tracking-wider">
                Acción
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOTs.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-12 text-center text-slate-400 font-medium text-xs"
                >
                  No se encontraron órdenes con el criterio de búsqueda.
                </td>
              </tr>
            ) : (
              filteredOTs.map((ot) => (
                <tr
                  key={ot.id}
                  className="transition hover:bg-slate-50/40 bg-white"
                >
                  <td className="px-4 py-3.5 font-mono text-blue-600 font-semibold">
                    {ot.codigo}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-800">
                    {ot.cliente}
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 hidden sm:table-cell">
                    {ot.equipos}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium hidden md:table-cell">
                    {ot.tecnico || "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
                      {(ot.estado?ot.estado.toString():"sin estado ").replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 font-mono hidden lg:table-cell">
                    {ot.fecha
                      ? new Date(ot.fecha).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => onOpenOT(ot)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200 font-bold transition border-none cursor-pointer"
                    >
                      <Eye size={13} />
                      <span className="hidden sm:inline">Gestionar</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==========================================
// 3. COMPONENTE PADRE
// ==========================================
import { obtenerDatosIniciales } from "@/app/action_module/ordenes";
import { useDbTable, useDbActions, OrdenTrabajoModel, UsuarioModel, CotizacionModel, RecepcionEquipoDetalleModel, TarifaModel } from "@/app/componets/tables_recharge";
export const OrdenesTrabajo = () => {
  // Suscripción selectiva por tabla (solo re-renderiza si esa tabla cambia)
  const usuarios = useDbTable("usuarios");
  const roles = useDbTable("roles");
  const ordenesTrabajo = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const documentos = useDbTable("documentos");
  const tarifas = useDbTable("tarifas");
  const { setDbState } = useDbActions();

  // Vista actual (kanban, lista o detalle de OT)
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  // Búsqueda para filtrar órdenes
  const [search, setSearch] = useState("");
  // OT seleccionada (cuando se hace clic en una tarjeta o fila)
  const [selectedOT, setSelectedOT] = useState<OTType | null>(null);
  // Edición del formulario R-CM05 habilitada
  const [editingOrder, setEditingOrder] = useState(false);
  // Edición de asignación de técnicos
  const [editingTechnician, setEditingTechnician] = useState(false);
  // Borrador actual del formulario
  const [orderDraft, setOrderDraft] = useState<EditableOrderFields | null>(null);
  // Instrumentos editables en la tabla
  const [instrumentDrafts, setInstrumentDrafts] = useState<Instrument[]>(defaultInstrumentos);
  // Técnicos asignados
  const [assignedTechnicians, setAssignedTechnicians] = useState<string[]>([]);
  // Máquinas seleccionadas
  const [assignedMachines, setAssignedMachines] = useState<string[]>([]);
  // Mapeo de máquina -> técnicos
  const [machineAssignments, setMachineAssignments] = useState<Record<string, string[]>>({});
  // Mensaje toast temporal
  const [toast, setToast] = useState("");

  // Control de columnas colapsadas en el Kanban
  const [collapsedColumns, setCollapsedColumns] = useState<Record<string, boolean>>({
    Creada: false,
    "Certificado enviado": false,
  });
  // Máquina activa en el panel de asignación
  const [activeMachine, setActiveMachine] = useState<string | null>(null);

  /**
   * Alterna la visibilidad de una columna del Kanban (colapsada/expandida).
   */
  const toggleColumnCollapse = (columnKey: string) => {
    setCollapsedColumns((prev) => ({ ...prev, [columnKey]: !prev[columnKey] }));
  };

  /**
   * Obtiene los técnicos con roles específicos desde los datos de usuarios y roles.
   */
  const technicians = useMemo(() => {
    const tecnicos = usuarios.filter((u) =>
      roles.some(
        (rol) =>
          rol.nombreRol === "Técnico" ||
          rol.nombreRol === "Coordinadora" ||
          rol.nombreRol === "Director Técnico"
      ) &&
      (u.elminado === true || u.estado === false) // Nota: condición extraña, revisar lógica de negocio
    );
    return tecnicos.map((u) => u.nombreCompleto);
  }, [usuarios, roles]);

  const machineOptions = [
    "Balanza analítica",
    "Higrómetro",
    "Calibrador",
    "Transductor de presión",
    "Termómetro industrial",
  ];

  /**
   * Abre una OT desde la vista de lista/tablero: busca los datos completos en dbState,
   * arma el objeto OTType y lo establece como seleccionada.
   */
  const openOT = (otPreview: Partial<OTBase>) => {
    const otCompleta = ordenesTrabajo.find(
      (o) => o.idOrdenTrabajo.toString() === otPreview.id
    );
    if (!otCompleta) {
      showToast("Error: No se encontró la orden completa.");
      return;
    }

    const clienteData = clientes.find(
      (c) => c.idCliente === otCompleta.idCliente
    );

    const instrumentosMapeados: Instrument[] = (otCompleta.instrumentos || []).map(
      (detalle) => ({
        id: detalle.idDetalle?.toString() || crypto.randomUUID(),
        item: detalle.item?.toString() || "1",
        tipoServicio: detalle.tipoServicio || "",
        instrumento: detalle.instrumento || "",
        fabricante: detalle.fabricante || "",
        modelo: detalle.modelo || "",
        serie: detalle.serie || "",
        codigoInternoInventario: detalle.codigoInventario || "",
        ubicacion: detalle.ubicacion || "",
        puntosCalibrar: Array.isArray(detalle.puntosCalibrar)
          ? detalle.puntosCalibrar.join(", ")
          : detalle.puntosCalibrar || "",
        unidad: detalle.unidad || "",
        intervaloMedicion: detalle.intervaloRango || "",
        resolucionDivisionEscala: detalle.resolucion || "",
        declaracionConformidad: detalle.declaracionConformidad ? "Aplica" : "No aplica",
        empLimiteControl: detalle.limiteControlEMC || "",
        documentoEspecificacion: detalle.docEspecificacion || "",
        reglaDecision: detalle.reglaDecision || "",
      })
    );

    // Obtener la última versión de los documentos asociados a la cotización
    const version = (() => {
      if (otCompleta.idCotizacion == null) return 0;
      const docs = documentos.filter(
        (d) => d.idCotizacion === otCompleta.idCotizacion
      );
      const ultima = docs
        .flatMap((d) => d.versiones)
        .sort((a, b) => b.version - a.version)[0];
      return ultima?.version ?? 0;
    })();

    const otCompleto: OTType = {
      id: otPreview.id || otCompleta.idOrdenTrabajo.toString(),
      cliente: clienteData?.razonSocial || "Sin cliente",
      tecnico: otCompleta.responsable || "Sin asignar",
      fecha: otCompleta.fechaCalibracion?.toString() || "",
      estado: otCompleta.estado,
      retraso: otPreview.retraso || false,
      equipos: instrumentosMapeados.length,
      tipo: "Acreditado",
      razonSocialCert: clienteData?.razonSocial || "",
      nitCert: clienteData?.nitCedula || "",
      correoCertificados: otCompleta.correoCertificado || "",
      fechaLimiteFacturacion: otCompleta.fechaLimiteFacturacion?.toLocaleDateString(),
      ciudadCert: clienteData?.ciudad || "",
      correoFactura: otCompleta.correoFactura || "",
      lugarCalibracion: otCompleta.esInternoUSC
        ? "Interno USC"
        : otCompleta.esEnSitio
        ? "En sitio"
        : "Laboratorio permanente",
      personaContactar: otCompleta.personaContacto || clienteData?.nombreContacto || "",
      telefonoCalibracion: otCompleta.telefonoContacto || clienteData?.telefono || "",
      fechaCalibracion: otCompleta.fechaCalibracion?.toString() || "",
      horaCalibracion: otCompleta.hora.toString(),
      razonSocialSolicitante: otCompleta.cliente?.razonSocial||"",
      nitSolicitante: otCompleta.cliente?.nitCedula,
      direccionSolicitante: otCompleta.cliente?.dirrecion,
      ciudadSolicitante: otCompleta.cliente?.ciudad||"sin ciudad",
      contactoSolicitante: otCompleta.cliente?.nombreContacto||"sin contacto",
      telefonoSolicitante: "5183000",
      noOrdenTrabajo: otCompleta.codigo,
      noCotizacion: otCompleta.cotizacion?.codigo?.toString() || "",
      responsableUsc: otCompleta.responsable || "",
      fechaDiligenciamiento: otCompleta.createdAt?.toString() || "",
      requiereAnexo: otCompleta.requireAnexo ? "Si" : "No",
      estadoOrden: otCompleta.estado,
      observacionesGenerales: otCompleta.observaciones || "",
      estado_revision: otCompleta.estadoRevision,
      ultima_version: version.toString(),
      maquinas: [],
      tecnicos: otCompleta.responsable ? [otCompleta.responsable] : [],
      asignaciones: {},
      instrumentos: instrumentosMapeados,
    };

    setSelectedOT(otCompleto);
    setEditingTechnician(false);
    setOrderDraft(buildOrderDraft(otCompleto));
    setInstrumentDrafts(instrumentosMapeados);
    setAssignedTechnicians(otCompleta.responsable ? [otCompleta.responsable] : []);
    setAssignedMachines([]);
    setMachineAssignments({});
    setActiveMachine(null);
  };

  /**
   * Cierra la vista de detalle de la OT y resetea los estados relacionados.
   */
  const closeOT = () => {
    setSelectedOT(null);
    setEditingOrder(false);
    setEditingTechnician(false);
    setOrderDraft(null);
    setInstrumentDrafts(defaultInstrumentos);
    setActiveMachine(null);
  };

  // Handlers para la sección de asignación de técnicos/máquinas
  const handleMachineSelection = (machine: string) => {
    setAssignedMachines((prev) => {
      const isCurrentlySelected = prev.includes(machine);
      let nextMachines: string[];
      if (isCurrentlySelected) {
        nextMachines = prev.filter((m) => m !== machine);
        setMachineAssignments((prevAssignments) => {
          const nextAssignments = { ...prevAssignments };
          delete nextAssignments[machine];
          return nextAssignments;
        });
        if (activeMachine === machine) {
          setActiveMachine(nextMachines.length > 0 ? nextMachines[0] : null);
        }
      } else {
        nextMachines = [...prev, machine];
        setActiveMachine(machine);
      }
      return nextMachines;
    });
  };

  const toggleMachineAssignment = (machine: string, technician: string) => {
    setMachineAssignments((prev) => {
      const current = prev[machine] || [];
      const next = current.includes(technician)
        ? current.filter((t) => t !== technician)
        : [...current, technician];
      return { ...prev, [machine]: next };
    });
    if (!assignedTechnicians.includes(technician)) {
      setAssignedTechnicians((prev) => [...prev, technician]);
    }
  };

  const updateOrderDraft = <K extends keyof EditableOrderFields>(
    field: K,
    value: EditableOrderFields[K]
  ) => {
    setOrderDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateInstrumentDraft = (id: string, field: keyof Instrument, value: string) => {
    setInstrumentDrafts((prev) =>
      prev.map((instrument) =>
        instrument.id === id ? { ...instrument, [field]: value } : instrument
      )
    );
  };

  const saveOrderEdits = () => {
    if (!selectedOT || !orderDraft) return;
    const updatedOT: OTType = {
      ...selectedOT,
      ...orderDraft,
      estado: orderDraft.estadoOrden,
      tecnico: orderDraft.responsableUsc,
      instrumentos: instrumentDrafts,
    };
    setSelectedOT(updatedOT);
    setAssignedTechnicians(
      orderDraft.responsableUsc ? [orderDraft.responsableUsc] : []
    );
    setEditingOrder(false);
    showToast("✅ Cambios guardados de acuerdo al formato R-CM05.");
  };

  const assignTechnician = () => {
    if (!selectedOT) return;
    setSelectedOT({
      ...selectedOT,
      tecnico:
        assignedTechnicians.length === 1
          ? assignedTechnicians[0]
          : assignedTechnicians.length > 1
          ? "Múltiples técnicos"
          : selectedOT.tecnico,
      tecnicos: assignedTechnicians,
      maquinas: assignedMachines,
      asignaciones: machineAssignments,
    });
    setEditingTechnician(false);
    showToast(`✅ Asignación física consolidada en el laboratorio.`);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  /**
   * Carga inicial de datos: usuarios, órdenes, clientes, tarifas, roles y documentos.
   * Se ejecuta una sola vez al montar el componente.
   */
  useEffect(() => {
    async function initdata() {
      try {
        const res = await obtenerDatosIniciales();

        // Procesamos cada conjunto de datos
        for (let i = 0; i < 6; i++) {
          switch (i) {
            case 0: {
              // Usuarios: omitimos el campo contraseña por seguridad
              const parsedUsers = res.usuarios.map((e): Omit<UsuarioModel, "contraseña"> => ({
                idUsuario: e.idUsuario,
                correo: e.correo,
                createdAt: e.createdAt,
                elminado: e.elminado, // typo conocido en BD: "elminado"
                estado: e.estado,
                idRol: e.idRol,
                intentos: e.intentos,
                nombreCompleto: e.nombreCompleto,
                updatedAt: e.updatedAt,
              }));
              setDbState((prev) => ({ ...prev, usuarios: parsedUsers }));
              break;
            }
            case 1: {
              setDbState((prev) => ({ ...prev, ordenes_trabajo: res.ordenes }));
              break;
            }
            case 2: {
              setDbState((prev) => ({ ...prev, clientes: res.clientes }));
              break;
            }
            case 3: {
              // Tarifas: mapeamos el historial de precios
              const parsedTarifas = ((res.tarifas || []) as TarifaModel[]).map(
                (tarifa): TarifaModel => ({
                  ...tarifa,
                  historial: tarifa.historial}
              ));
              setDbState((prev) => ({ ...prev, tarifas: parsedTarifas }));
              break;
            }
            case 4: {
              setDbState((prev) => ({ ...prev, roles: res.roles }));
              break;
            }
            case 5: {
              // Documentos con sus versiones (si vienen en la respuesta)
              setDbState((prev) => ({ ...prev, documentos: res.version }));
              break;
            }
            default:
              break;
          }
        }
      } catch (error) {
        console.error("Error al obtener datos iniciales:", error);
      }
    }
    initdata();
  }, []);

  /**
   * Calcula las advertencias (warnings) para la OT seleccionada.
   */
  const warnings = useMemo<Warning[]>(() => {
    if (!selectedOT) return [];
    const warns: Warning[] = [];
    if (selectedOT.retraso) warns.push({ tipo: "retraso", mensaje: "Vencida" });
    if (!selectedOT.tecnico || selectedOT.tecnico === "Sin asignar")
      warns.push({ tipo: "sin_responsable", mensaje: "Sin responsable" });
    if (!selectedOT.fechaCalibracion)
      warns.push({ tipo: "sin_fecha", mensaje: "Sin fecha calibración" });
    if (selectedOT.instrumentos && selectedOT.instrumentos.length > 10)
      warns.push({ tipo: "exceso_instrumentos", mensaje: ">10 instrumentos" });
    if (selectedOT.estado_revision === "PENDIENTE_REVISION")
      warns.push({ tipo: "pendiente_revision", mensaje: "Pendiente revisión" });
    return warns;
  }, [selectedOT]);

  /**
   * Convierte la lista de órdenes de trabajo del estado global al formato que
   * esperan los componentes Kanban/Lista (Partial<OTBase>).
   * Además, calcula las advertencias individuales de cada orden.
   */
  const otss: Partial<OTBase>[] = useMemo(() => {
    return ordenesTrabajo.map((orden) => {
      const cliente = clientes.find((c) => c.idCliente === orden.idCliente);
      const ordenWarnings: Warning[] = [];

      // Retraso basado en fecha límite de facturación
      const ahora = new Date();
      const fechaLimite = orden.fechaLimiteFacturacion
        ? new Date(orden.fechaLimiteFacturacion)
        : new Date();
      const estaVencida = ahora >= fechaLimite;
      if (estaVencida) {
        ordenWarnings.push({ tipo: "retraso", mensaje: "Vencida" });
      }

      if (!orden.responsable || orden.responsable == "Sin asignar") {
        ordenWarnings.push({ tipo: "sin_responsable", mensaje: "Sin responsable" });
      }
      if (!orden.fechaCalibracion) {
        ordenWarnings.push({ tipo: "sin_fecha", mensaje: "Sin fecha calibración" });
      }
      if (orden.estadoRevision === "PENDIENTE_REVISION") {
        ordenWarnings.push({ tipo: "pendiente_revision", mensaje: "Pendiente revisión" });
      }

      return {
        id: orden.idOrdenTrabajo.toString(),
        cliente: cliente?.razonSocial ?? "Sin cliente",
        fecha: orden.fechaCalibracion?.toString(),
        tecnico: orden.responsable?.toString(),
        equipos: orden.instrumentos?.length ?? 0,
        estado: orden.estado,
        codigo: orden.codigo,
        retraso: estaVencida,
        warns: ordenWarnings,
      };
    });
  }, [ordenesTrabajo, clientes]);

  /**
   * Filtra las órdenes según el texto de búsqueda (código o cliente).
   */
  const filtered = useMemo(() => {
    if (!search) return otss;
    const lowerSearch = search.toLowerCase();
    return otss.filter(
      (ot) =>
        ot.codigo?.toLowerCase().includes(lowerSearch) ||
        ot.cliente?.toLowerCase().includes(lowerSearch)
    );
  }, [search, otss]);
// Agregar instrumento
const handleAddInstrument = () => {
  setInstrumentDrafts((prev) => [
    ...prev,
    {
      id: "",
      item: (prev.length + 1).toString(),
      tipoServicio: "",
      instrumento: "",
      fabricante: "",
      modelo: "",
      serie: "",
      codigoInternoInventario: "",
      ubicacion: "",
      puntosCalibrar: "",
      unidad: "",
      intervaloMedicion: "",
      resolucionDivisionEscala: "",
      declaracionConformidad: "",
      empLimiteControl: "",
      documentoEspecificacion: "",
      reglaDecision: "",
    },
  ]);
};

// Eliminar instrumento
const handleRemoveInstrument = (id: string) => {
  setInstrumentDrafts((prev) => prev.filter((inst) => inst.id !== id));
};

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-sans text-slate-800 antialiased">
      <ToastNotification message={toast} />

      <HeaderSection
        selectedOT={selectedOT}
        search={search}
        setSearch={setSearch}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onBack={closeOT}
        totalOTs={otss.length}
        warnings={warnings}
      />

      {selectedOT && (
        <div className="space-y-6 max-w-7xl mx-auto">
          <OrderAlertsBanner selectedOT={selectedOT} warnings={warnings} />

          <StaffAssignmentSection
            editingTechnician={editingTechnician}
            setEditingTechnician={setEditingTechnician}
            machineOptions={machineOptions}
            technicians={technicians}
            assignedMachines={assignedMachines}
            activeMachine={activeMachine}
            setActiveMachine={setActiveMachine}
            handleMachineSelection={handleMachineSelection}
            machineAssignments={machineAssignments}
            toggleMachineAssignment={toggleMachineAssignment}
            assignTechnician={assignTechnician}
          />

          <OrderFormRCM05
            editingOrder={editingOrder}
            setEditingOrder={setEditingOrder}
            orderDraft={orderDraft}
            updateOrderDraft={updateOrderDraft}
            instrumentDrafts={instrumentDrafts}
            updateInstrumentDraft={updateInstrumentDraft}
            technicians={technicians}
            saveOrderEdits={saveOrderEdits}
            onAddInstrument={handleAddInstrument}
            onRemoveInstrument={handleRemoveInstrument}
            tarifas={tarifas}
          />
        </div>
      )}

      {!selectedOT && viewMode === "kanban" && (
        <KanbanBoardView
          otsList={filtered}
          collapsedColumns={collapsedColumns}
          toggleColumnCollapse={toggleColumnCollapse}
          onOpenOT={openOT}
          warnigs={warnings} 
     
        />
      )}

      {!selectedOT && viewMode === "list" && (
        <ListViewTable otsList={otss} search={search} onOpenOT={openOT} />
      )}
    </div>
  );
};

export default OrdenesTrabajo;