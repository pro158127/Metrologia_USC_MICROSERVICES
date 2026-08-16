// 1. Imports
"use client";

import React, { useState, useMemo, useCallback } from "react";
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
import { Download, Search, FileText } from "lucide-react";
import { useDbTable, useDbLoading, useDbActions } from "@/app/componets/tables_recharge";
import type { BarChartData, ConversionData, TecnicoResumen, CertificadoHistorico, Kpi, AuditTraceabilityRow, AuditTraceabilityReportProps } from "@/tipos/reportes";

// Reusable Tailwind Style Maps (Sugerencia por alta repetibilidad de inputs/selects)
const inputBaseStyles =
  "px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-none focus:border-[#5680F9] focus:ring-1 focus:ring-[#5680F9] transition-all bg-white";

const formatearMoneda = (value: number) =>
  value.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Etiquetas de los últimos N meses (Ene, Feb, ...). */
const mesesUltimos = (n: number): string[] => {
  const labels: string[] = [];
  const ahora = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    labels.push(d.toLocaleDateString("es-CO", { month: "short" }).replace(".", ""));
  }
  return labels;
};

// 2. Declaración de Componentes Hijos (Extraídos)

const HeaderSection: React.FC = () => {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
        Reportes y Consolidados
      </h1>
      <div className="flex gap-2">
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-600 border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
          <Download size={14} /> Exportar PDF
        </button>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#5680F9] text-white text-xs font-semibold hover:bg-blue-600 transition-all cursor-pointer shadow-sm">
          <Download size={14} /> Exportar Excel
        </button>
      </div>
    </div>
  );
};

const FilterBar: React.FC<{
  clientes: string[];
  tecnicos: string[];
  tiposServicio: string[];
}> = ({ clientes, tecnicos, tiposServicio }) => {

 const [fechaInicio, setFechaInicio] = useState<string>(() => 
  new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]
);

