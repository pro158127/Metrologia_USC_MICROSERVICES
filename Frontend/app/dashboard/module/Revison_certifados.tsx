// 1. Imports
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Info,
  CheckCircle,
  MessageSquare,
  ChevronUp,
  ChevronDown,
  X,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "next-auth/react";
import {
  obtenerCertificadosRevision,
  aprobarCertificado,
  rechazarCertificado,
  type CertificadoRevisionItem,
} from "@/app/action_module/certificados";
import { generarUrlArchivo } from "@/app/action_module/archivos";
import type {
  SortField,
  SortDir,
  CertificadoRevision,
  ToastNotificationProps,
  RejectModalProps,
  ApproveModalProps,
  CertificatesTableProps,
  PDFViewerPanelProps,
} from "@/tipos/calibracion";

// 2. Componentes hijos

const ToastNotification = ({ message }: ToastNotificationProps) => {
  if (!message) return null;
  return (
    <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg border border-slate-800">
      {message}
    </div>
  );
};

const RejectModal = ({
  showDevolver,
  label,
  motivo,
  motivoError,
  setMotivo,
  setMotivoError,
  setShowDevolver,
  handleDevolver,
}: RejectModalProps) => {
  if (!showDevolver) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="rounded-2xl p-6 w-full max-w-md bg-white border border-slate-100 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-2.5">
            Rechazar Certificado {label ? `— ${label}` : ""}
          </span>
          <button
            onClick={() => {
              setShowDevolver(null);
              setMotivo("");
              setMotivoError(false);
            }}
            className="bg-transparent border-none cursor-pointer"
          >
            <X size={18} color="#94A3B8" />
          </button>
        </div>
        <div className="px-3 py-2 rounded-xl mb-4 bg-amber-50 border border-amber-100">
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wide">
            El técnico recibirá la notificación con el motivo de rechazo.
          </span>
        </div>
        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
          Motivo del rechazo <span className="text-rose-500">*</span>
        </label>
        <textarea
          value={motivo}
          onChange={(e) => {
            setMotivo(e.target.value);
            setMotivoError(false);
          }}
          rows={4}
          placeholder="Describe detalladamente las correcciones requeridas..."
          className={`w-full px-3 py-2.5 rounded-xl border text-xs font-medium placeholder:text-slate-400 outline-none transition focus:ring-2 focus:ring-[#5680F9]/10 ${
            motivoError
              ? "border-rose-400 focus:border-rose-500"
              : "border-slate-200 focus:border-[#5680F9]"
          }`}
          style={{ resize: "none" }}
        />
        {motivoError && (
          <p className="text-[10px] text-rose-500 font-bold mt-1 uppercase tracking-wider">
            El motivo es obligatorio
          </p>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={() => {
              setShowDevolver(null);
              setMotivo("");
            }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white text-xs font-bold cursor-pointer hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleDevolver(showDevolver)}
            className="px-5 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold border-none cursor-pointer hover:bg-rose-600 transition-colors shadow-sm"
          >
            Confirmar Rechazo
          </button>
        </div>
      </div>
    </div>
  );
};

const ApproveModal = ({
  showAprobar,
  label,
  setShowAprobar,
  handleAprobar,
}: ApproveModalProps) => {
  if (!showAprobar) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="rounded-2xl p-6 w-full max-w-sm bg-white border border-slate-100 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle size={20} className="text-[#22C55E]" />
          <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Confirmar aprobación
          </span>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed mb-5">
          ¿Estás seguro de aprobar el certificado de la OT{" "}
          <strong>{label}</strong>? Pasará a la cola de firma.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setShowAprobar(null)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 bg-white text-xs font-bold cursor-pointer hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => handleAprobar(showAprobar)}
            className="px-5 py-2.5 rounded-xl bg-[#22C55E] text-white text-xs font-bold border-none cursor-pointer hover:bg-emerald-600 transition-colors shadow-sm"
          >
            ✓ Sí, aprobar
          </button>
        </div>
      </div>
    </div>
  );
};

const HeaderSection = ({ pendingCount, rol }: { pendingCount: number; rol: string }) => (
  <div className="flex items-start justify-between mb-5">
    <div>
      <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
        Revisión de Certificados
      </h1>
      <div className="flex items-center gap-3 mt-3 pl-4">
        <div className="flex items-center gap-3.5 px-4 py-2.5 rounded-2xl bg-rose-500 text-white shadow-sm">
          <span className="text-3xl font-extrabold leading-none">{pendingCount}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider leading-relaxed max-w-[90px]">
            pendientes de revisión
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
          <ShieldCheck size={14} className="text-[#5680F9]" /> Rol: {rol}
        </div>
      </div>
    </div>
  </div>
);

