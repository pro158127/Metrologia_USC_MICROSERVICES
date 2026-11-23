"use client";

import { useRevisionTablas } from "@/app/componets/tables_recharge";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  ArrowLeft,
  Search,
  FileSpreadsheet,
  Eye,
  Filter,
  Building2,
  Mail,
  Phone,
  User,
  MapPin,
  X,
  Download,
  Folder,
  FolderOpen,
  ClipboardList,
  Wrench,
  CheckCircle2,
  History,
} from "lucide-react";
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
  type DocumentoCertificadoItem,
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

// ========== CATEGORÍAS DE DOCUMENTOS (CARPETAS / ACORDEÓN) ==========
type CategoriaKey = keyof DocumentosCotizacionCategorias["categorias"];

const CARPETA_FOLDERS: { key: CategoriaKey; label: string }[] = [
  { key: "cotizacion", label: "Cotización" },
  { key: "ordenTrabajo", label: "Órdenes de trabajo" },
  { key: "recepcion", label: "Recepciones" },
  { key: "certificados", label: "Certificados" },
  { key: "comprobantes", label: "Comprobantes de pago" },
];

const esExcel = (nombre: string, mimeType?: string | null, rutaUrl?: string | null) =>
  /\.(xlsx|xls)$/i.test(nombre) ||
  /spreadsheet|excel/i.test(mimeType ?? "") ||
  /\.(xlsx|xls)(\?|$)/i.test(rutaUrl ?? "");

const esPdf = (nombre: string, mimeType?: string | null, rutaUrl?: string | null) =>
  /\.pdf$/i.test(nombre) ||
  (mimeType ?? "") === "application/pdf" ||
  /\.pdf(\?|$)/i.test(rutaUrl ?? "");

