"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowLeft,
  Search,
  File,
  FileSpreadsheet,
  Eye,
  Filter,
  Calendar,
  Building2,
  Mail,
  Phone,
  User,
  MapPin,
  X,
  Download,
} from "lucide-react";
import Link from "next/link";
import type { Estados } from "@/tipos/enums";
import type {
  DocumentConfig,
  CotizacionCardProps,
  TrazabilidadCliente,
  TrazabilidadCotizacionCard,
  ClienteDetailPageProps,
} from "@/tipos/clientes";
import {
  obtenerDocumentosCotizacion,
  type DocumentoItem,
  type DocumentosCotizacionCategorias,
} from "@/app/action_module/modulo_cliente";
import { generarUrlArchivo } from "@/app/action_module/archivos";

// ========== ESTADOS DE FILTRO ==========
const estadoOptions = [
  { value: "TODOS", label: "Todos los estados" },
  { value: "BORRADOR", label: "Borrador" },
  { value: "ENVIADA", label: "Enviada" },
  { value: "APROBADA", label: "Aprobada" },
  { value: "RECHAZADA", label: "Rechazada" },
  { value: "EN_SEGUIMIENTO", label: "En seguimiento" },
];

// ========== CONFIGURACIÓN DEL VISOR ==========
export const initialDocumentConfig: DocumentConfig = {
  kind: "pdf",
  fileId: '',
  apiBaseUrl: '/api/v1',
};

export const createDocumentConfig = (
  overrides: Partial<DocumentConfig> = {}
): DocumentConfig => ({
  ...initialDocumentConfig,
  ...overrides,
});

// ========== CATEGORÍAS DE DOCUMENTOS (TABS) ==========
type CategoriaKey = keyof DocumentosCotizacionCategorias["categorias"];

const CATEGORIA_TABS: { key: CategoriaKey; label: string }[] = [
  { key: "recepcion", label: "Recepción" },
  { key: "cotizacion", label: "Cotización" },
  { key: "ordenTrabajo", label: "Orden de trabajo" },
  { key: "comprobantes", label: "Comprobantes" },
  { key: "certificados", label: "Certificados" },
];

const esExcel = (nombre: string) => /\.(xlsx|xls)$/i.test(nombre);
const esPdf = (nombre: string) => /\.pdf$/i.test(nombre);

