// 1. Imports
import React, { useState } from "react";
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

// Constantes de datos
const barData = [
  { mes: "Ene", externo: 28, interno: 14 },
  { mes: "Feb", externo: 38, interno: 18 },
  { mes: "Mar", externo: 22, interno: 16 },
  { mes: "Abr", externo: 45, interno: 20 },
  { mes: "May", externo: 51, interno: 20 },
  { mes: "Jun", externo: 40, interno: 18 },
];

const conversionData = [
  { mes: "Ene", tasa: 74 },
  { mes: "Feb", tasa: 86 },
  { mes: "Mar", tasa: 76 },
  { mes: "Abr", tasa: 85 },
  { mes: "May", tasa: 87 },
  { mes: "Jun", tasa: 81 },
];

const tecnicoData = [
  { tecnico: "J. Martínez", ots: 32, equipos: 87, promedioDias: 3.2 },
  { tecnico: "M. Torres", ots: 25, equipos: 68, promedioDias: 4.1 },
  { tecnico: "P. Ríos", ots: 18, equipos: 49, promedioDias: 3.8 },
];

const certHistoricos = [
  { cert: "CERT-2026-087", cliente: "Clínica del Sur IPS", nit: "800.456.789-2", instrumento: "Termómetro digital", fecha: "10/05/2026", tecnico: "M. Torres" },
  { cert: "CERT-2026-071", cliente: "USC Ingeniería", nit: "891.100.022-5", instrumento: "Balanza OHAUS", fecha: "25/04/2026", tecnico: "J. Martínez" },
  { cert: "CERT-2026-058", cliente: "Empresa ABC S.A.S", nit: "900.123.456-1", instrumento: "Manómetro Wika", fecha: "12/04/2026", tecnico: "P. Ríos" },
];

const kpis = [
  { label: "Cotizaciones emitidas", val: "330", sub: "últimos 6 meses", color: "#5680F9", bg: "#EEF2FF", trend: "+18%" },
  { label: "Tasa de conversión", val: "82%", sub: "promedio semestral", color: "#22C55E", bg: "#F0FDF4", trend: "+5pp" },
  { label: "Ingresos externos", val: "$14.28M", sub: "facturados junio 2026", color: "#9A8CF3", bg: "#F5F3FF", trend: "+12%" },
  { label: "Imputados USC", val: "$3.84M", sub: "servicios internos", color: "#F59C0B", bg: "#FFFBEB", trend: "+8%" },
];

// Reusable Tailwind Style Maps (Sugerencia por alta repetibilidad de inputs/selects)
const inputBaseStyles =
  "px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 outline-none focus:border-[#5680F9] focus:ring-1 focus:ring-[#5680F9] transition-all bg-white";

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

const FilterBar: React.FC = () => {
  return (
    <div className="flex items-center gap-3 mb-6 p-4 rounded-[16px] border border-slate-100 bg-white shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)] flex-wrap">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Filtros:</span>
      <input type="date" defaultValue="2026-01-01" className={inputBaseStyles} />
      <input type="date" defaultValue="2026-06-09" className={inputBaseStyles} />
      {["Tipo servicio", "Cliente", "Técnico"].map((f) => (
        <select key={f} className={`${inputBaseStyles} cursor-pointer`}>
          <option>{f} — Todos</option>
          {f === "Tipo servicio" && (
            <>
              <option>Acreditado</option>
              <option>No acreditado</option>
            </>
          )}
          {f === "Técnico" && (
            <>
              <option>J. Martínez</option>
              <option>M. Torres</option>
              <option>P. Ríos</option>
            </>
          )}
        </select>
      ))}
    </div>
  );
};

const KpiGrid: React.FC = () => {
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
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border"
              style={{ background: k.bg, color: k.color, borderColor: k.bg + "80" }}
            >
              {k.trend}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const ChartsSection: React.FC = () => {
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
            <YAxis tick={{ fill: "#94A3B8", fontSize 11 }} axisLine={false} tickLine={false} />
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
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} unit="%" domain={[60, 100]} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 12, color: "#fff", fontSize: 11 }} formatter={(v: any) => [`${v}%`]} />
            <Line type="monotone" dataKey="tasa" stroke="#22C55E" strokeWidth={2.5} dot={{ fill: "#22C55E", r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const TecnicoSummaryTable: React.FC = () => {
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
                    {t.promedioDias} días
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

const HistoricalCertificatesTable: React.FC = () => {
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

interface AuditTraceabilityReportProps {
  facturaSearch: string;
  showTrazabilidad: boolean;
  onSearchChange: (value: string) => void;
  onGenerateReport: () => void;
}

const AuditTraceabilityReport: React.FC<AuditTraceabilityReportProps> = ({
  facturaSearch,
  showTrazabilidad,
  onSearchChange,
  onGenerateReport,
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
                {[
                  { factura: facturaSearch, cliente: "Empresa ABC S.A.S", fecha: "01/06/2026", valor: "$2.850.000", ots: "OT-2026-089", equipos: 3, cert: "CERT-2026-089" },
                  { factura: facturaSearch, cliente: "Empresa ABC S.A.S", fecha: "01/06/2026", valor: "—", ots: "OT-2026-088", equipos: 2, cert: "—" },
                ].map((t, i) => (
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
  const [facturaSearch, setFacturaSearch] = useState("");
  const [showTrazabilidad, setShowTrazabilidad] = useState(false);

  const handleGenerateReport = () => {
    if (facturaSearch) {
      setShowTrazabilidad(true);
    }
  };

  return (
    <div className="module-page text-slate-900">
      <HeaderSection />
      <FilterBar />
      <KpiGrid />
      <ChartsSection />
      <TecnicoSummaryTable />
      <HistoricalCertificatesTable />
      <AuditTraceabilityReport
        facturaSearch={facturaSearch}
        showTrazabilidad={showTrazabilidad}
        onSearchChange={setFacturaSearch}
        onGenerateReport={handleGenerateReport}
      />
    </div>
  );
}

// 4. Exportación por defecto
export default MainRendererreport;