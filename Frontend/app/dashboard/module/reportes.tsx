// 1. Imports
"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { Download, LoaderCircle, FileText, X } from "lucide-react";
import { useDbTable, useDbActions, useDbLoading, useRevisionTablas } from "@/app/componets/tables_recharge";
import { usePermissions } from "@/app/lib/permissions/usePermissions";
import { useModuleSplashReady } from "@/app/dashboard/components/PageLoadSplash";
import {
  obtenerReportes,
  exportarReportePdf,
  exportarReporteExcel,
  consultarEstadoJobReporte,
  buscarFacturasArchivadas,
  type FacturaArchivada,
  type DatosReporte,
  type FiltrosReporte,
} from "@/app/action_module/reportes";
import { generarUrlArchivo } from "@/app/action_module/archivos";
import type { BarChartData, ConversionData, TecnicoResumen, Kpi } from "@/tipos/reportes";

// Reusable Tailwind Style Maps (Sugerencia por alta repetibilidad de inputs/selects)
const inputBaseStyles =
  "px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-none focus:border-[#5680F9] focus:ring-1 focus:ring-[#5680F9] transition-all bg-white";

const formatearMoneda = (value: number) =>
  value.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 });

// 2. Declaración de Componentes Hijos (Extraídos)

const HeaderSection: React.FC<{
  onExportarPdf: () => void;
  onExportarExcel: () => void;
  exportando: boolean;
}> = ({ onExportarPdf, onExportarExcel, exportando }) => {
  const { can } = usePermissions();
  const puedeExportar = can("reportes_y_consolidados", "exportar_base_de_datos");
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
        Reportes y Consolidados
      </h1>
      {puedeExportar && (
      <div className="flex gap-2">
        <button
          onClick={onExportarPdf}
          disabled={exportando}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} /> {exportando ? "Generando..." : "Exportar PDF"}
        </button>
        <button
          onClick={onExportarExcel}
          disabled={exportando}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5680F9] text-white text-xs font-semibold hover:bg-blue-600 transition-all cursor-pointer shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download size={14} /> {exportando ? "Generando..." : "Exportar Excel"}
        </button>
      </div>
      )}
    </div>
  );
};