// ========== CARD DE COTIZACIÓN ==========
const CotizacionCard = ({ cotizacion }: CotizacionCardProps) => {
  const [showFiles, setShowFiles] = useState(false);
  const [docs, setDocs] = useState<DocumentosCotizacionCategorias["categorias"] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [tab, setTab] = useState<CategoriaKey>("recepcion");
  const [viewer, setViewer] = useState<{ url: string | null; nombre: string; cargando: boolean } | null>(
    null
  );
  const [descargando, setDescargando] = useState<number | null>(null);

  const statusMap: Record<Estados, { label: string; style: string }> = {
    BORRADOR: { label: "Borrador", style: "bg-slate-100 text-slate-700 border-slate-200" },
    ENVIADA: { label: "Enviada", style: "bg-blue-50 text-blue-700 border-blue-200" },
    APROBADA: { label: "Aprobado", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    RECHAZADA: { label: "Rechazado", style: "bg-rose-50 text-rose-700 border-rose-200" },
    EN_SEGUIMIENTO: { label: "En seguimiento", style: "bg-amber-50 text-amber-700 border-amber-200" },
  };

  const cargarDocumentos = useCallback(async () => {
    setCargando(true);
    const data = await obtenerDocumentosCotizacion(cotizacion.idCotizacion);
    setDocs(data?.categorias ?? null);
    setCargando(false);
  }, [cotizacion.idCotizacion]);

  const toggleFiles = useCallback(() => {
    setShowFiles((prev) => {
      const next = !prev;
      if (next && !docs && !cargando) cargarDocumentos();
      return next;
    });
  }, [docs, cargando, cargarDocumentos]);

  const abrirPdf = useCallback(async (doc: DocumentoItem) => {
    setViewer({ url: null, nombre: doc.nombre, cargando: true });
    const url = await generarUrlArchivo(doc.rutaUrl);
    setViewer({ url, nombre: doc.nombre, cargando: false });
  }, []);

  const descargarExcel = useCallback(async (doc: DocumentoItem) => {
    setDescargando(doc.idDocumento);
    const url = await generarUrlArchivo(doc.rutaUrl);
    setDescargando(null);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const status = statusMap[cotizacion.estado];
  const totalDocs = docs
    ? CATEGORIA_TABS.reduce((acc, t) => acc + docs[t.key].length, 0)
    : (cotizacion.documentos?.length ?? 0);
  const lista = docs ? docs[tab] : [];

  return (
    <div className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all duration-200 flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-semibold tracking-wider font-mono text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-0.5 rounded-md">
            {cotizacion.codigo}
          </span>
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${status.style}`}>
            {status.label}
          </span>
        </div>

        <h3 className="font-semibold text-sm text-slate-800 group-hover:text-blue-600 transition-colors leading-snug mb-3">
          {cotizacion.titulo}
        </h3>

        <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5 mb-4">
          <Calendar size={13} className="text-slate-400" />
          <span>
            Finaliza: <strong className="text-slate-700 font-semibold">{cotizacion.fechaFin}</strong>
          </span>
        </div>
      </div>

      {/* Adjuntos por categorías */}
      <div className="border-t border-slate-100 pt-3 mt-2">
        <button
          onClick={toggleFiles}
          className="flex items-center justify-between w-full text-xs font-semibold text-slate-600 hover:text-blue-600 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <File size={14} className="text-slate-400" />
            Documentos ({totalDocs})
          </span>
          {showFiles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {showFiles && (
          <div className="mt-3 p-2 bg-slate-50/80 rounded-xl border border-slate-100">
            <div className="flex flex-wrap gap-1 mb-2">
              {CATEGORIA_TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide transition-colors ${
                    tab === t.key
                      ? "bg-blue-600 text-white"
                      : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {t.label}
                  {docs ? ` (${docs[t.key].length})` : ""}
                </button>
              ))}
            </div>

            {cargando ? (
              <div className="text-[11px] text-slate-400 py-4 text-center">Cargando documentos...</div>
            ) : lista.length === 0 ? (
              <div className="text-[11px] text-slate-400 py-4 text-center">
                No hay documentos en esta categoría.
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                {lista.map((doc) => {
                  const excel = esExcel(doc.nombre);
                  const pdf = esPdf(doc.nombre);
                  return (
                    <div
                      key={doc.idDocumento}
                      className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-white"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {excel ? (
                          <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                        ) : (
                          <FileText size={14} className="text-rose-500 shrink-0" />
                        )}
                        <span className="truncate text-xs text-slate-700 font-medium">{doc.nombre}</span>
                        <span className="text-[10px] text-slate-400 shrink-0">v{doc.versionActual}</span>
                      </div>

                      {excel ? (
                        <button
                          onClick={() => descargarExcel(doc)}
                          disabled={descargando === doc.idDocumento}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-slate-100 disabled:opacity-50 shrink-0"
                        >
                          <Download size={12} />
                          {descargando === doc.idDocumento ? "..." : "Descargar"}
                        </button>
                      ) : pdf ? (
                        <button
                          onClick={() => abrirPdf(doc)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-blue-600 text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-slate-100 shrink-0"
                        >
                          <Eye size={12} /> Ver
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 shrink-0">No previsualizable</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 md:p-8">
          <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider truncate">
                {viewer.nombre}
              </h3>
              <button
                onClick={() => setViewer(null)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all text-xs font-bold border border-rose-200 cursor-pointer"
              >
                <X size={18} className="text-rose-600 shrink-0" /> Cerrar
              </button>
            </div>
            <div className="flex-1 w-full h-full overflow-hidden bg-slate-100 p-2">
              {viewer.cargando || !viewer.url ? (
                <div className="h-full w-full flex items-center justify-center text-xs text-slate-500">
                  {viewer.cargando ? "Generando visor..." : "No se pudo cargar el documento."}
                </div>
              ) : (
                <FileViewer kind="pdf" fileUrl={viewer.url} height="100%" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== COMPONENTE PRINCIPAL ==========
import { obtenerTrazabilidadCliente } from "@/app/action_module/modulo_cliente";
import FileViewer from "@/app/utils/FileViewer";

export default function ClienteDetailPage({ onVolver, id_cliente }: ClienteDetailPageProps) {
  console.log(id_cliente,"hlaaa")
  const [is_open_documento, setIsOpenDocumento] = useState(false);
  const [searchCodigo, setSearchCodigo] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("TODOS");
  const [trazabilidad, setTrazabilidad] = useState<TrazabilidadCliente | null>(null);
  const [config, setConfig] = useState<DocumentConfig>(initialDocumentConfig);

  useEffect(() => {
    if (id_cliente === null || id_cliente === undefined) return;

    async function fetchTrazabilidad() {
      try {
        const data = await obtenerTrazabilidadCliente(id_cliente || 0);
        console.log(data,"aqui")
        const resultado = data?.data ?? null;
        setTrazabilidad(resultado);
        console.log("Trazabilidad del cliente:", resultado);
      } catch (error) {
        console.error("Error al obtener la trazabilidad del cliente:", error);
      }
    }

    fetchTrazabilidad();
  }, [id_cliente]);

  const filteredCotizaciones = useMemo<TrazabilidadCotizacionCard[]>(() => {
    if (!trazabilidad?.cotizaciones) return [];

    return trazabilidad.cotizaciones.filter((cot) => {
      const matchCodigo = cot?.codigo
        ?.toLowerCase()
        .includes(searchCodigo.toLowerCase());
      const matchEstado =
        filterEstado === "TODOS" || cot?.estado === filterEstado;
      return matchCodigo && matchEstado;
    });
  }, [searchCodigo, filterEstado, trazabilidad]);

  const handleViewRut = useCallback((trazabilidad: TrazabilidadCliente | null) => {
    console.log("Abrir visor de RUT para cliente:", trazabilidad?.razonSocial, trazabilidad?.rutDocumento?.rutaUrl);

    setConfig(createDocumentConfig({
      apiBaseUrl: '/api/v1/pdf/ver/',
      fileId: trazabilidad?.rutDocumento?.rutaUrl || '',
      kind: "pdf",
    }));
    console.log("Configuración del visor de RUT:", config);
    setIsOpenDocumento(true);
  }, [config]);

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 bg-slate-50/50 min-h-screen">
      {/* Topbar Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onVolver}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={14} /> Volver a la lista
        </button>
        <button
          onClick={() => handleViewRut(trazabilidad)}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-white text-slate-700 hover:bg-slate-100 transition-all text-xs font-semibold border border-slate-200 shadow-sm"
        >
          <Eye size={14} className="text-blue-600" />
          Ver RUT del Cliente
        </button>
      </div>

      {/* Hero Header */}
<div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Building2 size={18} className="text-blue-600 shrink-0" />
              <h1 className="text-xl font-bold text-slate-900">
                {trazabilidad?.razonSocial || "Cargando..."}
              </h1>
              {trazabilidad?.status && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    trazabilidad.status === "ACTIVO"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {trazabilidad.status}
                </span>
              )}
              {trazabilidad?.tipoCliente && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                  {trazabilidad.tipoCliente}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 font-medium mt-2">
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                NIT/CC: {trazabilidad?.nitCedula || "N/A"}
              </span>
              {trazabilidad?.nombreContacto && (
                <span className="flex items-center gap-1 text-slate-700 font-semibold">
                  <User size={13} className="text-slate-400" /> {trazabilidad.nombreContacto}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Mail size={13} className="text-slate-400" /> {trazabilidad?.correo || "Sin correo"}
              </span>
              {trazabilidad?.telefono && (
                <span className="flex items-center gap-1">
                  <Phone size={13} className="text-slate-400" /> {trazabilidad.telefono}
                </span>
              )}
              <span className="flex items-center gap-1">
                <MapPin size={13} className="text-slate-400" /> {trazabilidad?.ciudad || "Cali"}
              </span>
            </div>
          </div>
        </div>

        {/* Observaciones del Cliente */}
        {trazabilidad?.observacion && (
          <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-200/50">
            <FileText size={14} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="line-clamp-2">
              <span className="font-semibold text-slate-700">Observaciones: </span>
              {trazabilidad.observacion}
            </p>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Buscar por código..."
            value={searchCodigo}
            onChange={(e) => setSearchCodigo(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-48">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm appearance-none cursor-pointer"
            >
              {estadoOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Grid de Cotizaciones */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Cotizaciones Registradas
          </h2>
          <span className="text-xs font-semibold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-full">
            {filteredCotizaciones?.length || 0}
          </span>
        </div>

        {filteredCotizaciones?.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200/80 text-slate-400 text-xs">
            No se encontraron cotizaciones con los criterios seleccionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCotizaciones?.map((cot) => (
              <CotizacionCard key={cot.idCotizacion} cotizacion={cot} />
            ))}
          </div>
        )}
      </div>
      
      {/* visor del documento*/}
{is_open_documento && (
  // 1. Overlay oscuro de fondo que cubre toda la pantalla
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 md:p-8">
    
   
    <div className="relative w-full max-w-5xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      

      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
          Visualizador de Documento
        </h3>
        
  
        <button
          onClick={() => setIsOpenDocumento(false)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 transition-all text-xs font-bold border border-rose-200 shadow-sm cursor-pointer"
        >
          <X size={18} className="text-rose-600 shrink-0" />
          Cerrar Visor
        </button>
      </div>


      <div className="flex-1 w-full h-full overflow-auto bg-slate-100 p-2">
        <FileViewer 
          kind={config.kind}  
          apiBaseUrl={config.apiBaseUrl}  
          fileId={config.fileId}  
        />
      </div>

    </div>
  </div>
)}
    </div>
    
  );
}
