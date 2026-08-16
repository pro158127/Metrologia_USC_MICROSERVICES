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
  Minus,
  Plus,
} from "lucide-react";
import {
  ViewMode,
  OTBase,
  OTType,
  EditableOrderFields,
  Instrument,
  Warning,
  EstadoOrden,
  MachineAssignmentsMap,
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
  OTasiignemet,
  Tecnico,
} from "@/tipos/tipo_ordenes_de_trabajo";

// ==========================================
// TIPOS Y DATOS CONSTANTES
// ==========================================
// (tipos e interfaces en @/tipos/tipo_ordenes_de_trabajo.ts)

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
  warnings,
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
}) => {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <Layers size={13} /> Gestión de Personal y Equipamiento
          </h3>
          <p className="text-[11px] text-slate-400">
            Asignación directa de metrólogos por cada equipo en la orden de trabajo.
          </p>
        </div>
        <button
          onClick={() => setEditingTechnician(!editingTechnician)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition cursor-pointer border-none shadow-sm"
        >
          {editingTechnician ? "Ocultar Panel Asignación" : "Asignar Técnico"}
        </button>
      </div>

      {editingTechnician && (
        <div className="space-y-3 animate-fadeIn">
          {instrumentosCot.map((item) => (
            <div
              key={item.id_instrumento}
              className="flex items-center justify-between p-3 border border-slate-200 rounded-xl bg-slate-50"
            >
              <span className="text-xs font-bold text-slate-800">
                {item.instrumento}
              </span>

              <select
                value={item.asignado || ""}
                onChange={(e) => onAssignTechnician(item.asignado,item.id_instrumento)}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Sin Asignar --</option>
                {technicians.map((tech) => (
                  <option key={tech.idUsuario} value={tech.idUsuario}>
                    {tech.nombreCompleto}
                  </option>
                ))}
              </select>
            </div>
          ))}
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
        <button
          onClick={onAddInstrument}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-4 rounded-xl transition"
        >
          + Agregar instrumento
        </button>
      </div>

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
                    <input
                      value={inst.unidad ?? ""}
                      onChange={(e) => updateInstrumentDraft(inst.id, "unidad", e.target.value)}
                      className="w-full bg-white border-b border-slate-300 outline-none focus:border-blue-500 py-1 text-sm"
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

  // --- Sugerencias (autocompletado) derivadas de datos reales (tarifas + instrumentos) ---
  const suggestions = useMemo(() => {
    const instrumentos = Array.from(new Set((tarifas || []).map((t) => t.Instrumento).filter(Boolean)));
    const fabricantes = Array.from(new Set(instrumentDrafts.map((d) => d.fabricante).filter((v): v is string => !!v)));
    const modelos = Array.from(new Set(instrumentDrafts.map((d) => d.modelo).filter((v): v is string => !!v)));
    return { razonesSociales: [], instrumentos, fabricantes, modelos };
  }, [tarifas, instrumentDrafts]);

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
                  label="Fechalimite para facturacion "
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
                        onChange={() => updateOrderDraft('lugarCalibracion', lugar as EditableOrderFields["lugarCalibracion"])}
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
  // Mapeo de máquina -> técnicos (cantidad + metrólogos)
  const [machineAssignments, setMachineAssignments] = useState<MachineAssignmentsMap>({});
  // Mensaje toast temporal
  const [toast, setToast] = useState("");

  // Control de columnas colapsadas en el Kanban
  const [collapsedColumns, setCollapsedColumns] = useState<Partial<Record<EstadoOrden, boolean>>>({
    Creada: false,
    Certificado_enviado: false,
  });
  // Máquina activa en el panel de asignación
  const [activeMachine, setActiveMachine] = useState<string | null>(null);

  /**
   * Alterna la visibilidad de una columna del Kanban (colapsada/expandida).
   */
  const toggleColumnCollapse = (columnKey: EstadoOrden) => {
    setCollapsedColumns((prev) => ({ ...prev, [columnKey]: !prev[columnKey] }));
  };

  /**
   * Obtiene los técnicos con roles específicos desde los datos de usuarios y roles.
   */
  const technicians:Tecnico[]= useMemo(() => {
    console.log("entrooooo23")
    const usuarioss=[...usuarios]
    console.log(usuarioss,"esto es ss")
    const tecnicos = usuarioss.filter((u) =>
      roles.some(
        (rol) =>
          rol.nombreRol == "Técnico" ||
          rol.nombreRol == "Coordinadora" ||
          rol.nombreRol == "Director Técnico"
      ) &&
      (u.elminado === false && u.estado === true)
    );
    const parse:Tecnico[]=tecnicos.map((e)=>({idUsuario:e.idUsuario,nombreCompleto:e.nombreCompleto}))
    return parse
  }, [...usuarios, ...roles]);

  console.log(technicians,"esto essss")


  const instrumentos_cot:OTasiignemet[]= useMemo(()=>{
   const ot=ordenesTrabajo.find((e)=>e.idOrdenTrabajo==Number(selectedOT?.id))
   const parse:OTasiignemet[]=ot?.instrumentos.map((e):OTasiignemet=>{
    return({
      asignado:e.asignado,
      id_instrumento:e.idDetalle,
      instrumento:e.instrumento,
    })
   })??[]
   return parse
  },[selectedOT,ordenesTrabajo])

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
        item: detalle.item || 1,
        tipoServicio: detalle.tipoServicio || "",
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
        declaracionConformidad: detalle.declaracionConformidad ?? false,
        limiteControlEMC: detalle.limiteControlEMC ?? null,
        docEspecificacion: detalle.docEspecificacion ?? null,
        reglaDecision: detalle.reglaDecision ?? null,
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
      estado: (otCompleta.estado ?? "Creada") as EstadoOrden,
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
      horaCalibracion: otCompleta.hora?.toString() || "",
      razonSocialSolicitante: otCompleta.cliente?.razonSocial || "",
      nitSolicitante: otCompleta.cliente?.nitCedula ?? "",
      direccionSolicitante: otCompleta.cliente?.dirrecion ?? "",
      ciudadSolicitante: otCompleta.cliente?.ciudad || "sin ciudad",
      contactoSolicitante: otCompleta.cliente?.nombreContacto || "sin contacto",
      telefonoSolicitante: otCompleta?.telefonoContacto_solcitante|| "",
      noOrdenTrabajo: otCompleta.codigo,
      noCotizacion: otCompleta.cotizacion?.codigo?.toString() || "",
      responsableUsc: otCompleta.responsable || "",
      fechaDiligenciamiento: otCompleta.createdAt?.toString() || "",
      requiereAnexo: otCompleta.requireAnexo ? "Si" : "No",
      estadoOrden: otCompleta.estado ?? "",
      observacionesGenerales: otCompleta.observaciones || "",
      estado_revision: otCompleta.estadoRevision ?? undefined,
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

  const saveOrderEdits = () => {
    if (!selectedOT || !orderDraft) return;
    const updatedOT: OTType = {
      ...selectedOT,
      ...orderDraft,
      estado: orderDraft.estadoOrden as EstadoOrden,
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
              const parsedUsers = res?.usuarios.map((e): Omit<UsuarioModel, "contraseña"> => ({
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
              setDbState((prev) => ({ ...prev, ordenes_trabajo: res?.ordenes }));
              break;
            }
            case 2: {
              setDbState((prev) => ({ ...prev, clientes: res?.clientes }));
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
        console.log(...usuarios,"aqui estaaa")
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
        estado: (orden.estado ?? "Creada") as EstadoOrden,
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
// Agregar instrumento (campos del schema OrdenTrabajoDetalle)
const handleAddInstrument = () => {
  setInstrumentDrafts((prev) => [
    ...prev,
    {
      id: crypto.randomUUID(),
      item: prev.length + 1,
      tipoServicio: "",
      instrumento: "",
      fabricante: null,
      modelo: null,
      serie: null,
      codigoInventario: null,
      ubicacion: null,
      puntosCalibrar: [],
      unidad: null,
      intervaloRango: null,
      resolucion: null,
      asignado: 0,
      declaracionConformidad: false,
      limiteControlEMC: null,
      docEspecificacion: null,
      reglaDecision: null,
    },
  ]);
};

// Eliminar instrumento
const handleRemoveInstrument = (id: string) => {
  setInstrumentDrafts((prev) => prev.filter((inst) => inst.id !== id));
};

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
        warnings={warnings}
      />

      {selectedOT && (
        <div className="space-y-6 max-w-7xl mx-auto">
          <OrderAlertsBanner selectedOT={selectedOT} warnings={warnings} />

          <StaffAssignmentSection
          instrumentosCot={instrumentos_cot}
          technicians={technicians}
          editingTechnician={editingTechnician}
          setEditingTechnician={(u:boolean)=>setEditingTechnician(u)}
          onAssignTechnician={(idUsuario:number,id_instrumentos:number)=>updateInstrumentDraft(id_instrumentos.toString(),"asignado",idUsuario)}
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
            tarifas={tarifaOptions}
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