const FilterBar: React.FC<{
  clientes: string[];
  tecnicos: string[];
  tiposServicio: string[];
  filtros: FiltrosReporte;
  onChange: (f: FiltrosReporte) => void;
}> = ({ clientes, tecnicos, tiposServicio, filtros, onChange }) => {
  const set = (k: keyof FiltrosReporte, v: string) => onChange({ ...filtros, [k]: v || undefined });

  return (
    <div className="flex items-center gap-3 mb-6 p-4 rounded-[16px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] flex-wrap">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filtros:</span>
      <input
        type="date"
        value={filtros.fechaInicio ?? ""}
        onChange={(e) => set("fechaInicio", e.target.value)}
        className={inputBaseStyles}
      />
      <input
        type="date"
        value={filtros.fechaFin ?? ""}
        onChange={(e) => set("fechaFin", e.target.value)}
        className={inputBaseStyles}
      />
      <select
        value={filtros.tipoServicio ?? ""}
        onChange={(e) => set("tipoServicio", e.target.value)}
        className={`${inputBaseStyles} cursor-pointer`}
      >
        <option value="">Tipo servicio — Todos</option>
        {tiposServicio.slice(0, 20).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <select
        value={filtros.cliente ?? ""}
        onChange={(e) => set("cliente", e.target.value)}
        className={`${inputBaseStyles} cursor-pointer`}
      >
        <option value="">Cliente — Todos</option>
        {clientes.slice(0, 20).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <select
        value={filtros.tecnico ?? ""}
        onChange={(e) => set("tecnico", e.target.value)}
        className={`${inputBaseStyles} cursor-pointer`}
      >
        <option value="">Técnico — Todos</option>
        {tecnicos.slice(0, 20).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
};

const KpiGrid: React.FC<{ kpis: Kpi[] }> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="p-5 rounded-[20px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(15,23,42,0.08)]"
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            {k.label}
          </div>
          <div className="text-2xl font-extrabold" style={{ color: k.color }}>
            {k.val}
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
            <span className="text-[11px] text-slate-400 font-medium">{k.sub}</span>
            {k.trend && (
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
                style={{ background: k.bg, color: k.color, borderColor: k.bg + "80" }}
              >
                {k.trend}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const ChartsSection: React.FC<{
  barData: BarChartData[];
  conversionData: ConversionData[];
}> = ({ barData, conversionData }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <div className="rounded-[20px] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
        <div className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3 mb-1">
          OT operativas vigentes por mes
        </div>
        <div className="text-xs text-slate-400 pl-4 mb-4">Servicios externos e internos USC</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barData}>
            <XAxis dataKey="mes" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 12, color: "#fff", fontSize: 11 }} />
            <Bar dataKey="externo" name="Externo" fill="#5680F9" radius={[0, 0, 0, 0]} stackId="a" />
            <Bar dataKey="interno" name="Interno USC" fill="#AFC4FD" radius={[4, 4, 0, 0]} stackId="a" />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-3 pl-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#5680F9" }} />
            <span className="text-[11px] font-semibold text-slate-500">Externo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "#AFC4FD" }} />
            <span className="text-[11px] font-semibold text-slate-500">Interno USC</span>
          </div>
        </div>
      </div>

      <div className="rounded-[20px] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]">
        <div className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3 mb-1">
          Tasa de conversión mensual
        </div>
        <div className="text-xs text-slate-400 pl-4 mb-4">Porcentaje cotizaciones aprobadas / emitidas</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={conversionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F8FAFC" />
            <XAxis dataKey="mes" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 12, color: "#fff", fontSize: 11 }} formatter={(v) => [`${v}%`]} />
            <Line type="monotone" dataKey="tasa" stroke="#22C55E" strokeWidth={2.5} dot={{ fill: "#22C55E", r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const TecnicoSummaryTable: React.FC<{ tecnicoData: TecnicoResumen[] }> = ({ tecnicoData }) => {
  return (
    <div className="rounded-[20px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100">
        <span className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          Resumen por técnico
        </span>
      </div>
      <div className="max-h-96 overflow-auto" tabIndex={0}>
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="bg-slate-50/75 border-b border-slate-100">
              {["Técnico", "OT completadas", "Equipos calibrados", "Promedio días por OT"].map((h) => (
                <th key={h} className="text-left px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tecnicoData.map((t) => (
              <tr key={t.tecnico} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-blue-50 text-[#5680F9] text-xs font-bold">
                      {t.tecnico.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{t.tecnico}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">{t.ots}</td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">{t.equipos}</td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex px-2.5 py-1 rounded-xl text-xs font-bold border ${
                      t.promedioDias <= 3.5
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : "bg-amber-50 text-amber-700 border-amber-100"
                    }`}
                  >
                    {t.promedioDias.toFixed(1)} días
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

type CampoArchivo = "cliente" | "cotizacion" | "orden" | "numero";
type FacetasArchivo = Partial<Record<CampoArchivo, readonly string[]>>;
const etiquetasArchivo: Record<CampoArchivo, string> = {
  cliente: "Cliente", cotizacion: "Cotización", orden: "Orden OT", numero: "Número de factura",
};
const camposCertificados: CampoArchivo[] = ["cliente", "cotizacion", "orden"];
const camposFacturas: CampoArchivo[] = [...camposCertificados, "numero"];

function clienteArchivo(nombre?: string | null, nit?: string | null) {
  if (!nombre || nombre === "—") return [];
  return [nit && nit !== "—" ? `${nombre} · ${nit}` : nombre];
}

function useSelectoresArchivo<T>(registros: T[], campos: CampoArchivo[], obtenerFacetas: (fila: T) => FacetasArchivo) {
  const [seleccion, seleccionar] = useState<Partial<Record<CampoArchivo, string>>>({});
  const filas = useMemo(() => registros.map((fila) => ({ fila, facetas: obtenerFacetas(fila) })), [registros, obtenerFacetas]);
  const disponibles = useMemo(() => campos.map((campo) => {
    const valores = new Set(filas.flatMap(({ facetas }) => facetas[campo] ?? []));
    return [campo, [...valores].sort((a, b) => a.localeCompare(b, "es-CO", { numeric: true }))] as const;
  }), [campos, filas]);
  const activa = Object.fromEntries(disponibles.map(([campo, valores]) => [
    campo, valores.includes(seleccion[campo] ?? "") ? seleccion[campo] : undefined,
  ])) as Partial<Record<CampoArchivo, string>>;
  const coincide = (facetas: FacetasArchivo, exceptuar?: CampoArchivo) =>
    campos.every((campo) => {
      const valor = activa[campo];
      return campo === exceptuar || !valor || facetas[campo]?.includes(valor);
    });
  return {
    registros: filas.filter(({ facetas }) => coincide(facetas)).map(({ fila }) => fila),
    limpiar: () => seleccionar({}),
    campos: disponibles.map(([campo, valores]) => {
      const relacionados = new Set(filas.filter(({ facetas }) => coincide(facetas, campo)).flatMap(({ facetas }) => facetas[campo] ?? []));
      return {
        campo, valor: activa[campo] ?? "", opciones: valores.filter((valor) => relacionados.has(valor)),
        cambiar: (valor: string) => seleccionar((prev) => ({ ...prev, [campo]: valor })),
      };
    }),
  };
}

function SelectoresArchivo({ campos, limpiar }: {
  campos: { campo: CampoArchivo; valor: string; opciones: string[]; cambiar: (valor: string) => void }[];
  limpiar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {campos.map(({ campo, valor, opciones, cambiar }) => (
        <label key={campo} className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-medium text-slate-700">
          {etiquetasArchivo[campo]}
          <select className={`w-full ${inputBaseStyles}`} value={valor} onChange={(e) => cambiar(e.target.value)}>
            <option value="">Todas las opciones</option>
            {opciones.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
          </select>
        </label>
      ))}
      {campos.some(({ valor }) => valor) && (
        <button type="button" onClick={limpiar} className="rounded-xl px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-50">
          Limpiar filtros
        </button>
      )}
    </div>
  );
}

const facetasCertificado = (certificado: DatosReporte["certificados"][number]): FacetasArchivo => ({
  cliente: clienteArchivo(certificado.cliente, certificado.nit),
  cotizacion: certificado.cotizacion ? [certificado.cotizacion] : [],
  orden: certificado.ot && certificado.ot !== "—" ? [certificado.ot] : [],
});

const facetasFactura = (factura: FacturaArchivada): FacetasArchivo => ({
  cliente: clienteArchivo(factura.cliente, factura.nit),
  cotizacion: factura.cotizacion ? [factura.cotizacion] : [],
  orden: factura.ordenes,
  numero: [factura.numero],
});

const HistoricalCertificatesTable: React.FC<{
  certHistoricos: DatosReporte["certificados"];
  onVerPdf: (rutaUrl: string | null, titulo: string) => void;
}> = ({ certHistoricos, onVerPdf }) => {
  const filtros = useSelectoresArchivo(certHistoricos, camposCertificados, facetasCertificado);
  return (
    <div className="rounded-[20px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100">
        <span className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          Búsqueda de certificados históricos (RF-41)
        </span>
      </div>
      <div className="px-6 py-4"><SelectoresArchivo campos={filtros.campos} limpiar={filtros.limpiar} /></div>
      {!filtros.registros.length && <p className="px-6 pb-4 text-xs text-slate-500">No hay certificados para estos filtros.</p>}
      <div className="max-h-96 overflow-auto" tabIndex={0}>
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="bg-slate-50/75 border-b border-slate-100">
              {["N° Certificado", "Cliente", "NIT", "Cotización", "Orden OT", "Instrumento", "Estampilla", "Fecha emisión", "Técnico", "Acciones"].map((h) => (
                <th key={h} className="text-left px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtros.registros.map((c) => (
              <tr key={c.codigo} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-[#5680F9]">{c.codigo}</td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-700">{c.cliente}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{c.nit}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{c.cotizacion ?? "—"}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{c.ot}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{c.instrumento}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-mono">{c.estampilla ?? "—"}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{c.fecha ? new Date(c.fecha).toLocaleDateString("es-CO") : "—"}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{c.tecnico}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onVerPdf(c.rutaUrl, c.codigo)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-[#5680F9] hover:bg-blue-100 text-xs font-semibold transition-all border border-blue-100/50 cursor-pointer"
                  >
                    <FileText size={12} /> Ver PDF + trazabilidad
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const estadosFacturaPdf = { disponible: "Disponible", pendiente: "En preparación", fallido: "Error al archivar", sin_pdf: "Sin PDF archivado" };

function ConsultaFacturas({ descargar }: { descargar: (numero: string) => Promise<void> }) {
  const { can } = usePermissions();
  const puedeConsultar = can("reportes_y_consolidados", "generar_consolidado_ventas");
  const [facturas, setFacturas] = useState<FacturaArchivada[]>([]);
  const [buscando, setBuscando] = useState(true);
  const [error, setError] = useState("");
  const [descargas, setDescargas] = useState<Set<string>>(new Set());
  const enCurso = useRef(new Set<string>());
  const revision = useRevisionTablas("facturas", "documentos");
  const filtros = useSelectoresArchivo(facturas, camposFacturas, facetasFactura);

  const iniciarDescarga = async (numero: string) => {
    if (enCurso.current.has(numero)) return;
    enCurso.current.add(numero);
    setDescargas(new Set(enCurso.current));
    try {
      await descargar(numero);
    } finally {
      enCurso.current.delete(numero);
      setDescargas(new Set(enCurso.current));
    }
  };

  useEffect(() => {
    if (!puedeConsultar) return;
    let activo = true;
    void buscarFacturasArchivadas({ numero: "", cotizacion: "", orden: "", cliente: "" }).then((resultado) => {
      if (!activo) return;
      setFacturas(resultado.data ?? []);
      setError(resultado.error ?? "");
      setBuscando(false);
    });
    return () => { activo = false; };
  }, [puedeConsultar, revision]);

  if (!puedeConsultar) return null;
  return (
    <section className="mb-6 rounded-2xl border border-slate-100 bg-white p-6">
      <h2 className="mb-2 text-sm font-bold text-slate-800">Facturas archivadas</h2>
      <div className="mb-5"><SelectoresArchivo campos={filtros.campos} limpiar={filtros.limpiar} /></div>
      {buscando ? <p role="status" className="text-xs text-slate-500">Buscando facturas…</p>
        : error ? <p role="alert" className="text-xs text-rose-700">{error}</p>
          : !filtros.registros.length ? <p className="text-xs text-slate-500">No se encontraron facturas para los filtros seleccionados.</p>
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>{["Factura", "Cliente", "Cotización", "Órdenes OT", "Fecha", "Valor", "PDF"].map((titulo) => <th key={titulo} className="p-3">{titulo}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtros.registros.map((factura) => (
                      <tr key={factura.numero}>
                        <td className="p-3 font-semibold">{factura.numero}</td>
                        <td className="p-3">{factura.cliente ?? "—"}</td>
                        <td className="p-3">{factura.cotizacion ?? "—"}</td>
                        <td className="p-3">{factura.ordenes.join(", ") || "—"}</td>
                        <td className="p-3">{new Date(factura.fecha).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}</td>
                        <td className="p-3">{formatearMoneda(factura.valor)}</td>
                        <td className="p-3">{factura.estadoPdf === "disponible" ? (
                          <button type="button" disabled={descargas.has(factura.numero)} aria-busy={descargas.has(factura.numero)}
                            className="inline-flex min-w-36 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-wait disabled:bg-blue-400"
                            onClick={() => void iniciarDescarga(factura.numero)}>
                            {descargas.has(factura.numero) ? <><LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> Descargando…</>
                              : <><Download size={14} aria-hidden="true" /> Descargar PDF</>}
                          </button>
                        ) : estadosFacturaPdf[factura.estadoPdf]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
    </section>
  );
}

// 3. Componente Padre (`MainRenderer`)

export function MainRendererreport() {
  const clientes = useDbTable("clientes");
  const tarifas = useDbTable("tarifas");
  const loadingClientes = useDbLoading("clientes");
  const loadingTarifas = useDbLoading("tarifas");
  const { loadTable } = useDbActions();

  const [filtros, setFiltros] = useState<FiltrosReporte>({});
  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [cargandoReporte, setCargandoReporte] = useState(true);
  useModuleSplashReady("reportes", !cargandoReporte && !loadingClientes && !loadingTarifas);
  const [exportando, setExportando] = useState(false);
  const [toast, setToast] = useState("");
  const [viewer, setViewer] = useState<{ url: string | null; titulo: string } | null>(null);
  const [verificando, setVerificando] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }, []);

  const revision = useRevisionTablas(
    "cotizaciones", "ordenes_trabajo", "certificados", "calibraciones", "facturas", "recepciones_equipo",
  );

  React.useEffect(() => {
    for (const tabla of ["clientes", "tarifas"] as const) {
      void loadTable(tabla);
    }
  }, [loadTable]);

  React.useEffect(() => {
    let activo = true;
    const timer = window.setTimeout(async () => {
      try {
        const reporte = await obtenerReportes(filtros);
        if (activo) setDatos(reporte);
      } finally {
        if (activo) setCargandoReporte(false);
      }
    }, 150);
    return () => {
      activo = false;
      window.clearTimeout(timer);
    };
  }, [filtros, revision]);

  const aplicarFiltros = useCallback((f: FiltrosReporte) => {
    setCargandoReporte(true);
    setFiltros({ ...f });
  }, []);

  // ==========================================
  const barData = datos?.series ?? [];
  const conversionData = datos?.series ?? [];

  // ==========================================
  // DATOS DEL ENDPOINT DE REPORTES
  // ==========================================
  const kpis: Kpi[] = useMemo(() => {
    const k = datos?.kpis;
    if (!k) return [];
    return [
      { label: "Cotizaciones emitidas", val: String(k.cotizacionesEmitidas), sub: "registradas en el sistema", color: "#5680F9", bg: "#EEF2FF", trend: "" },
      { label: "Tasa de conversión", val: `${k.tasaConversion}%`, sub: "aprobadas sobre emitidas", color: "#22C55E", bg: "#F0FDF4", trend: "" },
      { label: "Ingresos facturados", val: formatearMoneda(k.ingresos), sub: "total facturado registrado", color: "#9A8CF3", bg: "#F5F3FF", trend: "" },
      { label: "Órdenes internas USC", val: String(k.ordenesInternas), sub: "OT operativas vigentes de Interno USC", color: "#F59C0B", bg: "#FFFBEB", trend: "" },
    ];
  }, [datos]);

  const tecnicoData: TecnicoResumen[] = datos?.tecnicos ?? [];
  const certHistoricos = datos?.certificados ?? [];

  const tiposServicio = useMemo(() => {
    const set = new Set<string>();
    tarifas.forEach((t) => set.add(t.tipoServicio));
    return Array.from(set).filter(Boolean);
  }, [tarifas]);

  const tecnicos = useMemo(() => (datos?.tecnicos ?? []).map((t) => t.tecnico), [datos]);
  const clientesFiltro = useMemo(() => clientes.map((c) => c.razonSocial), [clientes]);

  const verPdf = useCallback(
    async (rutaUrl: string | null, titulo: string) => {
      if (!rutaUrl) {
        showToast("El certificado no tiene documento PDF registrado.");
        return;
      }
      setViewer({ url: null, titulo });
      setVerificando(true);
      const url = await generarUrlArchivo(rutaUrl);
      setVerificando(false);
      setViewer({ url, titulo });
    },
    [showToast]
  );

  const exportar = useCallback(
    async (formato: "pdf" | "excel") => {
      setExportando(true);
      const resultado =
        formato === "pdf" ? await exportarReportePdf(filtros) : await exportarReporteExcel(filtros);
      const jobId = resultado.jobId;
      if (!jobId) {
        showToast(resultado.error ?? "No se pudo encolar la exportación.");
        setExportando(false);
        return;
      }

      const iniciado = Date.now();
      const consultar = async () => {
        const st = await consultarEstadoJobReporte(jobId);
        if (st?.status === "completed") {
          setExportando(false);
          if (!st.url) {
            showToast(st.error ?? "El reporte terminó, pero no tiene un archivo descargable. Genéralo nuevamente.");
            return;
          }
          // El job termina de forma asíncrona; window.open aquí suele ser
          // bloqueado por Chrome porque ya no ocurre dentro del clic original.
          // Un enlace same-origin descarga el adjunto sin abrir otra pestaña.
          const enlace = document.createElement("a");
          enlace.href = st.url;
          enlace.download = `reporte.${formato === "excel" ? "xlsx" : "pdf"}`;
          enlace.style.display = "none";
          document.body.appendChild(enlace);
          enlace.click();
          enlace.remove();
          return;
        }
        if (st?.status === "failed") {
          setExportando(false);
          showToast(st.error ? `Error al generar el archivo: ${st.error}` : "Error al generar el archivo.");
          return;
        }

        if (Date.now() - iniciado > 10 * 60 * 1000) {
          setExportando(false);
          showToast("La generación está tardando más de lo esperado. Vuelve a intentarlo y revisa los logs del worker de reportes.");
          return;
        }

        // setTimeout evita consultas simultáneas cuando una respuesta HTTP
        // tarda más que el intervalo configurado.
        window.setTimeout(consultar, 2000);
      };
      void consultar();
    },
    [filtros, showToast]
  );

  const descargarFactura = useCallback(async (numeroFactura: string) => {
    try {
      const url = `/api/reportes/facturas/${encodeURIComponent(numeroFactura)}/download`;
      const respuesta = await fetch(url, { cache: 'no-store' });
      if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => null) as { error?: string } | null;
        throw new Error(error?.error ?? "No se pudo descargar el PDF archivado.");
      }
      const archivo = URL.createObjectURL(await respuesta.blob());
      const enlace = document.createElement("a");
      enlace.href = archivo;
      enlace.download = `${numeroFactura.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(archivo), 1000);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo descargar el PDF archivado.");
    }
  }, [showToast]);


  return (
    <div className="module-page text-slate-900">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold shadow-lg">
          {toast}
        </div>
      )}

      {cargandoReporte ? (
        <div className="space-y-5 animate-pulse">
          <div className="h-8 w-64 rounded bg-slate-200" />
          <div className="h-12 rounded-2xl bg-slate-200" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-28 rounded-2xl bg-slate-200" />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-slate-200" />
        </div>
      ) : (
        <>
          <HeaderSection
            onExportarPdf={() => exportar("pdf")}
            onExportarExcel={() => exportar("excel")}
            exportando={exportando}
          />
          <FilterBar
            clientes={clientesFiltro}
            tecnicos={tecnicos}
            tiposServicio={tiposServicio}
            filtros={filtros}
            onChange={aplicarFiltros}
          />
          <KpiGrid kpis={kpis} />
          <ChartsSection barData={barData} conversionData={conversionData} />
          <TecnicoSummaryTable tecnicoData={tecnicoData} />
          <HistoricalCertificatesTable certHistoricos={certHistoricos} onVerPdf={verPdf} />
          <ConsultaFacturas descargar={descargarFactura} />
        </>
      )}

      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-4xl h-dvh sm:h-[85vh] rounded-2xl bg-white shadow-xl border border-slate-100 flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <FileText size={16} /> {viewer.titulo}
              </div>
              <button
                onClick={() => setViewer(null)}
                className="text-slate-400 hover:text-slate-700 border-none bg-transparent cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-100">
              {verificando || !viewer.url ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  {verificando ? "Generando visor..." : "No se pudo cargar el documento."}
                </div>
              ) : (
                <iframe src={viewer.url} title={viewer.titulo} className="w-full h-full border-none" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 4. Exportación por defecto
export default MainRendererreport;