// ========== LÍNEA DE TIEMPO DE TRAZABILIDAD DE CERTIFICADO ==========
const TimelineCertificado = ({
  item,
  onVerArchivo,
}: {
  item: DocumentoCertificadoItem;
  onVerArchivo: (rutaUrl: string, nombre: string, mimeType?: string | null) => void;
}) => {
  const t = item.trazabilidad;
  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("es-CO", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  const pasos = [
    {
      titulo: "Recepción",
      icono: <ClipboardList size={12} />,
      detalle: [
        t.instrumento ? `Instrumento: ${t.instrumento}` : null,
        t.serie ? `Serie: ${t.serie}` : null,
      ],
    },
    {
      titulo: "Calibración",
      icono: <Wrench size={12} />,
      detalle: [
        `Fecha: ${fmt(t.fechaCalibracion)}`,
        t.tecnico ? `Técnico: ${t.tecnico}` : null,
      ],
    },
    {
      titulo: "Revisión",
      icono: <CheckCircle2 size={12} />,
      detalle: [
        `Estado: ${t.estadoRevision}`,
        `Fecha: ${fmt(t.revisadoAt)}`,
        t.revisor ? `Revisor: ${t.revisor}` : null,
        t.motivoRechazo ? `Motivo de rechazo: ${t.motivoRechazo}` : null,
      ],
    },
  ];

  return (
    <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-1">
      {/* Recepción -> Calibración -> Revisión */}
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200" />
        <div className="space-y-4">
          {pasos.map((p) => (
            <div key={p.titulo} className="relative">
              <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center">
                {p.icono}
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                {p.titulo}
              </p>
              <div className="mt-1 space-y-0.5">
                {p.detalle.filter(Boolean).map((d, i) => (
                  <p key={i} className="text-[11px] text-slate-500">
                    {d}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Versiones anteriores; la versión vigente se abre desde la categoría. */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
          Trazabilidad · versiones anteriores
        </p>
        {t.versiones.length === 0 ? (
          <p className="text-[11px] text-slate-400">Sin versiones registradas.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {t.versiones.map((v) => (
              <div
                key={v.idVersion}
                className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md bg-slate-50 border border-slate-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">
                    v{v.version}
                  </span>
                  {v.nombre && <span className="text-[11px] text-slate-600 truncate">{v.nombre}</span>}
                  <span className="text-[11px] text-slate-600 truncate">{v.usuario ?? "—"}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{fmt(v.createdAt)}</span>
                </div>
                <button
                  onClick={() => onVerArchivo(v.rutaUrl, `${v.nombre ?? item.codigoCertificado} (v${v.version})`, item.mimeType)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-blue-600 text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-slate-100 shrink-0"
                >
                  <Eye size={12} /> Ver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sellos */}
      <div className="border-t border-slate-100 pt-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
          Sellos
        </p>
        {t.sellos.length === 0 ? (
          <p className="text-[11px] text-slate-400">Sin sellos asociados.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {t.sellos.map((s) => (
              <span
                key={s}
                className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ========== CARD DE COTIZACIÓN ==========
const CotizacionCard = ({ cotizacion }: CotizacionCardProps) => {
  const [showFiles, setShowFiles] = useState(false);
  const [docs, setDocs] = useState<DocumentosCotizacionCategorias["categorias"] | null>(null);
  const [pendientes, setPendientes] = useState<DocumentosCotizacionCategorias["pendientes"]>();
  const [trazabilidadComercial, setTrazabilidadComercial] = useState<DocumentosCotizacionCategorias["trazabilidadComercial"]>([]);
  const [archivados, setArchivados] = useState<DocumentosCotizacionCategorias["archivados"]>();
  const [consultaCargada, setConsultaCargada] = useState<string>();
  const [openFolder, setOpenFolder] = useState<CategoriaKey | null>(null);
  const [openHistoryFolder, setOpenHistoryFolder] = useState<CategoriaKey | null>(null);
  const [viewer, setViewer] = useState<{ url: string | null; nombre: string; cargando: boolean } | null>(
    null
  );
  const [descargando, setDescargando] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<DocumentoCertificadoItem | null>(null);

  const statusMap: Record<Estados, { label: string; style: string }> = {
    BORRADOR: { label: "Borrador", style: "bg-slate-100 text-slate-700 border-slate-200" },
    ENVIADA: { label: "Enviada", style: "bg-blue-50 text-blue-700 border-blue-200" },
    APROBADA: { label: "Aprobado", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    RECHAZADA: { label: "Rechazado", style: "bg-rose-50 text-rose-700 border-rose-200" },
    EN_SEGUIMIENTO: { label: "En seguimiento", style: "bg-amber-50 text-amber-700 border-amber-200" },
  };

  const revision = useRevisionTablas("cotizaciones", "documentos", "version_documentos", "certificados", "recepciones_equipo", "ordenes_trabajo");

  const claveConsulta = `${cotizacion.idCotizacion}:${cotizacion.codigo}:${revision}`;
  const cargando = showFiles && consultaCargada !== claveConsulta;

  useEffect(() => {
    if (!showFiles) return;
    let activo = true;
    const timer = window.setTimeout(async () => {
      try {
        const data = await obtenerDocumentosCotizacion(cotizacion.idCotizacion);
        if (activo && data) {
          setDocs(data.categorias);
          setArchivados(data.archivados);
          setPendientes(data.pendientes);
          setTrazabilidadComercial(data.trazabilidadComercial ?? []);
        } else if (activo) {
          setDocs(null);
          setArchivados(undefined);
          setPendientes(undefined);
          setTrazabilidadComercial([]);
        }
      } finally {
        if (activo) setConsultaCargada(claveConsulta);
      }
    }, 150);
    return () => {
      activo = false;
      window.clearTimeout(timer);
    };
  }, [showFiles, cotizacion.idCotizacion, claveConsulta]);

  const toggleFiles = useCallback(() => setShowFiles((abierto) => !abierto), []);

  const abrirPdf = useCallback(async (rutaUrl: string, nombre: string) => {
    setViewer({ url: null, nombre, cargando: true });
    const url = await generarUrlArchivo(rutaUrl);
    setViewer({ url, nombre, cargando: false });
  }, []);

  const descargarArchivo = useCallback(async (rutaUrl: string, nombre: string) => {
    setDescargando(rutaUrl);
    const url = await generarUrlArchivo(rutaUrl);
    setDescargando(null);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const verArchivo = useCallback(
    (rutaUrl: string, nombre: string, mimeType?: string | null) => {
      if (esExcel(nombre, mimeType, rutaUrl)) {
        descargarArchivo(rutaUrl, nombre);
      } else if (esPdf(nombre, mimeType, rutaUrl)) {
        abrirPdf(rutaUrl, nombre);
      } else {
        descargarArchivo(rutaUrl, nombre);
      }
    },
    [descargarArchivo, abrirPdf]
  );

  const status = statusMap[cotizacion.estado];
  const totalDocs = docs
    ? CARPETA_FOLDERS.reduce((acc, t) => acc + docs[t.key].length, 0)
    : (cotizacion.documentos?.length ?? 0);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
      <button
        onClick={toggleFiles}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
      >
        <span className="text-slate-400 shrink-0">
          {showFiles ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        {showFiles ? (
          <FolderOpen size={15} className="text-blue-500 shrink-0" />
        ) : (
          <Folder size={15} className="text-slate-400 shrink-0" />
        )}
        <span className="text-[11px] font-semibold tracking-wide font-mono text-blue-600 shrink-0">
          {cotizacion.codigo}
        </span>
        <span className="text-xs text-slate-700 truncate flex-1 min-w-0 font-medium">
          {cotizacion.titulo}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border shrink-0 ${status.style}`}>
          {status.label}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0 hidden sm:inline">
          {cotizacion.fechaFin}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">
          {totalDocs} docs
        </span>
      </button>

      {showFiles && (
        <div className="p-2 bg-slate-50/60 border-t border-slate-100">
          {cargando ? (
            <div className="text-[11px] text-slate-400 py-4 text-center">Cargando documentos...</div>
          ) : (
            <div className="flex flex-col gap-1">
              <details className="rounded-lg border border-slate-100 bg-white p-2">
                <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-600">
                  Trazabilidad comercial ({trazabilidadComercial.length})
                </summary>
                {trazabilidadComercial.length === 0 ? (
                  <p className="px-1 py-2 text-[11px] text-slate-400">No hay gestiones ni eventos registrados.</p>
                ) : (
                  <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                    {trazabilidadComercial.map((evento) => (
                      <li key={evento.id} className="rounded-md bg-slate-50 px-2 py-1.5 text-[11px]">
                        <div className="flex flex-wrap justify-between gap-2 text-slate-500">
                          <span className="font-semibold">{evento.tipo} · {evento.origen === "SISTEMA" ? "Automático" : "Manual"}</span>
                          <time>{new Date(evento.fecha).toLocaleString("es-CO")}</time>
                        </div>
                        <p className="mt-1 text-slate-700">{evento.descripcion}</p>
                        {evento.resultado && <p className="mt-1 text-slate-500">Resultado: {evento.resultado}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
              {CARPETA_FOLDERS.map((f) => {
                const items = docs ? docs[f.key] : [];
                const clave = f.key;
                const esFormato = clave === "cotizacion" || clave === "ordenTrabajo" || clave === "recepcion";
                const historicoArchivado = esFormato ? archivados?.[clave] ?? [] : [];
                const sinPublicar = esFormato || clave === "certificados" ? pendientes?.[clave] ?? [] : [];
                const certificadosArchivados = f.key === "certificados" ? archivados?.certificados ?? [] : [];
                const abierto = openFolder === f.key;
                return (
                  <div key={f.key} className="rounded-lg border border-slate-100 bg-white">
                    <button
                      onClick={() => setOpenFolder(abierto ? null : f.key)}
                      className="flex items-center justify-between w-full px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-600 hover:text-blue-600 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5">
                        {abierto ? (
                          <FolderOpen size={14} className="text-blue-500 shrink-0" />
                        ) : (
                          <Folder size={14} className="text-slate-400 shrink-0" />
                        )}
                        {f.label}
                        {docs ? ` (${items.length})` : ""}
                      </span>
                      {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>

                    {abierto &&
                      (items.length === 0 && historicoArchivado.length === 0 && sinPublicar.length === 0 && certificadosArchivados.length === 0 ? (
                        <div className="text-[11px] text-slate-400 py-3 text-center">
                          No hay documentos en esta carpeta.
                        </div>
                      ) : f.key === "certificados" ? (
                        <>
                          {sinPublicar.map((codigo) => <p key={codigo} className="px-3 py-2 text-xs text-slate-500">{codigo} · PDF sellado pendiente de publicación</p>)}
                        <div className="flex flex-col gap-1 px-2 pb-2 max-h-56 overflow-y-auto">
                          {(items as DocumentoCertificadoItem[]).map((cert) => (
                            <div
                              key={cert.idCertificado}
                              className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <FileText size={14} className="text-rose-500 shrink-0" />
                                <span className="truncate text-xs text-slate-700 font-medium">
                                  {cert.nombre}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  {cert.versiones[0] ? `v${cert.versiones[0].version}` : ""}
                                </span>
                              </div>
                              {cert.rutaUrl && (
                                <button
                                  type="button"
                                  onClick={() => abrirPdf(cert.rutaUrl!, cert.nombre)}
                                  className="flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-600 hover:bg-slate-100 cursor-pointer"
                                >
                                  <Eye size={12} /> Ver vigente
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                          <details className="mx-2 mb-2 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                            <summary className="cursor-pointer font-bold text-slate-600">Trazabilidad</summary>
                            <div className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                              {[...items as DocumentoCertificadoItem[], ...certificadosArchivados]
                                .filter((cert) => certificadosArchivados.includes(cert) || cert.versiones.length > 1)
                                .map((cert) => (
                                  <button key={cert.idCertificado} type="button" onClick={() => setTimeline(cert)}
                                    className="rounded bg-white px-2 py-1.5 text-left text-blue-600 hover:bg-blue-50">
                                    {cert.codigoCertificado} · {cert.trazabilidad.estadoRevision.replaceAll("_", " ").toLowerCase()}
                                  </button>
                                ))}
                            </div>
                          </details>
                        </>
                      ) : (
                        <>
                          {sinPublicar.map((codigo) => <p key={codigo} className="px-3 py-2 text-xs text-slate-500">{codigo} · Archivo vigente pendiente de publicación</p>)}
                          <div className="flex flex-col gap-1 px-2 pb-2 max-h-56 overflow-y-auto">
                            {(items as DocumentoItem[]).map((doc) => {
                            const excel = esExcel(doc.nombre, doc.mimeType, doc.rutaUrl);
                            const pdf = esPdf(doc.nombre, doc.mimeType, doc.rutaUrl);
                            return (
                              <div
                                key={doc.idDocumento}
                                className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-md hover:bg-slate-50"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {excel ? (
                                    <FileSpreadsheet size={14} className="text-emerald-600 shrink-0" />
                                  ) : (
                                    <FileText size={14} className="text-rose-500 shrink-0" />
                                  )}
                                  <span className="truncate text-xs text-slate-700 font-medium">
                                    {doc.nombre}
                                  </span>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    v{doc.versionActual}
                                  </span>
                                </div>

                                {excel ? (
                                  <button
                                    onClick={() => descargarArchivo(doc.rutaUrl, doc.nombre)}
                                    disabled={descargando === doc.rutaUrl}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-slate-100 disabled:opacity-50 shrink-0"
                                  >
                                    <Download size={12} />
                                    {descargando === doc.rutaUrl ? "..." : "Descargar"}
                                  </button>
                                ) : pdf ? (
                                  <button
                                    onClick={() => abrirPdf(doc.rutaUrl, doc.nombre)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-blue-600 text-[10px] font-bold uppercase tracking-wide cursor-pointer hover:bg-slate-100 shrink-0"
                                  >
                                    <Eye size={12} /> Ver
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    No previsualizable
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          </div>
                          {(() => {
                            const historicos = [...items as DocumentoItem[], ...historicoArchivado].flatMap((doc) =>
                              doc.versiones
                                .filter((version) => version.idVersion !== doc.idVersionActual)
                                .map((version) => ({ doc, version }))
                            );
                            const historialAbierto = openHistoryFolder === f.key;
                            return (
                              <div className="mx-2 mb-2 rounded-md border border-slate-100 bg-slate-50">
                                <button
                                  type="button"
                                  onClick={() => setOpenHistoryFolder(historialAbierto ? null : f.key)}
                                  className="flex w-full items-center gap-1.5 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 hover:text-blue-600 cursor-pointer"
                                >
                                  {historialAbierto ? <FolderOpen size={13} /> : <Folder size={13} />}
                                  Trazabilidad
                                  <span className="font-medium normal-case tracking-normal">({historicos.length} versiones anteriores)</span>
                                  {historialAbierto ? <ChevronDown size={12} className="ml-auto" /> : <ChevronRight size={12} className="ml-auto" />}
                                </button>
                                {historialAbierto && (
                                  historicos.length === 0 ? (
                                    <p className="px-3 pb-2 text-[10px] text-slate-400">No hay versiones anteriores.</p>
                                  ) : (
                                    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto px-2 pb-2">
                                      {historicos.map(({ doc, version }) => (
                                        <div key={`${doc.idDocumento}-${version.idVersion}`} className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1.5">
                                          <div className="flex min-w-0 items-center gap-2">
                                            <History size={12} className="shrink-0 text-slate-400" />
                                            <span className="truncate text-[10px] text-slate-600">{version.nombre ?? doc.nombre}</span>
                                            <span className="shrink-0 text-[10px] font-bold text-slate-500">v{version.version}</span>
                                            <span className="shrink-0 text-[10px] text-slate-400">{version.usuario ?? "—"} · {new Date(version.createdAt).toLocaleDateString("es-CO")}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => verArchivo(version.rutaUrl, `${version.nombre ?? doc.nombre} (v${version.version})`, doc.mimeType)}
                                            className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-slate-100 cursor-pointer"
                                          >
                                            Ver
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })()}
                        </>
                      ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Visor de PDF (mismo componente FileViewer que el RUT) */}
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 md:p-8">
          <div className="relative w-full max-w-5xl h-dvh sm:h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
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

      {/* Modal de trazabilidad del certificado */}
      {timeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 md:p-8">
          <div className="relative w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider truncate">
                  Trazabilidad del Certificado
                </h3>
                <p className="text-[11px] font-mono text-blue-600 truncate mt-0.5">
                  {timeline.codigoCertificado}
                </p>
              </div>
              <button
                onClick={() => setTimeline(null)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all text-xs font-bold border border-rose-200 cursor-pointer shrink-0"
              >
                <X size={18} className="text-rose-600 shrink-0" /> Cerrar
              </button>
            </div>
            <div className="flex-1 w-full h-full overflow-hidden bg-slate-100 p-4">
              <TimelineCertificado item={timeline} onVerArchivo={verArchivo} />
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
import { useModuleSplashReady } from "@/app/dashboard/components/PageLoadSplash";

export default function ClienteDetailPage({ onVolver, id_cliente }: ClienteDetailPageProps) {
  const [is_open_documento, setIsOpenDocumento] = useState(false);
  const [searchCodigo, setSearchCodigo] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("TODOS");
  const [trazabilidad, setTrazabilidad] = useState<TrazabilidadCliente | null>(null);
  const [cargandoTrazabilidad, setCargandoTrazabilidad] = useState(true);
  useModuleSplashReady("perfil_cliente", (id_cliente === null || id_cliente === undefined) || !cargandoTrazabilidad);
  const [config, setConfig] = useState<DocumentConfig>(initialDocumentConfig);
  const revisionCotizaciones = useRevisionTablas("cotizaciones", "documentos", "version_documentos");

  useEffect(() => {
    if (id_cliente === null || id_cliente === undefined) {
      return;
    }

    let activo = true;
    const timer = window.setTimeout(async () => {
      if (activo) setCargandoTrazabilidad(true);
      try {
        const resultado = await obtenerTrazabilidadCliente(id_cliente);
        if (activo && resultado?.data) setTrazabilidad(resultado.data);
      } catch (error) {
        console.error("No se pudo cargar la trazabilidad del cliente:", error);
      } finally {
        if (activo) setCargandoTrazabilidad(false);
      }
    }, 150);
    return () => {
      activo = false;
      window.clearTimeout(timer);
    };
  }, [id_cliente, revisionCotizaciones]);

  const filteredCotizaciones = useMemo<TrazabilidadCotizacionCard[]>(() => {
    if (!trazabilidad?.cotizaciones) return [];

    return trazabilidad.cotizaciones
      .filter((cot) => {
        const matchCodigo = cot?.codigo
          ?.toLowerCase()
          .includes(searchCodigo.toLowerCase());
        const matchEstado =
          filterEstado === "TODOS" || cot?.estado === filterEstado;
        return matchCodigo && matchEstado;
      })
      .map((cot) => {
        const detalles = cot.detalles ?? [];
        const primero = detalles[0]?.equipoDescripcion || "Servicio de calibración";
        const titulo =
          detalles.length > 1 ? `${primero} (+${detalles.length - 1})` : primero;
        const fecha = cot.updatedAt ?? cot.createdAt;
        const fechaFin = fecha ? new Date(fecha).toLocaleDateString("es-CO") : "—";
        return { ...cot, titulo, fechaFin };
      });
  }, [searchCodigo, filterEstado, trazabilidad]);

  const handleViewRut = useCallback(async (t: TrazabilidadCliente | null) => {
    const key = t?.rutDocumento?.rutaUrl;
    const url = key ? await generarUrlArchivo(key) : null;
    setConfig(
      createDocumentConfig({
        apiBaseUrl: '/api/v1',
        fileId: '',
        fileUrl: url ?? undefined,
        kind: 'pdf',
      })
    );
    setIsOpenDocumento(true);
  }, []);

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
          <div className="flex flex-col gap-2">
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
    
   
    <div className="relative w-full max-w-5xl h-dvh sm:h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      

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
          fileUrl={config.fileUrl}
        />
      </div>

    </div>
  </div>
)}

    </div>
    
  );
}
