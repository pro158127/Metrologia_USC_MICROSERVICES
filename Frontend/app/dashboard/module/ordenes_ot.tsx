// 1. IMPORTS
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  AlertTriangle,
  Search,
  Eye,
  Edit3,
  Layers,
  ChevronLeft,
  ChevronRight,
  Wrench,
  User,
  Calendar,
} from "lucide-react";
import {
  ViewMode,
  OTBase,
  OTType,
  EditableOrderFields,
  Instrument,
  Warning,
  EstadoOrden,
  TarifaOptionBase,
  ToastNotificationProps,
  HeaderSectionProps,
  OrderAlertsBannerProps,
  ComboboxInstrumentoProps,
  StaffAssignmentSectionProps,
  InstrumentosTableProps,
  OrderFormRCM05Props,
  SectionProps,
  FieldProps,
  KanbanBoardViewProps,
  ListViewTableProps,
  defaultInstrumentos,
  kanbanColumns,
  Tecnico,
} from "@/tipos/tipo_ordenes_de_trabajo";
import { consolidarOrdenTrabajoAction } from "@/app/action_module/ordenes";
// ==========================================
// TIPOS Y DATOS CONSTANTES
// ==========================================
// (tipos e interfaces en @/tipos/tipo_ordenes_de_trabajo.ts)

const TIPOS_SERVICIO = ["Acreditado", "No_acreditado"];

const UNIDADES = [
  "psi", "bar", "mbar", "kPa", "MPa", "Pa", "mmHg", "inHg",
  "kgf/cm²", "cmH2O", "kg", "g", "mg", "lb", "°C", "°F", "%HR",
];

// Normaliza el TIPO_SERVICIO almacenado en BD ("ACREDITADO"/"NO ACREDITADO"/etc.)
// a la etiqueta canónica que usa el desplegable del formulario.
const normalizarTipoServicio = (v?: string | null): string => {
  const s = (v ?? "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes("NO") && s.includes("ACREDIT")) return "No_acreditado";
  return "Acreditado";
};

// Convierte la etiqueta del formulario de vuelta al valor canónico de BD.
const tipoServicioADB = (v?: string | null): string => {
  const s = (v ?? "").trim().toUpperCase();
  return s.includes("NO") ? "NO ACREDITADO" : "ACREDITADO";
};

// La fecha límite es inclusiva durante todo el día indicado.
const estaVencidaLaFechaLimite = (valor?: string | Date | null): boolean => {
  if (!valor) return false;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(fecha.getTime())) return false;
  const dia = new Date(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate());
  dia.setHours(23, 59, 59, 999);
  return Date.now() > dia.getTime();
};

// Limpia los placeholders de BD ("sin nit", "sin ciudad", "sin dirreccion",
// "sin razon_social", ...) para poder caer al fallback del cliente.
const limpiarPlaceholder = (v?: string | null): string => {
  const s = (v ?? "").trim();
  return s.toLowerCase().startsWith("sin ") ? "" : s;
};

const fechaISOParaInput = (valor?: string | Date | null): string => {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(0, 10);
};

const horaISOParaInput = (valor?: string | Date | null): string => {
  if (!valor) return "";
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? "" : fecha.toISOString().slice(11, 16);
};

const formatearFechaCalendario = (valor?: string | Date | null): string => {
  const fechaISO = fechaISOParaInput(valor);
  if (!fechaISO) return "";
  const [anio, mes, dia] = fechaISO.split("-");
  return `${dia}/${mes}/${anio}`;
};

const normalizarLugarCalibracion = (
  ot: OrdenTrabajoModel,
): "Interno USC" | "En sitio" | "Laboratorio permanente" => {
  const sitio = (ot.sitioCalibracion ?? "").trim().toUpperCase();
  if (ot.esInternoUSC || sitio.includes("INTERNO_USC") || sitio === "INTERNO USC") return "Interno USC";
  if (ot.esEnSitio || sitio === "CLIENTE" || sitio === "EN SITIO") return "En sitio";
  return "Laboratorio permanente";
};

const buildOrderDraft = (ot: OTType): EditableOrderFields => ({
  razonSocialCert: ot.razonSocialCert ?? ot.cliente ?? "",
  nitCert: ot.nitCert ?? "",
  correoCertificados: ot.correoCertificados ?? "",
  fechaLimiteFacturacion: ot.fechaLimiteFacturacion ?? "",
  direccionCert: ot.direccionCert ?? "",
  ciudadCert: ot.ciudadCert ?? "",
  correoFactura: ot.correoFactura ?? "",

  lugarCalibracion: ot.lugarCalibracion ?? "Interno USC",
  personaContactar: ot.personaContactar ?? "",
  telefonoCalibracion: ot.telefonoCalibracion ?? "",
  fechaCalibracion: ot.fechaCalibracion ?? "",
  horaCalibracion: ot.horaCalibracion ?? "",

  razonSocialSolicitante: ot.razonSocialSolicitante ?? ot.cliente ?? "",
  nitSolicitante: ot.nitSolicitante ?? "",
  direccionSolicitante: ot.direccionSolicitante ?? "",
  ciudadSolicitante: ot.ciudadSolicitante ?? "",
  contactoSolicitante: ot.contactoSolicitante ?? "",
  telefonoSolicitante: ot.telefonoSolicitante ?? "",

  noOrdenTrabajo: ot.noOrdenTrabajo ?? ot.id,
  noCotizacion: ot.noCotizacion ?? "",
  responsableUsc: ot.responsableUsc ?? ot.tecnico ?? "",
  fechaDiligenciamiento: ot.fechaDiligenciamiento ?? "",
  requiereAnexo: ot.requiereAnexo ?? "No",
  estadoOrden: ot.estadoOrden ?? ot.estado,
  observacionesGenerales: ot.observacionesGenerales ?? "",
  ultima_version: ot.ultima_version?.toString(),
});

// ==========================================
// 2. COMPONENTES HIJOS (EXTRAÍDOS Y ORGANIZADOS)
// ==========================================

const ToastNotification = ({ message }: ToastNotificationProps) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