const [fechaFin, setFechaFin] = useState<string>(() => 
  new Date().toISOString().split("T")[0]
);
  return (
    <div className="flex items-center gap-3 mb-6 p-4 rounded-[16px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] flex-wrap">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filtros:</span>
     <input
  type="date"
  value={fechaInicio}
  onChange={(e) => setFechaInicio(e.target.value)}
  className={inputBaseStyles}
/>
<input
  type="date"
  value={fechaFin}
  onChange={(e) => setFechaFin(e.target.value)}
  className={inputBaseStyles}
/>
      {[
        { label: "Tipo servicio", options: tiposServicio },
        { label: "Cliente", options: clientes },
        { label: "Técnico", options: tecnicos },
      ].map((f) => (
        <select key={f.label} className={`${inputBaseStyles} cursor-pointer`}>
          <option>{f.label} — Todos</option>
          {f.options.slice(0, 20).map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ))}
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
          Calibraciones por mes
        </div>
        <div className="text-xs text-slate-400 pl-4 mb-4">Externo vs imputado USC (apiladas)</div>
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
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
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

const HistoricalCertificatesTable: React.FC<{ certHistoricos: CertificadoHistorico[] }> = ({ certHistoricos }) => {
  return (
    <div className="rounded-[20px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-100">
        <span className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          Búsqueda de certificados históricos (RF-41)
        </span>
      </div>
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-4 bg-slate-50/30 border-b border-slate-100">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="N° certificado, NIT, nombre de instrumento..."
            className={`w-full pl-9 pr-4 ${inputBaseStyles}`}
          />
        </div>
        <div className="flex gap-2">
          <input type="date" className={inputBaseStyles} />
          <input type="date" className={inputBaseStyles} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/75 border-b border-slate-100">
              {["N° Certificado", "Cliente", "NIT", "Instrumento", "Fecha emisión", "Técnico", "Acciones"].map((h) => (
                <th key={h} className="text-left px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {certHistoricos.map((c) => (
              <tr key={c.cert} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-bold text-[#5680F9]">{c.cert}</td>
                <td className="px-6 py-4 text-sm font-semibold text-slate-700">{c.cliente}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{c.nit}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{c.instrumento}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{c.fecha}</td>
                <td className="px-6 py-4 text-sm text-slate-500 font-medium">{c.tecnico}</td>
                <td className="px-6 py-4">
                  <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-[#5680F9] hover:bg-blue-100 text-xs font-semibold transition-all border border-blue-100/50 cursor-pointer">
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

const AuditTraceabilityReport: React.FC<AuditTraceabilityReportProps> = ({
  facturaSearch,
  showTrazabilidad,
  onSearchChange,
  onGenerateReport,
  filas,
}) => {
  return (
    <div className="rounded-[20px] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] mb-6">
      <div className="text-sm font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3 mb-1">
        Reporte de trazabilidad para auditorías (RF-46)
      </div>
      <div className="text-xs text-slate-400 pl-4 mb-4">
        Genera el reporte a partir de un número de factura. Tiempo de generación: ≤5 segundos.
      </div>
      <div className="flex gap-3 mb-4 pl-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={facturaSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Número de factura (ej: FAC-2026-045)..."
            className={`w-full pl-9 pr-4 ${inputBaseStyles}`}
          />
        </div>
        <button
          onClick={onGenerateReport}
          className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#5680F9] text-white hover:bg-blue-600 font-semibold text-xs transition-all cursor-pointer shadow-sm"
        >
          Generar reporte auditoría
        </button>
      </div>

      {showTrazabilidad && (
        <div className="rounded-xl border border-slate-100 overflow-hidden mt-5 shadow-sm">
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900">
            <span className="text-xs font-bold text-white uppercase tracking-wider">
              Resultado: {facturaSearch}
            </span>
            <div className="flex gap-2">
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all cursor-pointer">
                <Download size={12} /> PDF (auditor)
              </button>
              <button className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#5680F9] hover:bg-blue-600 text-white text-xs font-semibold transition-all cursor-pointer">
                <Download size={12} /> Excel (análisis)
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-100">
                  {["Factura", "Cliente", "Fecha", "Valor", "OT asociadas", "Equipos", "N° Certificado"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#5680F9]">{t.factura}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-slate-700">{t.cliente}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500">{t.fecha}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-800 font-bold">{t.valor}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-[#5680F9]">{t.ots}</td>
                    <td className="px-5 py-3.5 text-sm text-slate-500 font-medium">{t.equipos}</td>
                    <td className="px-5 py-3.5 font-semibold text-sm">
                      {t.cert === "—" ? (
                        <span className="inline-flex px-2 py-0.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold">
                          ⚠️ Sin certificado
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold text-sm">{t.cert}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// 3. Componente Padre (`MainRenderer`)

export function MainRendererreport() {
  const cotizaciones = useDbTable("cotizaciones");
  const ordenesTrabajo = useDbTable("ordenes_trabajo");
  const certificados = useDbTable("certificados");
  const calibraciones = useDbTable("calibraciones");
  const facturas = useDbTable("facturas");
  const clientes = useDbTable("clientes");
  const tarifas = useDbTable("tarifas");
  const usuarios = useDbTable("usuarios");
  const { loadTable } = useDbActions();
  const loading = useDbLoading("certificados");

  const [facturaSearch, setFacturaSearch] = useState("");
  const [showTrazabilidad, setShowTrazabilidad] = useState(false);

  // Carga de tablas requeridas por el módulo
  const inicializar = useCallback(() => {
    loadTable("cotizaciones");
    loadTable("ordenes_trabajo");
    loadTable("facturas");
    loadTable("clientes");
    loadTable("tarifas");
    loadTable("usuarios");
    loadTable("certificados");
  }, [loadTable]);

  React.useEffect(() => {
    inicializar();
  }, [inicializar]);

  // ==========================================
  // DATOS DERIVADOS (useMemo)
  // ==========================================
  const meses = useMemo(() => mesesUltimos(6), []);

  const barData: BarChartData[] = useMemo(() => {
    return meses.map((mes) => {
      const index = meses.indexOf(mes);
      const fechaRef = new Date();
      const target = new Date(fechaRef.getFullYear(), fechaRef.getMonth() - (meses.length - 1 - index), 1);
      const delMes = (d: Date | string | null | undefined) => {
        if (!d) return false;
        const dt = new Date(d);
        return dt.getMonth() === target.getMonth() && dt.getFullYear() === target.getFullYear();
      };
      const delMesCount = ordenesTrabajo.filter((o) => delMes(o.createdAt));
      return {
        mes,
        externo: delMesCount.filter((o) => o.esInternoUSC === false || o.esInternoUSC == null).length,
        interno: delMesCount.filter((o) => o.esInternoUSC === true).length,
      };
    });
  }, [meses, ordenesTrabajo]);

  const conversionData: ConversionData[] = useMemo(() => {
    return meses.map((mes) => {
      const index = meses.indexOf(mes);
      const fechaRef = new Date();
      const target = new Date(fechaRef.getFullYear(), fechaRef.getMonth() - (meses.length - 1 - index), 1);
      const delMes = (d: Date) => d.getMonth() === target.getMonth() && d.getFullYear() === target.getFullYear();
      const emitidas = cotizaciones.filter((c) => delMes(new Date(c.createdAt))).length;
      const aprobadas = cotizaciones.filter(
        (c) => delMes(new Date(c.createdAt)) && c.estado === "APROBADA"
      ).length;
      return {
        mes,
        tasa: emitidas > 0 ? Math.round((aprobadas / emitidas) * 100) : 0,
      };
    });
  }, [meses, cotizaciones]);

  const tecnicoData: TecnicoResumen[] = useMemo(() => {
    const grupos = new Map<string, { ots: number; equipos: number; dias: number }>();
    ordenesTrabajo.forEach((o) => {
      const nombre = o.responsable || "Sin asignar";
      const grupo = grupos.get(nombre) || { ots: 0, equipos: 0, dias: 0 };
      grupo.ots += 1;
      grupo.equipos += o.instrumentos?.length ?? 0;
      if (o.createdAt && o.fechaCalibracion) {
        grupo.dias += Math.max(0, (new Date(o.fechaCalibracion).getTime() - new Date(o.createdAt).getTime()) / 86400000);
      }
      grupos.set(nombre, grupo);
    });
    return Array.from(grupos.entries()).map(([tecnico, g]) => ({
      tecnico,
      ots: g.ots,
      equipos: g.equipos,
      promedioDias: g.ots > 0 ? g.dias / g.ots : 0,
    }));
  }, [ordenesTrabajo]);

  const certHistoricos: CertificadoHistorico[] = useMemo(() => {
    return certificados.slice(0, 50).map((cert) => {
      const cal = calibraciones.find((c) => c.idCalibracion === cert.idCalibracion);
      const instrumento = cal
        ? (ordenesTrabajo.flatMap((o) => o.instrumentos ?? []).find((i) => i.idDetalle === cal.idInstrumento)?.instrumento ?? "—")
        : "—";
      const orden = cal
        ? ordenesTrabajo.find((o) => (o.instrumentos ?? []).some((i) => i.idDetalle === cal.idInstrumento))
        : undefined;
      const cliente = orden
        ? clientes.find((c) => c.idCliente === orden.idCliente)
        : undefined;
      return {
        cert: cert.codigo,
        cliente: cliente?.razonSocial ?? "—",
        nit: cliente?.nitCedula ?? "—",
        instrumento,
        fecha: new Date(cal?.createdAt ?? new Date()).toLocaleDateString("es-CO"),
        tecnico: orden?.responsable ?? "—",
      };
    });
  }, [certificados, calibraciones, ordenesTrabajo, clientes]);

  const kpis: Kpi[] = useMemo(() => {
    const emitidas = cotizaciones.length;
    const aprobadas = cotizaciones.filter((c) => c.estado === "APROBADA").length;
    const conversion = emitidas > 0 ? Math.round((aprobadas / emitidas) * 100) : 0;
    const ingresos = facturas.reduce((acc, f) => acc + Number(f.valor ?? 0), 0);
    const internos = ordenesTrabajo.filter((o) => o.esInternoUSC === true).length;
    return [
      { label: "Cotizaciones emitidas", val: String(emitidas), sub: "registradas en el sistema", color: "#5680F9", bg: "#EEF2FF", trend: "" },
      { label: "Tasa de conversión", val: `${conversion}%`, sub: "aprobadas sobre emitidas", color: "#22C55E", bg: "#F0FDF4", trend: "" },
      { label: "Ingresos facturados", val: formatearMoneda(ingresos), sub: "total facturado registrado", color: "#9A8CF3", bg: "#F5F3FF", trend: "" },
      { label: "Órdenes internas USC", val: String(internos), sub: "servicios internos imputados", color: "#F59C0B", bg: "#FFFBEB", trend: "" },
    ];
  }, [cotizaciones, facturas, ordenesTrabajo]);

  const tiposServicio = useMemo(() => {
    const set = new Set<string>();
    tarifas.forEach((t) => set.add(t.tipoServicio));
    return Array.from(set).filter(Boolean);
  }, [tarifas]);

  const tecnicos = useMemo(() => {
    const set = new Set<string>();
    ordenesTrabajo.forEach((o) => o.responsable && set.add(o.responsable));
    return Array.from(set);
  }, [ordenesTrabajo]);

  const clientesFiltro = useMemo(() => clientes.map((c) => c.razonSocial), [clientes]);

  const filasAuditoria: AuditTraceabilityRow[] = useMemo(() => {
    return facturas
      .filter((f) => f.numero.toLowerCase().includes(facturaSearch.toLowerCase()))
      .slice(0, 10)
      .map((f) => {
        const orden = ordenesTrabajo.find((o) => o.idOrdenTrabajo === f.idOrdenTrabajo);
        const cliente = f.cliente?.razonSocial ?? clientes.find((c) => c.idCliente === f.idCliente)?.razonSocial ?? "—";
        const cert = orden ? (certificados.find((c) => c.idCalibracion === orden.idOrdenTrabajo)?.codigo ?? "—") : "—";
        return {
          factura: f.numero,
          cliente,
          fecha: new Date(f.fecha).toLocaleDateString("es-CO"),
          valor: formatearMoneda(Number(f.valor ?? 0)),
          ots: orden?.codigo ?? "—",
          equipos: orden?.instrumentos?.length ?? 0,
          cert,
        };
      });
  }, [facturas, ordenesTrabajo, clientes, certificados, facturaSearch]);

  const handleGenerateReport = useCallback(() => {
    if (facturaSearch) {
      setShowTrazabilidad(true);
    }
  }, [facturaSearch]);

  return (
    <div className="module-page text-slate-900">
      <HeaderSection />
      <FilterBar clientes={clientesFiltro} tecnicos={tecnicos} tiposServicio={tiposServicio} />
      <KpiGrid kpis={kpis} />
      <ChartsSection barData={barData} conversionData={conversionData} />
      <TecnicoSummaryTable tecnicoData={tecnicoData} />
      <HistoricalCertificatesTable certHistoricos={certHistoricos} />
      <AuditTraceabilityReport
        facturaSearch={facturaSearch}
        showTrazabilidad={showTrazabilidad}
        onSearchChange={setFacturaSearch}
        onGenerateReport={handleGenerateReport}
        filas={filasAuditoria}
      />
    </div>
  );
}

// 4. Exportación por defecto
export default MainRendererreport;
