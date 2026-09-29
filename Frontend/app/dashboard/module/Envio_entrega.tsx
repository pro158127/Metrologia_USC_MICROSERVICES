// ============================================================
// Envio_entrega.tsx — Módulo de Envíos / Entregas (Secretaría)
// Lista/tabla con filtros + reglas de comprobante + visor PDF integrado.
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
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";
import {
  getDocumentosEnvio,
  subirComprobante,
  enviarCertificados,
  type DocumentosEnvio,
} from "@/app/action_module/envios";
import { generarUrlArchivo } from "@/app/action_module/archivos";

const ESTADOS_ENVIO = [
  "Certificado_en_revisión",
  "Certificado_aprobado",
  "Certificado_enviado",
] as const;

const ESTADO_BADGE: Record<string, string> = {
  "Certificado_en_revisión": "bg-amber-50 text-amber-700 border-amber-200",
  Certificado_aprobado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Certificado_enviado: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

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
    <div className="w-full max-w-4xl h-[85vh] rounded-2xl bg-white shadow-xl border border-slate-100 flex flex-col">
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
  idOT: number;
  codigoOT: string;
  onClose: () => void;
  onToast: (msg: string) => void;
  onRefresh: () => void;
}> = ({ idOT, codigoOT, onClose, onToast, onRefresh }) => {
  const [docs, setDocs] = useState<DocumentosEnvio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [viewer, setViewer] = useState<{ url: string | null; titulo: string } | null>(null);

  const recargar = useCallback(() => {
    getDocumentosEnvio(idOT).then((d) => setDocs(d));
  }, [idOT]);

  useEffect(() => {
    let activo = true;
    getDocumentosEnvio(idOT)
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
  }, [idOT]);

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
    async (file: File) => {
      setSubiendo(true);
      const res = await subirComprobante(idOT, file);
      setSubiendo(false);
      if (!res.ok) {
        onToast(`❌ ${res.error ?? "No se pudo subir el comprobante."}`);
        return;
      }
      onToast("✅ Comprobante registrado como PDF.");
      recargar();
      onRefresh();
    },
    [idOT, onToast, recargar, onRefresh]
  );

  const handleEnviar = useCallback(async () => {
    setEnviando(true);
    const res = await enviarCertificados(idOT);
    setEnviando(false);
    if (!res.ok) {
      onToast(`❌ ${res.error ?? "No se pudo enviar."}`);
      return;
    }
    onToast(`✅ ${res.message ?? "Certificados enviados."}`);
    recargar();
    onRefresh();
  }, [idOT, onToast, recargar, onRefresh]);

  const todosAprobados = docs?.todosAprobados ?? false;
  const tieneComprobante = !!docs?.comprobante;
  const puedeEnviar = todosAprobados && tieneComprobante && docs?.correo;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40">
      <div className="w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div>
            <div className="text-sm font-black text-slate-800">OT {codigoOT}</div>
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
                          {c.instrumento} · {c.estampilla ?? "sin estampilla"}
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
                      No hay certificados registrados para esta OT.
                    </div>
                  )}
                </div>
              </section>

              {/* Comprobante */}
              <section>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Comprobante de pago
                </h3>
                {tieneComprobante ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                      <Paperclip size={14} /> {docs?.comprobante?.nombre}
                    </div>
                    <button
                      onClick={() =>
                        verDocumento(docs?.comprobante?.rutaUrl ?? null, "Comprobante de pago")
                      }
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-emerald-200 text-emerald-700 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      <Eye size={12} /> Ver
                    </button>
                  </div>
                ) : (
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
                          : "Subir comprobante (PDF, PNG o JPG)"
                        : "Bloqueado: espera la aprobación de todos los certificados"}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,application/pdf"
                      className="hidden"
                      disabled={!todosAprobados || subiendo}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                      }}
                    />
                  </label>
                )}
              </section>

              {/* Enviar */}
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

export function MainRendererenv() {
  const ordenes = useDbTable("ordenes_trabajo");
  const clientes = useDbTable("clientes");
  const { loadTable } = useDbActions();

  useEffect(() => {
    loadTable("ordenes_trabajo");
    loadTable("clientes");
  }, [loadTable]);

  const [filtroEstado, setFiltroEstado] = useState<string>("TODOS");
  const [filtroFecha, setFiltroFecha] = useState<string>("");
  const [busqueda, setBusqueda] = useState<string>("");
  const [gestionOT, setGestionOT] = useState<{ id: number; codigo: string } | null>(null);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }, []);

  const filas = useMemo(() => {
    return ordenes
      .filter((ot) => ESTADOS_ENVIO.includes(ot.estado as (typeof ESTADOS_ENVIO)[number]))
      .map((ot) => {
        const cliente = clientes.find((c) => c.idCliente === ot.idCliente);
        return {
          id: ot.idOrdenTrabajo,
          codigo: ot.codigo,
          cliente: cliente?.razonSocial ?? ot.cliente?.razonSocial ?? "—",
          correo: ot.correoCertificado ?? cliente?.correo ?? "—",
          certs: ot.instrumentos?.length ?? 0,
          estado: ot.estado ?? "—",
          fecha: ot.createdAt,
        };
      })
      .filter((f) => {
        const matchEstado = filtroEstado === "TODOS" || f.estado === filtroEstado;
        const matchBusqueda =
          !busqueda ||
          f.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
          f.codigo.toLowerCase().includes(busqueda.toLowerCase());
        const matchFecha =
          !filtroFecha || new Date(f.fecha as string).toISOString().slice(0, 10) === filtroFecha;
        return matchEstado && matchBusqueda && matchFecha;
      });
  }, [ordenes, clientes, filtroEstado, busqueda, filtroFecha]);

  return (
    <div className="module-page" style={{ position: "relative" }}>
      <Toast message={toast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
            Entrega y Envío de Certificados
          </h1>
          <p className="text-xs text-slate-400 mt-1 pl-3">
            Previsualiza certificados, registra comprobantes y despacha al cliente.
          </p>
        </div>
        <span className="text-xs font-mono font-bold text-slate-500">
          {filas.length} OT
        </span>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm mb-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            <Filter size={11} className="inline mr-1" /> Estado
          </label>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-[#5680F9]"
          >
            <option value="TODOS">Todos</option>
            {ESTADOS_ENVIO.map((e) => (
              <option key={e} value={e}>
                {e.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Fecha
          </label>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-[#5680F9]"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            Cliente / OT
          </label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar..."
            className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-700 outline-none focus:border-[#5680F9]"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {["OT", "Cliente", "Correo", "Certificados", "Estado", "Fecha", "Acciones"].map((h) => (
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
            {filas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No hay órdenes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-bold text-[#5680F9]">{f.codigo}</td>
                  <td className="px-4 py-3.5 font-semibold text-slate-700">{f.cliente}</td>
                  <td className="px-4 py-3.5 font-mono text-slate-500 truncate max-w-[200px]">
                    {f.correo}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <FileText size={12} /> {f.certs}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                        ESTADO_BADGE[f.estado] ?? "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {f.estado.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 font-mono">
                    {formatFecha(f.fecha as string)}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setGestionOT({ id: f.id, codigo: f.codigo })}
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

      {gestionOT && (
        <GestionPanel
          key={gestionOT.id}
          idOT={gestionOT.id}
          codigoOT={gestionOT.codigo}
          onClose={() => setGestionOT(null)}
          onToast={showToast}
          onRefresh={() => loadTable("ordenes_trabajo")}
        />
      )}
    </div>
  );
}

export default MainRendererenv;