const InfoBanner = () => (
  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl mb-4 bg-blue-50 border border-blue-100/50">
    <Info size={14} className="text-[#5680F9] mt-0.5 flex-shrink-0" />
    <p className="text-xs font-medium text-[#2d3748]">
      Identificación de registros por{" "}
      <strong className="text-[#5680F9]">Número de Estampilla e Instrumento</strong>. Control de
      acciones restringido a Directores y Coordinadoras.
    </p>
  </div>
);

const CenteredMessage = ({ text, isError = false }: { text: string; isError?: boolean }) => (
  <div className="flex h-full w-full items-center justify-center p-8 text-center">
    <p className={isError ? "text-rose-600 text-xs" : "text-slate-500 text-xs"}>{text}</p>
  </div>
);

/** Visor PDF real: obtiene una URL firmada del documento del certificado. */
const CertificadoPdfViewer = ({
  rutaUrl,
  nombre,
}: {
  rutaUrl?: string | null;
  nombre: string;
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(!!rutaUrl);

  useEffect(() => {
    let activo = true;
    if (!rutaUrl) return;
    generarUrlArchivo(rutaUrl).then((u) => {
      if (activo) {
        setUrl(u);
        setCargando(false);
      }
    });
    return () => {
      activo = false;
    };
  }, [rutaUrl]);

  if (cargando) return <CenteredMessage text="Generando visor..." />;
  if (!url) return <CenteredMessage text="No se pudo cargar el certificado." isError />;
  return <iframe src={url} title={nombre} className="h-full w-full border-0 rounded-xl bg-white" />;
};

const CertificatesTable = ({
  sortedCerts,
  selected,
  sortField,
  sortDir,
  tienePermisosRevision,
  handleSort,
  setSelected,
  setShowAprobar,
  setShowDevolver,
}: CertificatesTableProps) => {
  const SortIcon = ({ field }: { field: SortField }) =>
    sortField === field ? (
      sortDir === "asc" ? (
        <ChevronUp size={12} color="#5680F9" />
      ) : (
        <ChevronDown size={12} color="#5680F9" />
      )
    ) : (
      <ChevronDown size={12} color="#CBD2E1" />
    );

  const columns = [
    { label: "N° OT", field: "ot" as SortField },
    { label: "Estampilla", field: "estampilla" as SortField },
    { label: "Instrumento", field: "instrumento" as SortField },
    { label: "Cliente", field: "cliente" as SortField },
    { label: "Técnico", field: "tecnico" as SortField },
    { label: "Tipo", field: "tipo" as SortField },
    { label: "Fecha subida", field: "fecha" as SortField },
    { label: "En espera", field: "espera" as SortField },
    { label: "Acciones", field: null },
  ];

  return (
    <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-100">
            {columns.map((c, i) => (
              <th
                key={i}
                onClick={() => c.field && handleSort(c.field)}
                className={`px-4 py-3.5 text-slate-400 font-bold uppercase tracking-wider text-[10px] ${
                  c.field ? "cursor-pointer select-none" : ""
                }`}
              >
                <span className="flex items-center gap-1">
                  {c.label}
                  {c.field && <SortIcon field={c.field} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sortedCerts.map((c) => (
            <tr
              key={c.idCertificado}
              onClick={() =>
                !c.bloqueado &&
                setSelected(selected === c.idCertificado ? null : c.idCertificado)
              }
              className={`transition-colors cursor-pointer ${
                selected === c.idCertificado
                  ? "bg-blue-50/40"
                  : c.bloqueado
                  ? "bg-rose-50/10 cursor-not-allowed"
                  : "bg-white hover:bg-slate-50/50"
              }`}
            >
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#5680F9] font-mono">{c.ot}</span>
                  {selected === c.idCertificado && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#5680F9]" />
                  )}
                </div>
              </td>
              <td className="px-4 py-3.5 font-mono text-slate-700 font-semibold">
                {c.estampilla}
              </td>
              <td className="px-4 py-3.5 font-medium text-slate-800">{c.instrumento}</td>
              <td className="px-4 py-3.5 font-bold text-slate-600">{c.cliente}</td>
              <td className="px-4 py-3.5 text-slate-500">{c.tecnico}</td>
              <td className="px-4 py-3.5">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                    c.tipo === "Acreditado"
                      ? "bg-blue-50 text-blue-700 border-blue-100/50"
                      : "bg-violet-50 text-violet-700 border-violet-100/50"
                  }`}
                >
                  {c.tipo}
                </span>
              </td>
              <td className="px-4 py-3.5 text-slate-400 font-mono">{c.fecha}</td>
              <td className="px-4 py-3.5">
                <span
                  className="flex items-center gap-1 font-mono text-[11px] font-bold"
                  style={{
                    color: c.espera > 24 ? "#EF4444" : c.espera > 8 ? "#D97706" : "#64748b",
                  }}
                >
                  <Clock size={12} />
                  {c.espera < 60 ? `${c.espera}h` : `${Math.round(c.espera / 24)}d`}
                </span>
              </td>
              <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                {!c.bloqueado && tienePermisosRevision ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowAprobar(c.idCertificado)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-none bg-emerald-50 text-emerald-700 font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-emerald-100 transition-colors"
                    >
                      <CheckCircle size={12} /> Aprobar
                    </button>
                    <button
                      onClick={() => setShowDevolver(c.idCertificado)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border-none bg-rose-50 text-rose-700 font-bold text-[10px] uppercase tracking-wider cursor-pointer hover:bg-rose-100 transition-colors"
                    >
                      <MessageSquare size={12} /> Rechazar
                    </button>
                  </div>
                ) : (
                  !c.bloqueado && (
                    <span className="text-[10px] text-slate-400 italic">Lectura</span>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const PDFViewerPanel = ({
  selectedCert,
  tienePermisosRevision,
  setSelected,
  setShowAprobar,
  setShowDevolver,
}: PDFViewerPanelProps) => (
  <div className="flex flex-col overflow-hidden" style={{ flex: 1, padding: "32px 32px 32px 0" }}>
    <div className="flex items-center justify-between mb-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm">
      <div>
        <div className="text-xs font-bold text-[#5680F9] font-mono">
          {selectedCert.ot} ({selectedCert.estampilla})
        </div>
        <div className="text-[10px] font-bold text-slate-700 uppercase mt-0.5 truncate max-w-xs">
          {selectedCert.instrumento}
        </div>
      </div>
      <button
        onClick={() => setSelected(null)}
        className="bg-transparent border-none cursor-pointer"
      >
        <X size={18} color="#94A3B8" />
      </button>
    </div>

    <div className="flex-1 overflow-hidden mb-4 rounded-xl border border-slate-100 bg-slate-100">
      <CertificadoPdfViewer
        key={selectedCert.idCertificado}
        rutaUrl={selectedCert.rutaUrl}
        nombre={selectedCert.codigo ?? selectedCert.ot}
      />
    </div>

    {tienePermisosRevision && (
      <div className="flex gap-3">
        <button
          onClick={() => setShowAprobar(selectedCert.idCertificado)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold uppercase tracking-wider border-none cursor-pointer shadow-sm transition-colors"
        >
          <CheckCircle size={15} /> Aprobar ✓
        </button>
        <button
          onClick={() => setShowDevolver(selectedCert.idCertificado)}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold uppercase tracking-wider border border-rose-200 cursor-pointer transition-colors"
        >
          <MessageSquare size={15} /> Rechazar
        </button>
      </div>
    )}
  </div>
);

// 3. Componente padre

/** Mapea la respuesta del backend al DTO de la tabla de revisión. */
function mapRevision(data: CertificadoRevisionItem[]): CertificadoRevision[] {
  const now = Date.now();
  return data.map((c) => {
    const fecha = c.createdAt ? new Date(c.createdAt) : new Date();
    const espera = Math.max(0, Math.round((now - fecha.getTime()) / 3600000));
    const datosTecnicos: Record<string, string> = c.datosTecnicos
      ? Object.fromEntries(
          Object.entries(c.datosTecnicos as Record<string, unknown>).map(([k, v]) => [
            k,
            String(v),
          ])
        )
      : {};
    const status: "pendiente" | "aprobado" | "devuelto" =
      c.estadoRevision === "APROBADO"
        ? "aprobado"
        : c.estadoRevision === "RECHAZADO"
        ? "devuelto"
        : "pendiente";

    return {
      idCertificado: c.idCertificado,
      codigo: c.codigo,
      ot: c.codigoOT,
      estampilla: c.estampilla,
      cliente: c.cliente,
      instrumento: c.instrumento,
      tecnico: c.tecnico,
      tipo: c.tipoServicio ? (c.acreditado ? "Acreditado" : "No acreditado") : "—",
      fecha: `${fecha.toLocaleDateString("es-CO")} ${fecha.toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      espera,
      bloqueado: false,
      status,
      datosTecnicos,
      motivoRechazo: c.motivoRechazo,
      rutaUrl: c.rutaUrl,
      acreditado: c.acreditado,
    };
  });
}

export function RevisionCertificados() {
  const { data: session } = useSession();
  const rol = (session?.user?.role as string) || "Sin rol";
  const permisosRevision = session?.user?.permissions?.permisos?.revision;

  const [certsRaw, setCertsRaw] = useState<CertificadoRevision[]>([]);
  const [cargando, setCargando] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [showDevolver, setShowDevolver] = useState<number | null>(null);
  const [showAprobar, setShowAprobar] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState(false);
  const [toast, setToast] = useState("");
  const [sortField, setSortField] = useState<SortField>("espera");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const tienePermisosRevision = Boolean(
    permisosRevision?.revisar_aprobar_acreditados ||
      permisosRevision?.revisar_aprobar_no_acreditados ||
      rol === "Director Técnico" ||
      rol === "Coordinadora"
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const cargar = useCallback(async () => {
    const data = await obtenerCertificadosRevision();
    setCertsRaw(mapRevision(data));
    setCargando(false);
  }, []);

  useEffect(() => {
    let activo = true;
    obtenerCertificadosRevision()
      .then((data) => {
        if (!activo) return;
        setCertsRaw(mapRevision(data));
        setCargando(false);
      })
      .catch(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  const pending = certsRaw.filter((c) => c.status === "pendiente");
  const selectedCert = certsRaw.find((c) => c.idCertificado === selected);
  const labelAprobar = certsRaw.find((c) => c.idCertificado === showAprobar)?.ot ?? "";
  const labelDevolver = certsRaw.find((c) => c.idCertificado === showDevolver)?.ot ?? "";

  const handleSort = useCallback((field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prevField;
      }
      setSortDir("asc");
      return field;
    });
  }, []);

  const sorted: CertificadoRevision[] = useMemo(() => {
    return [...pending].sort((a, b) => {
      const av = String(a[sortField] ?? "").toLowerCase();
      const bv = String(b[sortField] ?? "").toLowerCase();
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }, [pending, sortField, sortDir]);

  const handleAprobar = useCallback(
    async (idCertificado: number) => {
      if (!tienePermisosRevision) return;
      const res = await aprobarCertificado(idCertificado);
      if (!res.ok) {
        showToast(`❌ ${res.error ?? "No se pudo aprobar el certificado."}`);
        return;
      }
      setShowAprobar(null);
      setSelected(null);
      showToast(`✅ ${res.message ?? "Certificado aprobado con éxito."}`);
      await cargar();
    },
    [tienePermisosRevision, showToast, cargar]
  );

  const handleDevolver = useCallback(
    async (idCertificado: number) => {
      if (!tienePermisosRevision) return;
      if (!motivo.trim()) {
        setMotivoError(true);
        return;
      }
      const res = await rechazarCertificado(idCertificado, motivo.trim());
      if (!res.ok) {
        showToast(`❌ ${res.error ?? "No se pudo rechazar el certificado."}`);
        return;
      }
      setShowDevolver(null);
      setMotivo("");
      setMotivoError(false);
      setSelected(null);
      showToast(`📤 ${res.message ?? "Certificado rechazado y devuelto al técnico."}`);
      await cargar();
    },
    [tienePermisosRevision, motivo, showToast, cargar]
  );

  return (
    <div className="module-page flex overflow-hidden">
      <ToastNotification message={toast} />

      <RejectModal
        showDevolver={showDevolver}
        label={labelDevolver}
        motivo={motivo}
        motivoError={motivoError}
        setMotivo={setMotivo}
        setMotivoError={setMotivoError}
        setShowDevolver={setShowDevolver}
        handleDevolver={handleDevolver}
      />

      <ApproveModal
        showAprobar={showAprobar}
        label={labelAprobar}
        setShowAprobar={setShowAprobar}
        handleAprobar={handleAprobar}
      />

      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: selected ? "55%" : "100%",
          transition: "width 0.2s",
          padding: "32px 24px 32px 32px",
        }}
      >
        <HeaderSection pendingCount={pending.length} rol={rol} />
        <InfoBanner />
        {cargando ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Cargando bandeja de certificados...
          </div>
        ) : (
          <CertificatesTable
            sortedCerts={sorted}
            selected={selected}
            sortField={sortField}
            sortDir={sortDir}
            tienePermisosRevision={tienePermisosRevision}
            handleSort={handleSort}
            setSelected={setSelected}
            setShowAprobar={setShowAprobar}
            setShowDevolver={setShowDevolver}
          />
        )}
      </div>

      {selected && selectedCert && (
        <PDFViewerPanel
          selectedCert={selectedCert}
          tienePermisosRevision={tienePermisosRevision}
          setSelected={setSelected}
          setShowAprobar={setShowAprobar}
          setShowDevolver={setShowDevolver}
        />
      )}
    </div>
  );
}

// 4. Exportación por Defecto
export default RevisionCertificados;