const HeaderSection = ({
  selectedOT,
  search,
  setSearch,
  viewMode,
  setViewMode,
  onBack,
  totalOTs,
}: HeaderSectionProps) => {
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
            {(["kanban", "tree", "list"] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer transition ${
                  viewMode === m ? "bg-slate-900 text-white shadow-sm" : "bg-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {m === "kanban" ? "Tablero" : m === "tree" ? "Árbol" : "Lista"}
              </button>
            ))}
          </div>
        </div>
      )}

     
      {selectedOT  && (
        <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100">
          {`CONSECUTIVO: ${selectedOT.noOrdenTrabajo} · VERSIÓN: ${selectedOT.noOrdenTrabajo?.match(/[A-Z]$/)?.[0] ?? "—"} · VIGENCIA: ${selectedOT.fechaLimiteFacturacion}`}
        </div>
      )}
    </div>
  );
};
const OrderAlertsBanner = ({
  selectedOT,
  warnings = [],
}: OrderAlertsBannerProps) => {
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

export const StaffAssignmentSection: React.FC<StaffAssignmentSectionProps> = ({
  editingTechnician,
  setEditingTechnician,
  instrumentosCot,
  technicians,
  onAssignTechnician,
  onSaveAssignments,
  saving,
  estadoActual, // <-- Nuevo prop
}) => {
 const todosCertificados = instrumentosCot.length > 0 && instrumentosCot.every((item) => item.certificadoCreado);
 const certificadosEnviados = estadoActual === "Certificado_enviado";
 const asignacionBloqueada = todosCertificados || certificadosEnviados;
 const instrumentosListos = instrumentosCot.filter((item) => item.listoParaAsignar);
 const pendientesRecepcion = instrumentosCot.length - instrumentosListos.length;
 const puedeAsignar = estadoActual !== "Creada" && !asignacionBloqueada &&
   instrumentosListos.some((item) => !item.calibracionIniciada);
 const { can } = usePermissions();
 const tienePermisoAsignar = can("ordenes_de_trabajo", "asignar_tecnico");

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Layers size={13} /> Gestión de Personal y Equipamiento
          </h3>
          <p className="text-[11px] text-slate-400">
            {pendientesRecepcion > 0
              ? `Equipos pendientes de estampilla o IBC de entrada: ${pendientesRecepcion}.`
              : "Asignación de metrólogos por equipo."}
          </p>
        </div>
        
        {/* Renderizado condicional basado en el estado */}
        {asignacionBloqueada ? (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            {certificadosEnviados ? "Los certificados ya se enviaron" : "Todos los instrumentos ya tienen certificado"}
          </span>
        ) : puedeAsignar && tienePermisoAsignar ? (
          <button
            onClick={() => setEditingTechnician(!editingTechnician)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer border-none shadow-sm"
          >
            {editingTechnician ? "Ocultar Panel Asignación" : "Asignar Técnico"}
          </button>
        ) : (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            Asignación no disponible
          </span>
        )}
      </div>
      {editingTechnician && puedeAsignar && tienePermisoAsignar && (
        <div className="space-y-3 animate-fadeIn">
          {instrumentosListos.map((item) => (
            <div
              key={item.id_instrumento}
              className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50"
            >
              <span className="text-xs font-bold text-slate-800">
                {item.instrumento}
              </span>

             <select
                value={item.asignado || ""}
                // 🟢 CORRECCIÓN: Usar Number(e.target.value) en lugar del viejo item.asignado
                onChange={(e) => onAssignTechnician(Number(e.target.value), item.id_instrumento)}
                disabled={item.calibracionIniciada}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Sin Asignar --</option>
                {technicians.map((tech) => (
                  <option key={tech.idUsuario} value={tech.idUsuario}>
                    {tech.nombreCompleto}
                  </option>
                ))}
              </select>
              {item.calibracionIniciada && (
                <span className="text-[10px] text-amber-700">Instrumento ya calibrado</span>
              )}
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onSaveAssignments}
              disabled={saving}
              className="rounded-xl bg-blue-600 text-white px-5 py-2 font-bold text-xs hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando asignaciones…" : "Guardar asignaciones"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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


export const InstrumentosTable: React.FC<InstrumentosTableProps> = ({
  instrumentDrafts,
  updateInstrumentDraft,
  excedioLimite,
  tarifas,
  readOnly = false,
}) => {
  const itemOptions = Array.from({ length: instrumentDrafts.length }, (_, i) => i + 1);

  const instrumentosList = useMemo(() => {
    const nombres = tarifas.map((t) => t.Instrumento).filter(Boolean);
    return Array.from(new Set(nombres)).sort();
  }, [tarifas]);

  // Manejo de puntos de calibración (arreglo del schema)
  const handlePuntoChange = (id: string, puntoIndex: number, value: string) => {
    const instrument = instrumentDrafts.find((i) => i.id === id);
    if (!instrument) return;
    const puntosArray = instrument.puntosCalibrar ? [...instrument.puntosCalibrar] : [];
    while (puntosArray.length < 5) puntosArray.push("");
    puntosArray[puntoIndex] = value;
    updateInstrumentDraft(id, "puntosCalibrar", puntosArray.slice(0, 5));
  };

  const getPuntosArray = (inst: Instrument): string[] => {
    const arr = inst.puntosCalibrar ? [...inst.puntosCalibrar] : [];
    while (arr.length < 5) arr.push("");
    return arr.slice(0, 5);
  };

  return (
    <>

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
   
      </div>

      <fieldset disabled={readOnly} className="contents" aria-label="Instrumentos de la orden de trabajo en solo lectura">
      <div className="overflow-x-auto max-w-full shadow-inner">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-200 text-slate-600 font-bold tracking-wider text-xs">
              <th className="p-2.5 border-r border-slate-200 text-center min-w-[50px]">Item</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Tipo Servicio</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[180px]">Instrumento</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">Fabricante</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[120px]">Modelo</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[120px]">Serie</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Codigo Interno/inventario</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">Ubicación</th>
              <th className="p-2.5 border-r border-slate-200 text-center" colSpan={5}>
                Puntos a Calibrar
              </th>
              <th className="p-2.5 border-r border-slate-200 min-w-[80px]">Unidad</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Intervalo de medición</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Resolución o Division de Escala</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[140px]">Declaracion de  Conformidad</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[130px]">EMP(limite de control)</th>
              <th className="p-2.5 border-r border-slate-200 min-w-[150px]">Documento de  Especificación</th>
              <th className="p-2.5 min-w-[150px]">Regla de Decisión</th>
  
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
                      onChange={(e) => updateInstrumentDraft(inst.id, "item", Number(e.target.value))}
                      className="w-full text-center bg-white border-b border-slate-300 outline-none font-bold text-slate-700 cursor-pointer py-1 text-sm"
                    >
                      {itemOptions.map((num) => (
                        <option key={num} value={num}>
                          {num}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Tipo de Servicio: lista fija */}
                  <td className="p-2 border-r border-slate-200">
                    <select
                      value={inst.tipoServicio}
                      onChange={(e) => updateInstrumentDraft(inst.id, "tipoServicio", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm cursor-pointer"
                    >
                      <option value="">Seleccionar...</option>
                      {TIPOS_SERVICIO.map((tipo) => (
                        <option key={tipo} value={tipo}>
                          {tipo}
                        </option>
                      ))}
                    </select>
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

                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.fabricante ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "fabricante", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Fabricante"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.modelo ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "modelo", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Modelo"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200 font-mono">
                    <input
                      value={inst.serie ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "serie", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Serie"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.codigoInventario ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "codigoInventario", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Cód. inventario"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.ubicacion ?? ""}
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
                    <ComboboxInstrumento
                      value={inst.unidad ?? ""}
                      options={UNIDADES}
                      onChange={(value) => updateInstrumentDraft(inst.id, "unidad", value)}
                      placeholder="Unidad"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.intervaloRango ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "intervaloRango", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Intervalo"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.resolucion ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "resolucion", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Resolución"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <select
                      value={inst.declaracionConformidad ? "Aplica" : "No aplica"}
                      onChange={(e) =>
                        updateInstrumentDraft(inst.id, "declaracionConformidad", e.target.value === "Aplica")
                      }
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm cursor-pointer"
                    >
                      <option value="Aplica">Aplica</option>
                      <option value="No aplica">No aplica</option>
                    </select>
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.limiteControlEMC ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "limiteControlEMC", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="EMP"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.docEspecificacion ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "docEspecificacion", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Doc. especificación"
                    />
                  </td>
                  <td className="p-2 border-r border-slate-200">
                    <input
                      value={inst.reglaDecision ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "reglaDecision", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
                      placeholder="Regla decisión"
                    />
                  </td>
              
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </fieldset>
    </>
  );
};
export const OrderFormRCM05: React.FC<OrderFormRCM05Props> = ({
  editingOrder,
  setEditingOrder,
  orderDraft,
  updateOrderDraft,
  instrumentDrafts,
  updateInstrumentDraft,
  technicians,
  saveOrderEdits,
  tarifas,
}) => {
  const { can } = usePermissions();
  const puedeEditar = can("ordenes_de_trabajo", "crear_editar");
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

  // --- Sugerencias (autocompletado) derivadas de datos reales (tarifas + instrumentos) ---
  const suggestions = useMemo(() => {
    const instrumentos = Array.from(new Set((tarifas || []).map((t) => t.Instrumento).filter(Boolean)));
    const fabricantes = Array.from(new Set(instrumentDrafts.map((d) => d.fabricante).filter((v): v is string => !!v)));
    const modelos = Array.from(new Set(instrumentDrafts.map((d) => d.modelo).filter((v): v is string => !!v)));
    return { razonesSociales: [], instrumentos, fabricantes, modelos };
  }, [tarifas, instrumentDrafts]);

  // ===== REGLA DE ANEXO: si hay más de 10 instrumentos, forzar "Si" y mostrar aviso =====
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
        {puedeEditar && (
        <button
          onClick={() => setEditingOrder(!editingOrder)}
          className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer border-none shadow-sm transition"
        >
          {editingOrder ? 'Bloquear Edición' : 'Habilitar Campos del Formulario'}
        </button>
        )}
      </div>

      {editingOrder && (
        <div className="space-y-6 animate-fadeIn">
          {/* ========== SECCIÓN 2: DATOS PARA CERTIFICADO ========== */}
          <Section
            title="1. DATOS PARA CERTIFICADO"
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
                  label="Correo para el envio de certificados de calibracion "
                  type="email"
                  value={orderDraft.correoCertificados}
                  onChange={(v) => updateOrderDraft('correoCertificados', v)}
                />
                <Field
                  label="Fecha límite para facturación"
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
                  label="Correo para envío de Factura"
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
  excedioLimite={instrumentDrafts.length > 10}
  tarifas={tarifas}
  readOnly
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
                        disabled
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      {lugar}
                    </label>
                  ))}
                </div>
              </div>
              {orderDraft.lugarCalibracion=="En sitio" &&
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
}
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
                      <option key={t.idUsuario}>{t.nombreCompleto}</option>
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
  {/* Reemplazamos el <select> por un input bloqueado */}
  <input
    type="text"
    value={orderDraft.estadoOrden}
    disabled
    className="w-full mt-1 border border-slate-200 rounded-xl p-2 text-xs bg-slate-100 outline-none font-bold text-slate-500 cursor-not-allowed"
  />
</label>
                <label className="flex items-center gap-3 border border-amber-200 bg-amber-50/50 rounded-xl px-3 py-2.5 sm:col-span-2 text-xs font-bold text-slate-700">
                  <select
                    value={orderDraft.requiereAnexo}
                    onChange={(e) => updateOrderDraft('requiereAnexo', e.target.value as EditableOrderFields["requiereAnexo"])}
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
            {puedeEditar && (
            <button
              type="button"
              onClick={saveOrderEdits}
              className="rounded-xl bg-emerald-600 text-white px-6 py-2.5 font-bold text-xs hover:bg-emerald-700 shadow-md border-none cursor-pointer transition"
            >
              Consolidar Orden R-CM05
            </button>
            )}
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

// ====== COMPONENTE ======
export const KanbanBoardView: React.FC<KanbanBoardViewProps> = ({
  otsList,
  collapsedColumns,
  toggleColumnCollapse,
  onOpenOT,
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
                        {formatearFechaCalendario(ot.fecha) || "Sin fecha"}
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
        ot.cliente?.toLowerCase().includes(lowerSearch) ||
        ot.cotizacionCodigo?.toLowerCase().includes(lowerSearch)
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
                    {formatearFechaCalendario(ot.fecha) || "—"}
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
// 2.5 Vista de Árbol (jerárquica Master → hijas)
// ==========================================
export const TreeView: React.FC<{
  treeNodes: { node: Partial<OTBase>; children: Partial<OTBase>[] }[];
  onOpenOT: (ot: Partial<OTBase>) => void;
  search: string;
}> = ({ treeNodes, onOpenOT, search }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredNodes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return treeNodes;
    const matches = (ot: Partial<OTBase>) =>
      [ot.codigo, ot.cliente, ot.cotizacionCodigo]
        .some((value) => value?.toLocaleLowerCase().includes(term));
    return treeNodes.flatMap(({ node, children }) => {
      if (matches(node)) return [{ node, children }];
      const hijosCoincidentes = children.filter(matches);
      return hijosCoincidentes.length > 0 ? [{ node, children: hijosCoincidentes }] : [];
    });
  }, [treeNodes, search]);

  const renderNode = (ot: Partial<OTBase>, depth: number) => (
    <div
      key={ot.id}
      onClick={() => onOpenOT(ot)}
      className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"
      style={{ paddingLeft: `${12 + depth * 20}px` }}
    >
      <span className="text-xs font-mono font-bold text-blue-600">{ot.codigo}</span>
      <span className="text-xs font-semibold text-slate-700 truncate">{ot.cliente}</span>
      <span className="text-[10px] text-slate-400 font-medium ml-auto whitespace-nowrap">
        {ot.equipos} equipo{ot.equipos !== 1 ? "s" : ""}
      </span>
      <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap">
        {(ot.estado?.toString() ?? "Sin estado").replace(/_/g, " ")}
      </span>
    </div>
  );

  if (filteredNodes.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
        {search.trim() ? "No se encontraron órdenes con el criterio de búsqueda." : "No hay órdenes de trabajo."}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Jerarquía de Órdenes de Trabajo
        </span>
      </div>
      <div className="p-2 divide-y divide-slate-50">
        {filteredNodes.map(({ node, children }) => {
          const hasChildren = children.length > 0;
          const isOpen = expanded[node.id!] ?? false;
          return (
            <div key={node.id}>
              {hasChildren ? (
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [node.id!]: !isOpen }))}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="text-slate-400">{isOpen ? "−" : "+"}</span>
                  <span className="text-xs font-mono font-bold text-slate-700">{node.codigo}</span>
                  <span className="text-xs font-semibold text-slate-600 truncate">{node.cliente}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{children.length} hija(s)</span>
                </button>
              ) : (
                renderNode(node, 0)
              )}
              {hasChildren && isOpen && (
                <div className="pb-1">{children.map((child) => renderNode(child, 1))}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ==========================================
// 3. COMPONENTE PADRE
// ==========================================
import { obtenerTecnicosOrdenes } from "@/app/action_module/ordenes";
import { useDbTable, useDbActions, useDbLoading, useRevisionTablas, OrdenTrabajoModel } from "@/app/componets/tables_recharge";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import { useModuleSplashReady } from "@/app/dashboard/components/PageLoadSplash";
export const OrdenesTrabajo = ({ otToOpen }: { otToOpen?: number | null }) => {
  // Suscripción selectiva por tabla (solo re-renderiza si esa tabla cambia)
  const ordenesTrabajo = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const tarifas = useDbTable("tarifas");
  const { loadTable } = useDbActions();
  const loadingOrdenes = useDbLoading("ordenes_trabajo");
  const loadingClientes = useDbLoading("clientes");
  const loadingTarifas = useDbLoading("tarifas");
  // El hook global se activa desde un effect; sin este estado local, el primer
  // render puede mostrar el tablero vacío antes de que empiece la consulta.
  const [cargaInicialOrdenes, setCargaInicialOrdenes] = useState(true);
  useModuleSplashReady("ordenes", !loadingOrdenes && !loadingClientes && !loadingTarifas && !cargaInicialOrdenes);
  const [errorCargaOrdenes, setErrorCargaOrdenes] = useState(false);

  // Vista actual (kanban, lista o detalle de OT)
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  // Búsqueda para filtrar órdenes
  const [search, setSearch] = useState("");
  // OT seleccionada (cuando se hace clic en una tarjeta o fila)
  const [selectedOT, setSelectedOT] = useState<OTType | null>(null);
  // Edición del formulario R-CM05 habilitada
  const [editingOrder, setEditingOrder] = useState(false);
  const [savingOT, setSavingOT] = useState(false);
  const savingOTRef = useRef(false);
  // Edición de asignación de técnicos
  const [editingTechnician, setEditingTechnician] = useState(false);
  // Borrador actual del formulario
  const [orderDraft, setOrderDraft] = useState<EditableOrderFields | null>(null);
  // Instrumentos editables en la tabla
  const [instrumentDrafts, setInstrumentDrafts] = useState<Instrument[]>(defaultInstrumentos);
  // Mensaje toast temporal
  const [toast, setToast] = useState("");

  // Control de columnas colapsadas en el Kanban
  const [collapsedColumns, setCollapsedColumns] = useState<Partial<Record<EstadoOrden, boolean>>>({
    Creada: false,
    Certificado_enviado: false,
  });
  // Máquina activa en el panel de asignación

  /**
   * Alterna la visibilidad de una columna del Kanban (colapsada/expandida).
   */
  const toggleColumnCollapse = (columnKey: EstadoOrden) => {
    setCollapsedColumns((prev) => ({ ...prev, [columnKey]: !prev[columnKey] }));
  };

  const revisionTecnicos = useRevisionTablas("usuarios", "roles");
  const [technicians, setTechnicians] = useState<Tecnico[]>([]);
  useEffect(() => {
    let activo = true;
    obtenerTecnicosOrdenes().then((tecnicos) => {
      if (activo) setTechnicians(tecnicos);
    }).catch((error) => console.error("No se pudieron cargar los técnicos:", error));
    return () => { activo = false; };
  }, [revisionTecnicos]);

  console.log(technicians,"esto essss")


const ordenSeleccionadaActual = ordenesTrabajo.find(
    (orden) => String(orden.idOrdenTrabajo) === selectedOT?.id,
  );
  const instrumentos_cot = useMemo(() => {
    const detallesActuales = ordenSeleccionadaActual?.instrumentos;
    return instrumentDrafts.map((inst) => {
      const actual = detallesActuales?.find((detalle) => String(detalle.idDetalle) === inst.id);
      return {
        asignado: inst.asignado ?? 0,
        id_instrumento: inst.id,
        instrumento: inst.instrumento,
        listoParaAsignar: actual?.listoParaAsignar ?? inst.listoParaAsignar ?? false,
        calibracionIniciada: actual?.calibracionIniciada ?? inst.calibracionIniciada ?? false,
        certificadoCreado: actual?.certificadoCreado ?? inst.certificadoCreado ?? false,
      };
    });
  }, [instrumentDrafts, ordenSeleccionadaActual]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  /**
   * Abre una OT desde la vista de lista/tablero: busca los datos completos en dbState,
   * arma el objeto OTType y lo establece como seleccionada.
   */
  const openOT = useCallback((otPreview: Partial<OTBase>) => {
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
        item: detalle.item || 1,
        tipoServicio: normalizarTipoServicio(detalle.tipoServicio),
        instrumento: detalle.instrumento || "",
        fabricante: detalle.fabricante ?? null,
        modelo: detalle.modelo ?? null,
        serie: detalle.serie ?? null,
        codigoInventario: detalle.codigoInventario ?? null,
        ubicacion: detalle.ubicacion ?? null,
        puntosCalibrar: Array.isArray(detalle.puntosCalibrar) ? detalle.puntosCalibrar : [],
        unidad: detalle.unidad ?? null,
        intervaloRango: detalle.intervaloRango ?? null,
        resolucion: detalle.resolucion ?? null,
        asignado: detalle.asignado ?? 0,
        listoParaAsignar: detalle.listoParaAsignar ?? false,
        calibracionIniciada: detalle.calibracionIniciada ?? false,
        certificadoCreado: detalle.certificadoCreado ?? false,
        declaracionConformidad: detalle.declaracionConformidad ?? false,
        limiteControlEMC: detalle.limiteControlEMC ?? null,
        docEspecificacion: detalle.docEspecificacion ?? null,
        reglaDecision: detalle.reglaDecision ?? null,
      })
    );

    const otCompleto: OTType = {
      id: otPreview.id || otCompleta.idOrdenTrabajo.toString(),
      cliente: clienteData?.razonSocial || "Sin cliente",
      tecnico: otCompleta.responsable || "Sin asignar",
      fecha: fechaISOParaInput(otCompleta.fechaCalibracion),
      estado: (otCompleta.estado ?? "Creada") as EstadoOrden,
      retraso: estaVencidaLaFechaLimite(otCompleta.fechaLimiteFacturacion),
      certificadosPendientesRevision: otCompleta.certificadosPendientesRevision ?? false,
      equipos: instrumentosMapeados.length,
      tipo: "Acreditado",
      razonSocialCert: limpiarPlaceholder(otCompleta.Razon_social) || clienteData?.razonSocial || "",
      nitCert: limpiarPlaceholder(otCompleta.NIT) || clienteData?.nitCedula || "",
      correoCertificados: otCompleta.correoCertificado || clienteData?.correo || "",
      fechaLimiteFacturacion: fechaISOParaInput(otCompleta.fechaLimiteFacturacion),
      direccionCert: limpiarPlaceholder(otCompleta.dirrecion) || clienteData?.dirrecion || "",
      ciudadCert: limpiarPlaceholder(otCompleta.ciudad) || clienteData?.ciudad || "",
      correoFactura: otCompleta.correoFactura || clienteData?.correo || "",
      lugarCalibracion: normalizarLugarCalibracion(otCompleta),
      personaContactar: otCompleta.personaContacto || clienteData?.nombreContacto || "",
      telefonoCalibracion: otCompleta.telefonoContacto || clienteData?.telefono || "",
      fechaCalibracion: fechaISOParaInput(otCompleta.fechaCalibracion),
      horaCalibracion: horaISOParaInput(otCompleta.hora),
      razonSocialSolicitante: otCompleta.cliente?.razonSocial || "",
      nitSolicitante: otCompleta.cliente?.nitCedula ?? "",
      direccionSolicitante: otCompleta.cliente?.dirrecion ?? "",
      ciudadSolicitante: otCompleta.cliente?.ciudad || "sin ciudad",
      contactoSolicitante: otCompleta.personaContacto_solicitante?.trim() || otCompleta.cliente?.nombreContacto?.trim() || "",
      telefonoSolicitante: otCompleta?.telefonoContacto_solcitante || clienteData?.telefono || "",
      noOrdenTrabajo: otCompleta.codigo,
      noCotizacion: otCompleta.cotizacion?.codigo?.toString() || "",
      responsableUsc: otCompleta.responsable || "",
      fechaDiligenciamiento: fechaISOParaInput(otCompleta.fecha_dilgenciamento),
      requiereAnexo: otCompleta.requireAnexo ? "Si" : "No",
      estadoOrden: otCompleta.estado ?? "",
      observacionesGenerales: otCompleta.observaciones || "",
      estado_revision: otCompleta.estadoRevision ?? undefined,
      ultima_version: String(otCompleta.version ?? 1),
      maquinas: [],
      tecnicos: otCompleta.responsable ? [otCompleta.responsable] : [],
      asignaciones: {},
      instrumentos: instrumentosMapeados,
    };

    setSelectedOT(otCompleto);
    setEditingTechnician(false);
    setOrderDraft(buildOrderDraft(otCompleto));
    setInstrumentDrafts(instrumentosMapeados);
  }, [ordenesTrabajo, clientes, showToast]);

  // Mantiene el detalle abierto sincronizado con el snapshot autoritativo que
  // llega por HTTP/realtime, sin reemplazar borradores mientras se editan.
  const selectedOTId = selectedOT?.id;
  useEffect(() => {
    if (!selectedOTId || editingOrder || editingTechnician) return;
    const otActual = ordenesTrabajo.find((ot) => String(ot.idOrdenTrabajo) === selectedOTId);
    if (!otActual) return;
    const timer = window.setTimeout(() => openOT({ id: selectedOTId }), 0);
    return () => window.clearTimeout(timer);
  }, [ordenesTrabajo, selectedOTId, editingOrder, editingTechnician, openOT]);

  /**
   * Cierra la vista de detalle de la OT y resetea los estados relacionados.
   */
  const closeOT = () => {
    setSelectedOT(null);
    setEditingOrder(false);
    setEditingTechnician(false);
    setOrderDraft(null);
    setInstrumentDrafts(defaultInstrumentos);
  };

  // Preselección de OT proveniente del módulo de importación ("Ver").
  const lastOpenedRef = useRef<number | null>(null);
  useEffect(() => {
    if (otToOpen == null || lastOpenedRef.current === otToOpen) return;
    const ot = ordenesTrabajo.find((o) => o.idOrdenTrabajo === otToOpen);
    if (ot) {
      lastOpenedRef.current = otToOpen;
      const timer = window.setTimeout(() => openOT({ id: String(otToOpen) }), 0);
      return () => window.clearTimeout(timer);
    }
  }, [otToOpen, ordenesTrabajo, openOT]);

  // Handlers para la sección de asignación de técnicos/máquinas


  const updateOrderDraft = <K extends keyof EditableOrderFields>(
    field: K,
    value: EditableOrderFields[K]
  ) => {
    setOrderDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateInstrumentDraft = <K extends keyof Instrument>(
    id: string,
    field: K,
    value: Instrument[K]
  ) => {
    setInstrumentDrafts((prev) =>
      prev.map((instrument) =>
        instrument.id === id ? { ...instrument, [field]: value } : instrument
      )
    );
  };

const saveOrderEdits = async () => {
    if (!selectedOT || !orderDraft || savingOTRef.current) return;
    savingOTRef.current = true;
    setSavingOT(true);

    // 🟢 1. Validaciones
    try {
      showToast("⏳ Consolidando orden y generando documento...");

      // 🟢 2. Estructuración del Payload
      const payload = {
        responsableUsc: orderDraft.responsableUsc || null,
        fechaDiligenciamiento: orderDraft.fechaDiligenciamiento,
        contactoSolicitante: orderDraft.contactoSolicitante === selectedOT.contactoSolicitante
          ? undefined : orderDraft.contactoSolicitante.trim() || null,
        fechaLimiteFacturacion: orderDraft.fechaLimiteFacturacion === selectedOT.fechaLimiteFacturacion
          ? undefined : orderDraft.fechaLimiteFacturacion || null,
        fechaCalibracion: orderDraft.lugarCalibracion === "En sitio" && orderDraft.fechaCalibracion
          ? orderDraft.fechaCalibracion.slice(0, 10)
          : null,
        horaCalibracion: orderDraft.lugarCalibracion === "En sitio" && orderDraft.horaCalibracion
          ? orderDraft.horaCalibracion.match(/\d{2}:\d{2}/)?.[0] ?? null
          : null,
        personaContactar: orderDraft.lugarCalibracion === "En sitio" ? orderDraft.personaContactar || null : null,
        telefonoCalibracion: orderDraft.lugarCalibracion === "En sitio" ? orderDraft.telefonoCalibracion || null : null,
        requiereAnexo: orderDraft.requiereAnexo,
        observacionesGenerales: orderDraft.observacionesGenerales,
        lugarCalibracion: orderDraft.lugarCalibracion,
        estadoOrden: orderDraft.estadoOrden as EstadoOrden,
        instrumentos: instrumentDrafts.map((inst) => ({
          // Si el ID tiene guiones (UUID de front), lo mandamos como undefined para que Fastify sepa que es nuevo
          idDetalle: inst.id.includes('-') ? undefined : Number(inst.id),
          item: inst.item,
          tipoServicio: tipoServicioADB(inst.tipoServicio),
          instrumento: inst.instrumento,
          fabricante: inst.fabricante ?? null,
          modelo: inst.modelo ?? null,
          serie: inst.serie ?? null,
          codigoInventario: inst.codigoInventario ?? null,
          ubicacion: inst.ubicacion ?? null,
          puntosCalibrar: inst.puntosCalibrar,
          unidad: inst.unidad ?? null,
          intervaloRango: inst.intervaloRango ?? null,
          resolucion: inst.resolucion ?? null,
          declaracionConformidad: inst.declaracionConformidad,
          limiteControlEMC: inst.limiteControlEMC ?? null,
          docEspecificacion: inst.docEspecificacion ?? null,
          reglaDecision: inst.reglaDecision ?? null,
          asignado: Number(inst.asignado),
        })),
      };

      // 🟢 3. Llamada directa al Server Action (sin fetch)
      const response = await consolidarOrdenTrabajoAction(selectedOT.id, payload);

      if (!response.ok) {
        throw new Error(response.error || "Fallo en la consolidación del servidor");
      }

      // 🟢 4. Actualización del Estado Local (usando el estado calculado por la FSM)
      const updatedOT: OTType = {
        ...selectedOT,
        ...orderDraft,
        estado: (response.estado as EstadoOrden) ?? (orderDraft.estadoOrden as EstadoOrden),
        tecnico: orderDraft.responsableUsc,
        instrumentos: instrumentDrafts,
      };
      
      setSelectedOT(updatedOT);
      await Promise.all([
        loadTable("ordenes_trabajo", true),
        loadTable("recepciones_equipo", true),
      ]);
      setEditingOrder(false);
      setEditingTechnician(false);
      showToast(response.id_job
        ? `✅ Orden consolidada. Generación documental en curso (${response.id_job})`
        : "✅ Cambios guardados. No hubo cambios que requirieran una nueva versión documental.");

    } catch (error: unknown) {
      console.error(error);
      showToast(`❌ ${error instanceof Error ? error.message : "No se pudo guardar la orden."}`);
    } finally {
      savingOTRef.current = false;
      setSavingOT(false);
    }
  };

  useEffect(() => {
    let activo = true;
    for (const tabla of ["clientes", "tarifas"] as const) {
      void loadTable(tabla);
    }
    void loadTable("ordenes_trabajo", true).then((ok) => {
      if (!activo) return;
      setErrorCargaOrdenes(!ok);
      setCargaInicialOrdenes(false);
    });
    return () => { activo = false; };
  }, [loadTable]);

  /**
   * Calcula las advertencias (warnings) para la OT seleccionada.
   */
  const warnings = useMemo<Warning[]>(() => {
    if (!selectedOT) return [];
    const warns: Warning[] = [];
    if (selectedOT.retraso) warns.push({ tipo: "retraso", mensaje: "Vencida" });
    if (!selectedOT.tecnico || selectedOT.tecnico === "Sin asignar")
      warns.push({ tipo: "sin_responsable", mensaje: "Sin responsable" });
    if (selectedOT.lugarCalibracion === "En sitio" && !selectedOT.fechaCalibracion)
      warns.push({ tipo: "sin_fecha", mensaje: "Sin fecha calibración" });
    if (selectedOT.instrumentos && selectedOT.instrumentos.length > 10)
      warns.push({ tipo: "exceso_instrumentos", mensaje: ">10 instrumentos" });
    if (selectedOT.certificadosPendientesRevision)
      warns.push({ tipo: "pendiente_revision", mensaje: "Pendiente revisión" });
    return warns;
  }, [selectedOT]);

  /**
   * Convierte la lista de órdenes de trabajo del estado global al formato que
   * esperan los componentes Kanban/Lista (Partial<OTBase>).
   * Además, calcula las advertencias individuales de cada orden.
   */
  /**
   * Mapea una OrdenTrabajo (raw) a su vista resumida para Kanban/Lista/Árbol.
   */
  const mapearOTResumen = useCallback(
    (orden: OrdenTrabajoModel): Partial<OTBase> => {
      const cliente = clientes.find((c) => c.idCliente === orden.idCliente);
      const ordenWarnings: Warning[] = [];

      const estaVencida = estaVencidaLaFechaLimite(orden.fechaLimiteFacturacion);
      if (estaVencida) ordenWarnings.push({ tipo: "retraso", mensaje: "Vencida" });
      if (!orden.responsable || orden.responsable === "Sin asignar")
        ordenWarnings.push({ tipo: "sin_responsable", mensaje: "Sin responsable" });
      if ((orden.esEnSitio || orden.sitioCalibracion === "CLIENTE") && !orden.fechaCalibracion)
        ordenWarnings.push({ tipo: "sin_fecha", mensaje: "Sin fecha calibración" });
      if (orden.certificadosPendientesRevision)
        ordenWarnings.push({ tipo: "pendiente_revision", mensaje: "Pendiente revisión" });

      return {
        id: orden.idOrdenTrabajo.toString(),
        cliente: cliente?.razonSocial ?? "Sin cliente",
        fecha: orden.fechaCalibracion?.toString(),
        tecnico: orden.responsable?.toString(),
        equipos: orden.instrumentos?.length ?? 0,
        estado: (orden.estado ?? "Creada") as EstadoOrden,
        codigo: orden.codigo,
        retraso: estaVencida,
        certificadosPendientesRevision: orden.certificadosPendientesRevision ?? false,
        warns: ordenWarnings,
        idOrdenTrabajoPadre: orden.idOrdenTrabajoPadre,
        idOtRaiz: orden.idOtRaiz,
        sitioCalibracion: orden.sitioCalibracion,
        tieneHijas: orden.tieneHijas,
        version: orden.version,
        cotizacionCodigo: orden.cotizacion?.codigo ?? undefined,
      };
    },
    [clientes]
  );

  const otss: Partial<OTBase>[] = useMemo(() => {
    const candidatas = ordenesTrabajo
      .filter((orden) => orden.vigente !== false)
      .filter((orden) => !(orden.sitioCalibracion == null && orden.tieneHijas))

    // La API entrega también el historial. Para datos antiguos puede haber
    // varias filas con VIGENTE=true (o sin ese campo); agrupar por familia y
    // sitio asegura que el Kanban muestre solo la última versión de cada OT.
    const ultimaPorFamiliaYSitio = new Map<string, OrdenTrabajoModel>();
    const prioridadVersion = (orden: OrdenTrabajoModel) => {
      const version = orden.version ?? 1;
      const sufijo = orden.codigo.match(/([A-Z])$/i)?.[1]?.toUpperCase() ?? "";
      const letra = sufijo ? sufijo.charCodeAt(0) - 64 : 0;
      return [version, letra, orden.idOrdenTrabajo] as const;
    };

    for (const orden of candidatas) {
      const familia = orden.idOtRaiz != null
        ? `raiz:${orden.idOtRaiz}`
        : orden.idOrdenTrabajoPadre != null
          ? `padre:${orden.idOrdenTrabajoPadre}`
          : orden.idCotizacion != null
            ? `cotizacion:${orden.idCotizacion}`
            : `ot:${orden.idOrdenTrabajo}`;
      const clave = `${familia}|sitio:${orden.sitioCalibracion ?? "UNICO"}`;
      const actual = ultimaPorFamiliaYSitio.get(clave);
      if (!actual) {
        ultimaPorFamiliaYSitio.set(clave, orden);
        continue;
      }

      const nuevaPrioridad = prioridadVersion(orden);
      const prioridadActual = prioridadVersion(actual);
      if (
        nuevaPrioridad[0] > prioridadActual[0] ||
        (nuevaPrioridad[0] === prioridadActual[0] && nuevaPrioridad[1] > prioridadActual[1]) ||
        (nuevaPrioridad[0] === prioridadActual[0] && nuevaPrioridad[1] === prioridadActual[1] && nuevaPrioridad[2] > prioridadActual[2])
      ) {
        ultimaPorFamiliaYSitio.set(clave, orden);
      }
    }

    return [...ultimaPorFamiliaYSitio.values()].map(mapearOTResumen);
  }, [ordenesTrabajo, mapearOTResumen]);

  /**
   * Árbol jerárquico (Master → hijas) para la vista Tree.
   * La Master se muestra como nodo padre (encabezado de grupo) solo si tiene hijas.
   */
  const treeNodes = useMemo(() => {
    const ultimaPorFamiliaYSitio = new Map<string, OrdenTrabajoModel>();
    const prioridadVersion = (orden: OrdenTrabajoModel) => {
      const version = orden.version ?? 1;
      const sufijo = orden.codigo.match(/([A-Z])$/i)?.[1]?.toUpperCase() ?? "";
      const letra = sufijo ? sufijo.charCodeAt(0) - 64 : 0;
      return [version, letra, orden.idOrdenTrabajo] as const;
    };

    for (const orden of ordenesTrabajo.filter((item) => item.vigente !== false)) {
      const familia = orden.idOtRaiz != null
        ? `raiz:${orden.idOtRaiz}`
        : orden.idOrdenTrabajoPadre != null
          ? `padre:${orden.idOrdenTrabajoPadre}`
          : orden.idCotizacion != null
            ? `cotizacion:${orden.idCotizacion}`
            : `ot:${orden.idOrdenTrabajo}`;
      const clave = `${familia}|sitio:${orden.sitioCalibracion ?? "UNICO"}`;
      const actual = ultimaPorFamiliaYSitio.get(clave);
      if (!actual) {
        ultimaPorFamiliaYSitio.set(clave, orden);
        continue;
      }
      const nueva = prioridadVersion(orden);
      const previa = prioridadVersion(actual);
      if (nueva[0] > previa[0] ||
        (nueva[0] === previa[0] && nueva[1] > previa[1]) ||
        (nueva[0] === previa[0] && nueva[1] === previa[1] && nueva[2] > previa[2])) {
        ultimaPorFamiliaYSitio.set(clave, orden);
      }
    }

    const vigentes = [...ultimaPorFamiliaYSitio.values()].map(mapearOTResumen);

    const porId = new Map(vigentes.map((n) => [n.id, n]));

    return vigentes
      .filter((n) => {
        const padreId = n.idOrdenTrabajoPadre != null ? String(n.idOrdenTrabajoPadre) : null;
        return padreId == null || !porId.has(padreId);
      })
      .map((raiz) => ({
        node: raiz,
        children: vigentes.filter(
          (n) => n.idOrdenTrabajoPadre != null && String(n.idOrdenTrabajoPadre) === String(raiz.id)
        ),
      }));
  }, [ordenesTrabajo, mapearOTResumen]);

  /**
   * Filtra las órdenes según el texto de búsqueda (código, cliente o cotización).
   */
  const filtered = useMemo(() => {
    if (!search) return otss;
    const lowerSearch = search.toLowerCase();
    return otss.filter(
      (ot) =>
        ot.codigo?.toLowerCase().includes(lowerSearch) ||
        ot.cliente?.toLowerCase().includes(lowerSearch) ||
        ot.cotizacionCodigo?.toLowerCase().includes(lowerSearch)
    );
  }, [search, otss]);
// Agregar instrumento (campos del schema OrdenTrabajoDetalle)
  // Opciones de tarifa para combos (DTO mínimo del catálogo)
  const tarifaOptions: TarifaOptionBase[] = useMemo(() => {
    return (tarifas || []).map((t) => ({
      tipoServicio: t.tipoServicio,
      Instrumento: t.Instrumento,
    }));
  }, [tarifas]);

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
      />

      {!selectedOT && errorCargaOrdenes && ordenesTrabajo.length === 0 && (
        <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          No se pudieron cargar las órdenes de trabajo. Recarga el módulo para volver a consultar los datos.
        </div>
      )}

      {selectedOT && (
        <div className="space-y-6 max-w-7xl mx-auto">
          <OrderAlertsBanner selectedOT={selectedOT} warnings={warnings} />
<StaffAssignmentSection
            estadoActual={(ordenSeleccionadaActual?.estado as EstadoOrden | null) ?? selectedOT.estado}
            instrumentosCot={instrumentos_cot}
            technicians={technicians}
            editingTechnician={editingTechnician}
            setEditingTechnician={(u: boolean) => setEditingTechnician(u)}
            // 🟢 La firma ahora coincide con el tipo actualizado
            onAssignTechnician={(idUsuario: number, id_instrumentos: string | number) => 
              updateInstrumentDraft(id_instrumentos.toString(), "asignado", idUsuario)
            }
            onSaveAssignments={saveOrderEdits}
            saving={savingOT}
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
            tarifas={tarifaOptions}
          />
        </div>
      )}

      {!selectedOT && (!errorCargaOrdenes || ordenesTrabajo.length > 0) && viewMode === "kanban" && (
        loadingOrdenes || cargaInicialOrdenes ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="space-y-3">
                <div className="h-6 w-24 rounded bg-slate-200" />
                <div className="h-40 rounded-2xl bg-slate-200" />
              </div>
            ))}
          </div>
        ) : (
          <KanbanBoardView
            otsList={filtered}
            collapsedColumns={collapsedColumns}
            toggleColumnCollapse={toggleColumnCollapse}
            onOpenOT={openOT}
          />
        )
      )}

      {!selectedOT && (!errorCargaOrdenes || ordenesTrabajo.length > 0) && viewMode === "tree" && (
        loadingOrdenes || cargaInicialOrdenes ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-10 rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <TreeView treeNodes={treeNodes} onOpenOT={openOT} search={search} />
        )
      )}

      {!selectedOT && (!errorCargaOrdenes || ordenesTrabajo.length > 0) && viewMode === "list" && (
        loadingOrdenes || cargaInicialOrdenes ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-10 rounded-lg bg-slate-200" />
            ))}
          </div>
        ) : (
          <ListViewTable otsList={otss} search={search} onOpenOT={openOT} />
        )
      )}
    </div>
  );
};

export default OrdenesTrabajo;
