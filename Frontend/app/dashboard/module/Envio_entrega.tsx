// ============================================================
// Envio_entrega.tsx — Módulo de Envíos / Entregas (Secretaría)
// Lista agrupada por cotización (hijas) + reglas de comprobante + visor PDF.
// ============================================================
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Send,
  Eye,
  Upload,
  FileText,
  X,
  RefreshCw,
  Filter,
  CheckCircle,
  Clock,
  Paperclip,
} from "lucide-react";
import { useDbTable, useDbActions, useDbLoading } from "@/app/componets/tables_recharge";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import {
  getDocumentosEnvioCotizacion,
  subirComprobanteCotizacion,
  enviarCertificadosCotizacion,
  type DocumentosEnvioCotizacion,
} from "@/app/action_module/envios";
import { generarUrlArchivo } from "@/app/action_module/archivos";
import { validarArchivo } from "@/app/lib/upload";

const formatFecha = (fecha: string | Date | null) => {
  if (!fecha) return "—";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleDateString("es-CO");
};

// -----------------------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------------------

const Toast: React.FC<{ message: string }> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl max-w-sm bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

const PdfViewerModal: React.FC<{
  url: string | null;
  titulo: string;
  cargando: boolean;
  onClose: () => void;
}> = ({ url, titulo, cargando, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
    <div className="w-full max-w-4xl h-dvh sm:h-[85vh] rounded-2xl bg-white shadow-xl border border-slate-100 flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <FileText size={16} /> {titulo}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 border-none bg-transparent cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100">
        {cargando || !url ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500">
            {cargando ? "Generando visor..." : "No se pudo cargar el documento."}
          </div>
        ) : (
          <iframe src={url} title={titulo} className="w-full h-full border-none" />
        )}
      </div>
    </div>
  </div>
);

