// 1. Imports
"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { Upload, FileText, AlertTriangle, RefreshCw, ChevronDown, CheckCircle2, Clock, XCircle, Layers } from "lucide-react";
import { useSession } from "next-auth/react";
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";
import type {
  InstrumentoAsignado,
  EstadoInstrumento,
  HeaderKPIsProps,
  FilterBarProps,
  UploadDockProps,
  InstrumentCardProps,
} from "@/tipos/calibracion";

// -----------------------------------------------------------------------------
// 2. Componentes Secundarios
// -----------------------------------------------------------------------------

const ToastNotification: React.FC<{ toast: string }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800 animate-in fade-in slide-in-from-top-2 duration-200">
      {toast}
    </div>
  );
};

const HeaderKPIs: React.FC<HeaderKPIsProps> = ({ instrumentos }) => {
  const kpis = useMemo(() => {
    return {
      total: instrumentos.length,
      pendientes: instrumentos.filter((i) => i.status === "Pendiente").length,
      devueltos: instrumentos.filter((i) => i.status === "Devuelto").length,
      adjuntados: instrumentos.filter((i) => i.status === "Adjuntado" || i.status === "En revisión" || i.status === "Firmado").length,
    };
  }, [instrumentos]);

  return (
    <div className="mb-6 space-y-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight pl-3 border-l-4 border-[#5680F9] uppercase">
          Gestión de Certificados de Calibración
        </h1>
        <p className="text-xs text-slate-400 mt-0.5 font-medium">
          Vinculación de certificados PDF e inspección de observaciones técnicas por estampilla.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Asignados</p>
            <p className="text-lg font-black text-slate-800 mt-0.5">{kpis.total}</p>
          </div>
          <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
            <Layers size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Por Cargar</p>
            <p className="text-lg font-black text-amber-700 mt-0.5">{kpis.pendientes}</p>
          </div>
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
            <Clock size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Devueltos / Obs.</p>
            <p className="text-lg font-black text-rose-700 mt-0.5">{kpis.devueltos}</p>
          </div>
          <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
            <XCircle size={18} />
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Procesados</p>
            <p className="text-lg font-black text-emerald-700 mt-0.5">{kpis.adjuntados}</p>
          </div>
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
            <CheckCircle2 size={18} />
          </div>
        </div>
      </div>
    </div>
  );
};

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
    <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Combobox OT */}
      <div className="relative">
        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
          Filtrar por Orden de Trabajo (OT)
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por OT..."
            value={filterWorkOrder}
            onChange={(e) => {
              setFilterWorkOrder(e.target.value);
              setShowODropdown(true);
            }}
            onFocus={() => setShowODropdown(true)}
            onBlur={() => setTimeout(() => setShowODropdown(false), 200)}
            className="w-full text-xs font-semibold pl-3 pr-8 py-2 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5680F9]/30 text-slate-800 placeholder-slate-400"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {showODropdown && sugerenciasOT.length > 0 && (
          <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto py-1 text-xs font-medium text-slate-700">
            {sugerenciasOT.map((ot) => (
              <li
                key={ot}
                onMouseDown={() => setFilterWorkOrder(ot)}
                className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                {ot}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Combobox Cliente */}
      <div className="relative">
        <label className="block text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">
          Filtrar por Cliente
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Buscar por cliente..."
            value={filterClient}
            onChange={(e) => {
              setFilterClient(e.target.value);
              setShowCDropdown(true);
            }}
            onFocus={() => setShowCDropdown(true)}
            onBlur={() => setTimeout(() => setShowCDropdown(false), 200)}
            className="w-full text-xs font-semibold pl-3 pr-8 py-2 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#5680F9]/30 text-slate-800 placeholder-slate-400"
          />
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {showCDropdown && sugerenciasCliente.length > 0 && (
          <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto py-1 text-xs font-medium text-slate-700">
            {sugerenciasCliente.map((cliente) => (
              <li
                key={cliente}
                onMouseDown={() => setFilterClient(cliente)}
                className="px-3 py-1.5 hover:bg-slate-50 cursor-pointer transition-colors"
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
    <section className="mb-6 animate-in fade-in duration-200">
      <div
        className={`bg-white border-2 rounded-2xl p-5 shadow-md max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 items-center ${
          isDevuelto ? "border-rose-400" : "border-[#5680F9]"
        }`}
      >
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] uppercase font-black tracking-widest px-2 py-0.5 rounded-md ${
                isDevuelto ? "bg-rose-100 text-rose-700" : "bg-[#5680F9]/10 text-[#5680F9]"
              }`}
            >
              {isDevuelto ? "Reenvío Obligatorio" : "Inyección de Archivo"}
            </span>
            <span className="text-xs font-mono font-bold text-slate-500">
              {selectedInstrumento.workOrder}
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            {selectedInstrumento.equipment}
          </h3>

          {isDevuelto && selectedInstrumento.motivoDevolucion && (
            <div className="bg-rose-50/80 border border-rose-200 text-rose-900 rounded-xl p-3 text-xs flex gap-2">
              <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-extrabold block">Observación del Director Técnico:</span>
                <p className="mt-0.5 text-rose-800 italic leading-snug">{selectedInstrumento.motivoDevolucion}</p>
              </div>
            </div>
          )}

          <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100 space-y-1 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 font-medium">Estampilla Única:</span>{" "}
              <span className="font-mono font-bold text-slate-800">{selectedInstrumento.estampilla}</span>
            </div>
            <div>
              <span className="text-slate-400 font-medium">Cliente:</span>{" "}
              <span className="font-semibold text-slate-700">{selectedInstrumento.client}</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-700 font-bold bg-transparent border-none cursor-pointer transition-colors"
          >
            ✕ Cancelar selección
          </button>
        </div>

        <div className="flex flex-col items-center justify-center border border-slate-200/80 bg-slate-50/50 p-4 rounded-xl min-h-[150px]">
          {selectedFile ? (
            <div className="text-center w-full space-y-3">
              <div className="inline-flex p-2 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                <FileText size={20} />
              </div>
              <div className="text-xs font-bold font-mono text-slate-800 truncate px-4">{selectedFile.name}</div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={onRemoveFile}
                  className="text-[11px] text-slate-400 hover:text-slate-600 font-bold cursor-pointer bg-transparent border-none"
                >
                  Cambiar
                </button>
                <button
                  onClick={onUpload}
                  className="text-xs bg-[#5680F9] hover:bg-[#4069E2] text-white font-bold px-4 py-1.5 rounded-lg border-none cursor-pointer shadow-sm transition flex items-center gap-1.5"
                >
                  {isDevuelto && <RefreshCw size={12} />}
                  {isDevuelto ? "Reenviar Certificado" : "Vincular a Estampilla"}
                </button>
              </div>
            </div>
          ) : (
            <label
              htmlFor="canvas-file-upload"
              className={`flex flex-col items-center justify-center w-full h-full p-4 text-center cursor-pointer hover:bg-slate-100/60 transition rounded-xl border border-dashed ${
                isDevuelto ? "border-rose-300 bg-rose-50/10" : "border-slate-300"
              }`}
            >
              <Upload size={20} className={`${isDevuelto ? "text-rose-500" : "text-[#5680F9]"} mb-1`} />
              <span className="text-xs font-bold text-slate-800">
                {isDevuelto ? "Cargar nuevo PDF corregido" : "Seleccionar certificado PDF"}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">Formato PDF máximo 10MB</span>
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

const InstrumentCard: React.FC<InstrumentCardProps> = ({
  instrumento,
  isSelected,
  onSelect,
  obtenerBadgeEstado,
}) => {
  const isDevuelto = instrumento.status === "Devuelto";

  return (
    <div
      onClick={() => onSelect(instrumento)}
      className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between ${
        isSelected
          ? "bg-[#5680F9] border-[#5680F9] text-white shadow-md scale-[1.01]"
          : isDevuelto
          ? "bg-rose-50/40 border-rose-200 hover:border-rose-300 text-slate-800 shadow-sm"
          : "bg-white border-slate-200 hover:border-slate-300 text-slate-800 shadow-sm"
      }`}
    >
      <div>
        <div className="flex justify-between items-start gap-2 mb-2">
          <span
            className={`font-mono text-[10px] font-bold rounded px-1.5 py-0.5 truncate max-w-[140px] ${
              isSelected ? "bg-white/20 text-white" : isDevuelto ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-600"
            }`}
          >
            {instrumento.workOrder}
          </span>
          <span className={isSelected ? "text-[10px] text-white font-bold uppercase tracking-wider" : obtenerBadgeEstado(instrumento.status)}>
            {instrumento.status}
          </span>
        </div>

        <h4 className={`text-xs font-bold ${isSelected ? "text-white" : "text-slate-900"}`}>
          {instrumento.equipment}
        </h4>
        <p className={`text-[11px] mt-1 font-medium ${isSelected ? "text-blue-100" : "text-slate-400"}`}>
          Estampilla: <span className="font-mono">{instrumento.estampilla}</span>
        </p>
        <p className={`text-[11px] font-semibold ${isSelected ? "text-blue-100" : "text-slate-600"}`}>
          {instrumento.client}
        </p>

        {isDevuelto && !isSelected && instrumento.motivoDevolucion && (
          <div className="mt-2.5 bg-white border border-rose-200 p-2 rounded-lg text-[11px] text-rose-700">
            <span className="font-bold flex items-center gap-1 text-[10px]">
              <AlertTriangle size={11} /> Motivo Devolución:
            </span>
            <p className="line-clamp-2 italic text-slate-600 mt-0.5">{instrumento.motivoDevolucion}</p>
          </div>
        )}
      </div>

      {instrumento.fileName && (
        <div
          className={`mt-3 pt-2 border-t flex items-center gap-1.5 text-[10px] font-mono ${
            isSelected ? "border-blue-400/50 text-blue-100" : "border-slate-100 text-slate-400"
          }`}
        >
          <FileText size={12} /> {instrumento.fileName}
        </div>
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// 3. Componente Principal (Single-User Context)
// -----------------------------------------------------------------------------

export const CalibracionInformes: React.FC = () => {
  const { data: session } = useSession();
  const idTecnico = Number(session?.user?.id_user);

  const calibraciones = useDbTable("calibraciones");
  const recepcionDetalles = useDbTable("recepcion_equipo_detalles");
  const ordenes = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const certificados = useDbTable("certificados");
  const { loadTable } = useDbActions();

  useEffect(() => {
    loadTable("certificados");
    loadTable("ordenes_trabajo");
    loadTable("clientes");
    loadTable("recepcion_equipo_detalles")
    loadTable("calibraciones")
  }, [loadTable]);
console.log(calibraciones,"calibracion list")
  // ==========================================
  // DATOS DERIVADOS DEL STORE (sin mocks)
  // ==========================================
  const instrumentosBase: InstrumentoAsignado[] = useMemo(() => {
    console.log(idTecnico)
    if (!idTecnico || Number.isNaN(idTecnico)) return [];
    return [...calibraciones].filter((cal) => cal.idTecnico === idTecnico)
      .map((cal) => {
        const detalle = [...recepcionDetalles].find((r) => r.idInstrumento === cal.idInstrumento);
        const orden = ordenes.find((o) =>
          (o.instrumentos ?? []).some((i) => i.idDetalle === cal.idInstrumento)
        );
        const cliente = orden
          ? clientes.find((c) => c.idCliente === orden.idCliente)
          : undefined;
        const certExiste = certificados.some((c) => c.idCalibracion === cal.idCalibracion);
        return {
          id: String(cal.idInstrumento),
          estampilla: detalle?.estampilla ?? "—",
          workOrder: orden?.codigo ?? "—",
          equipment: detalle?.instrumento ?? "—",
          client: cliente?.razonSocial ?? "—",
          status: certExiste ? ("En revisión" as EstadoInstrumento) : ("Pendiente" as EstadoInstrumento),
        };
      });
  }, [calibraciones, recepcionDetalles, ordenes, clientes, certificados, idTecnico]);

  const [instrumentos, setInstrumentos] = useState<InstrumentoAsignado[]>([]);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!syncedRef.current && instrumentosBase.length > 0) {
      setInstrumentos(instrumentosBase);
      syncedRef.current = true;
    }
  }, [instrumentosBase]);

  const [selectedInstrumento, setSelectedInstrumento] = useState<InstrumentoAsignado | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [toast, setToast] = useState("");

  const [filterWorkOrder, setFilterWorkOrder] = useState("");
  const [filterClient, setFilterClient] = useState("");

  const [showODropdown, setShowODropdown] = useState(false);
  const [showCDropdown, setShowCDropdown] = useState(false);

  // Derivación de comboboxes
  const listaOTs = useMemo(() => Array.from(new Set(instrumentos.map((i) => i.workOrder))), [instrumentos]);
  const listaClientes = useMemo(() => Array.from(new Set(instrumentos.map((i) => i.client))), [instrumentos]);

  const sugerenciasOT = useMemo(
    () => listaOTs.filter((ot) => ot.toLowerCase().includes(filterWorkOrder.toLowerCase())),
    [listaOTs, filterWorkOrder]
  );

  const sugerenciasCliente = useMemo(
    () => listaClientes.filter((c) => c.toLowerCase().includes(filterClient.toLowerCase())),
    [listaClientes, filterClient]
  );

  const instrumentosFiltrados = useMemo(() => {
    return instrumentos.filter((i) => {
      const matchesOT = i.workOrder.toLowerCase().includes(filterWorkOrder.toLowerCase());
      const matchesCliente = i.client.toLowerCase().includes(filterClient.toLowerCase());
      return matchesOT && matchesCliente;
    });
  }, [instrumentos, filterWorkOrder, filterClient]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  }, []);

  const ejecutarSubidaCertificado = useCallback(() => {
    if (!selectedInstrumento || !selectedFile) return;

    setInstrumentos((prev) =>
      prev.map((ins) =>
        ins.estampilla === selectedInstrumento.estampilla
          ? {
              ...ins,
              status: "En revisión" as EstadoInstrumento,
              fileName: selectedFile.name,
              uploadDate: new Date().toISOString().split("T")[0],
              motivoDevolucion: undefined,
            }
          : ins
      )
    );

    showToast(`✅ Certificado vinculado a la estampilla ${selectedInstrumento.estampilla}`);
    setSelectedFile(null);
    setSelectedInstrumento(null);
  }, [selectedInstrumento, selectedFile, showToast]);

  const obtenerBadgeEstado = useCallback((status: EstadoInstrumento) => {
    const config: Record<EstadoInstrumento, string> = {
      Pendiente: "bg-amber-50 text-amber-700 border-amber-200",
      Adjuntado: "bg-blue-50 text-blue-700 border-blue-200",
      "En revisión": "bg-purple-50 text-purple-700 border-purple-200",
      Devuelto: "bg-rose-50 text-rose-700 border-rose-200",
      Firmado: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
    return `px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wider uppercase ${config[status]}`;
  }, []);

  return (
    <div className="p-6 bg-slate-50 min-h-screen font-sans text-slate-800 antialiased">
      <ToastNotification toast={toast} />

      <HeaderKPIs instrumentos={instrumentos} />

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

      {/* Grid de Instrumentos Asignados */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Mis Instrumentos Asignados
          </h2>
          <span className="text-xs text-slate-500 font-mono font-bold">
            {instrumentosFiltrados.length} items
          </span>
        </div>

        {instrumentosFiltrados.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">
            No se encontraron instrumentos que coincidan con los filtros aplicados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instrumentosFiltrados.map((ins) => (
              <InstrumentCard
                key={ins.id}
                instrumento={ins}
                isSelected={selectedInstrumento?.id === ins.id}
                onSelect={setSelectedInstrumento}
                obtenerBadgeEstado={obtenerBadgeEstado}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default CalibracionInformes;