const GestionPanel: React.FC<{
  idCotizacion: number;
  codigoCotizacion: string;
  onClose: () => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
  onOpenOt: (id: number) => void;
}> = ({ idCotizacion, codigoCotizacion, onClose, onToast, onRefresh, onOpenOt }) => {
  const [docs, setDocs] = useState<DocumentosEnvioCotizacion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [viewer, setViewer] = useState<{ url: string | null; titulo: string } | null>(null);
  const { can } = usePermissions();
  const puedeMarcarPagada = can("entrega_y_envio", "marcar_ot_pagada");
  const puedeEnviarCertificados = can("entrega_y_envio", "enviar_certificados_lotes");

  const recargar = useCallback(() => {
    getDocumentosEnvioCotizacion(idCotizacion).then((d) => setDocs(d));
  }, [idCotizacion]);

  useEffect(() => {
    let activo = true;
    getDocumentosEnvioCotizacion(idCotizacion)
      .then((d) => {
        if (activo) {
          setDocs(d);
          setCargando(false);
        }
      })
      .catch(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [idCotizacion]);

  const verDocumento = useCallback(
    async (rutaUrl: string | null, titulo: string) => {
      if (!rutaUrl) {
        onToast("⚠️ El documento no tiene ruta registrada.");
        return;
      }
      setViewer({ url: null, titulo });
      setFirmando(true);
      const url = await generarUrlArchivo(rutaUrl);
      setFirmando(false);
      setViewer({ url, titulo });
    },
    [onToast]
  );

  const handleUpload = useCallback(
    async (files: File[]) => {
      const validos: File[] = [];
      for (const file of files) {
        const error = validarArchivo(file, { extensionesPermitidas: ["pdf", "png", "jpg", "jpeg"] });
        if (error) {
          onToast(`❌ ${error}`);
        } else {
          validos.push(file);
        }
      }
      if (validos.length === 0) return;

      setSubiendo(true);
      let fallos = 0;
      for (const file of validos) {
        const res = await subirComprobanteCotizacion(idCotizacion, file);
        if (!res.ok) fallos += 1;
      }
      setSubiendo(false);
      if (fallos > 0) {
        onToast(`❌ No se pudieron subir ${fallos} comprobante(s).`);
      } else {
        onToast(`✅ ${validos.length} comprobante(s) registrado(s).`);
      }
      recargar();
      onRefresh();
    },
    [idCotizacion, onToast, recargar, onRefresh]
  );

  const handleEnviar = useCallback(async () => {
    setEnviando(true);
    const res = await enviarCertificadosCotizacion(idCotizacion);
    setEnviando(false);
    if (!res.ok) {
      onToast(`❌ ${res.error ?? "No se pudo enviar."}`);
      return;
    }
    onToast(`✅ ${res.message ?? "Certificados enviados."}`);
    recargar();
    onRefresh();
  }, [idCotizacion, onToast, recargar, onRefresh]);

  const todosAprobados = docs?.todosAprobados ?? false;
  const tieneComprobante = (docs?.comprobantes?.length ?? 0) > 0;
  const puedeEnviar = todosAprobados && tieneComprobante && !!docs?.correo;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <div className="w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <div className="text-sm font-black text-slate-800">Cotización {codigoCotizacion}</div>
            <div className="text-[11px] text-slate-400">
              {docs?.cliente ?? "Cargando..."} · {docs?.correo ?? "sin correo"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 border-none bg-transparent cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {cargando ? (
            <div className="text-xs text-slate-400">Cargando documentos...</div>
          ) : (
            <>
              {/* OTs vinculadas */}
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Órdenes de Trabajo vinculadas
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(docs?.ots ?? []).map((ot) => (
                    <button
                      key={ot.idOrdenTrabajo}
                      onClick={() => onOpenOt(ot.idOrdenTrabajo)}
                      className="font-mono text-[11px] font-bold text-[#5680F9] bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1 hover:bg-blue-100 transition-colors cursor-pointer"
                    >
                      {ot.codigo}
                    </button>
                  ))}
                </div>
                {docs?.masterCodigo && (
                  <div className="mt-2 text-[11px] text-slate-400">
                    OT Master: <span className="font-mono font-semibold">{docs.masterCodigo}</span>
                  </div>
                )}
              </section>

              {/* Estado de aprobación */}
              <div
                className={`rounded-xl border px-4 py-3 text-xs font-bold ${
                  todosAprobados
                    ? "bg-emerald-50 border-emerald-100 text-emerald-700"
                    : "bg-amber-50 border-amber-100 text-amber-700"
                }`}
              >
                {todosAprobados
                  ? "Todos los certificados están aprobados."
                  : "Aún hay certificados pendientes de aprobación."}
              </div>

              {/* Certificados */}
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Certificados ({docs?.certificados.length ?? 0})
                </h3>
                <div className="flex flex-col gap-2">
                  {(docs?.certificados ?? []).map((c) => (
                    <div
                      key={c.idCertificado}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700 truncate">
                          {c.codigo}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {c.instrumento} · {c.estampilla ?? "sin estampilla"} · OT {c.codigoOT}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            c.estadoRevision === "APROBADO"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                              : c.estadoRevision === "RECHAZADO"
                              ? "bg-rose-50 text-rose-700 border-rose-100"
                              : "bg-amber-50 text-amber-700 border-amber-100"
                          }`}
                        >
                          {c.estadoRevision}
                        </span>
                        <button
                          onClick={() => verDocumento(c.rutaUrl, c.codigo)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[#5680F9] text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-100"
                        >
                          <Eye size={12} /> Ver
                        </button>
                      </div>
                    </div>
                  ))}
                  {(docs?.certificados.length ?? 0) === 0 && (
                    <div className="text-[11px] text-slate-400 italic">
                      No hay certificados registrados para esta cotización.
                    </div>
                  )}
                </div>
              </section>

              {/* Comprobantes */}
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Comprobantes de pago ({docs?.comprobantes.length ?? 0})
                </h3>
                {(docs?.comprobantes ?? []).map((comp) => (
                  <div
                    key={comp.idDocumento}
                    className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 mb-2"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                      <Paperclip size={14} /> {comp.nombre}
                    </div>
                    <button
                      onClick={() => verDocumento(comp.rutaUrl, comp.nombre)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <Eye size={12} /> Ver
                    </button>
                  </div>
                ))}
                {puedeMarcarPagada ? (
                  <label
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed text-[11px] font-semibold transition-colors ${
                      todosAprobados
                        ? "border-slate-300 bg-slate-50 text-slate-600 cursor-pointer hover:bg-slate-100"
                        : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
                    }`}
                  >
                    <Upload size={14} />
                    <span>
                      {todosAprobados
                        ? subiendo
                          ? "Subiendo..."
                          : "Subir comprobante(s) (PDF, PNG o JPG)"
                        : "Bloqueado: espera la aprobación de todos los certificados"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      multiple
                      className="hidden"
                      disabled={!todosAprobados || subiendo}
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        if (files.length) handleUpload(files);
                      }}
                    />
                  </label>
                ) : (
                  <span className="text-[11px] font-semibold text-slate-400">
                    Sin permisos para subir comprobante de pago.
                  </span>
                )}
              </section>

              {/* Enviar */}
              {puedeEnviarCertificados && (
                <button
                  onClick={handleEnviar}
                  disabled={!puedeEnviar || enviando}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border-none transition-colors ${
                    puedeEnviar && !enviando
                      ? "bg-[#5680F9] text-white cursor-pointer hover:bg-[#4069E2]"
                      : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  {enviando ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                  {enviando ? "Enviando..." : "Enviar certificados al cliente"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {viewer && (
        <PdfViewerModal
          url={viewer.url}
          titulo={viewer.titulo}
          cargando={firmando}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
};

// -----------------------------------------------------------------------------
// Componente principal
// -----------------------------------------------------------------------------

export function MainRendererenv({ onOpenOt }: { onOpenOt: (id: number) => void }) {
  const ordenes = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const { loadTable } = useDbActions();
  const loadingEnvio = useDbLoading("ordenes_trabajo");

  useEffect(() => {
    loadTable("ordenes_trabajo");
    loadTable("clientes");
  }, [loadTable]);

  const [busqueda, setBusqueda] = useState<string>("");
  const [gestion, setGestion] = useState<{ idCotizacion: number; codigoCotizacion: string } | null>(null);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);

  // Agrupa hijas por cotización; el grupo aparece cuando TODAS están en Certificado_aprobado.
  const grupos = useMemo(() => {
    const hijas = ordenes.filter((o) => o.sitioCalibracion != null && o.vigente !== false);
    const map = new Map<number, typeof hijas>();
    for (const h of hijas) {
      if (h.idCotizacion == null) continue;
      const lista = map.get(h.idCotizacion) ?? [];
      lista.push(h);
      map.set(h.idCotizacion, lista);
    }
    return Array.from(map.entries())
      .map(([idCotizacion, hs]) => {
        const master = ordenes.find(
          (o) => o.idCotizacion === idCotizacion && o.sitioCalibracion == null
        );
        const cliente =
          clientes.find((c) => c.idCliente === hs[0]?.idCliente)?.razonSocial ??
          hs[0]?.cliente?.razonSocial ??
          "—";
        const todosAprobados = hs.every((h) => h.estado === "Certificado_aprobado");
        return {
          idCotizacion,
          codigoCotizacion: hs[0]?.cotizacion?.codigo ?? "—",
          masterCodigo: master?.codigo ?? "—",
          cliente,
          correo:
            hs[0]?.correoCertificado ??
            clientes.find((c) => c.idCliente === hs[0]?.idCliente)?.correo ??
            "—",
          totalHijas: hs.length,
          todosAprobados,
          fecha: hs[0]?.createdAt,
        };
      })
      .filter((g) => g.todosAprobados)
      .filter((g) => {
        if (!busqueda) return true;
        const q = busqueda.toLowerCase();
        return (
          g.cliente.toLowerCase().includes(q) ||
          g.codigoCotizacion.toLowerCase().includes(q) ||
          g.masterCodigo.toLowerCase().includes(q)
        );
      });
  }, [ordenes, clientes, busqueda]);

  return (
    <div className="module-page" style={{ position: "relative" }}>
      <Toast message={toast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
            Entrega y Envío de Certificados
          </h1>
          <p className="text-xs text-slate-400 mt-1 pl-3">
            Cotizaciones con todas sus órdenes aprobadas, listas para pago y despacho.
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-slate-500">{grupos.length} cotizaciones</span>
      </div>

      {/* Búsqueda */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm mb-5 grid grid-cols-1 gap-4">
        <div className="relative">
          <Filter size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente o cotización..."
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-[#5680F9]"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["Cotización", "OT Master", "Cliente", "Correo", "Hijas", "Fecha", "Acciones"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loadingEnvio ? (
              [1, 2, 3, 4, 5].map((n) => (
                <tr key={n}>
                  <td colSpan={7} className="px-4 py-3.5">
                    <div className="h-4 rounded bg-slate-200 animate-pulse" />
                  </td>
                </tr>
              ))
            ) : grupos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No hay cotizaciones listas para entrega.
                </td>
              </tr>
            ) : (
              grupos.map((g) => (
                <tr key={g.idCotizacion} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-bold text-[#5680F9]">{g.codigoCotizacion}</td>
                  <td className="px-4 py-3.5 font-mono text-slate-500">{g.masterCodigo}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-700">{g.cliente}</td>
                  <td className="px-4 py-3.5 font-mono text-slate-500 truncate max-w-[200px]">{g.correo}</td>
                  <td className="px-4 py-3.5 text-slate-600">{g.totalHijas}</td>
                  <td className="px-4 py-3.5 text-slate-400 font-mono">{formatFecha(g.fecha as string)}</td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setGestion({ idCotizacion: g.idCotizacion, codigoCotizacion: g.codigoCotizacion })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5680F9] text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer hover:bg-[#4069E2] transition-colors border-none"
                    >
                      <CheckCircle size={12} /> Gestionar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
        <Clock size={12} /> El comprobante se habilita solo cuando todos los certificados están aprobados.
      </div>

      {gestion && (
        <GestionPanel
          key={gestion.idCotizacion}
          idCotizacion={gestion.idCotizacion}
          codigoCotizacion={gestion.codigoCotizacion}
          onClose={() => setGestion(null)}
          onToast={showToast}
          onRefresh={() => loadTable("ordenes_trabajo")}
          onOpenOt={onOpenOt}
        />
      )}
    </div>
  );
}

export default MainRendererenv;
