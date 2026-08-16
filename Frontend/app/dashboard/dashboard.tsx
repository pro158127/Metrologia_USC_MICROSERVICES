"use client";

// 1. Imports
import React, { useEffect, useMemo } from "react";
import {
  Wrench,
  FileText,
  DollarSign,
  Award,
  AlertTriangle,
  Lock,
  Clock,
  ExternalLink,
  Activity,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type {
  DashboardProps,
  PendingCertsTableProps,
  WelcomeHeaderSectionProps,
  KpiGridSectionProps,
  SystemAlertsSectionProps,
  QuotesBarChartSectionProps,
  ServiceDistributionPieChartSectionProps,
  KpiData,
  BarChartPoint,
  PieSlice,
  PendingCertRow,
  AlertItem,
  SystemStat,
  RecentActivityItem,
} from "@/tipos/dashboard";
import { useDbTable, useDbActions } from "@/app/componets/tables_recharge";

// ========== UTILIDADES DE FORMATO ==========
const formatMoneda = (val: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

const porcentaje = (parte: number, total: number) =>
  total > 0 ? `${Math.round((parte / total) * 100)}%` : "0%";

const formatFechaCorta = (fecha: string | Date | null) => {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatHora = (fecha: string | Date | null) => {
  if (!fecha) return "";
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  return d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
};

// Reusable Tailwind Style Maps (> 3 repeticiones)
const cardContainerStyle =
  "rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]";

// 2. Declaración de Componentes Hijos (Extraídos)

const WelcomeHeaderSection: React.FC<WelcomeHeaderSectionProps> = ({ systemStats }) => {
  return (
    <div className={`mb-6 ${cardContainerStyle}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 border-l-[3.5px] border-[#5680F9] pl-3">
            PANEL DE CONTROL
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 pl-4">
            Bienvenido, Luis Burgos.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {systemStats.map((stat) => (
            <div key={stat.label} className="rounded-xl bg-slate-50 border border-slate-100/80 px-4 py-2.5 min-w-[100px]">
              <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</p>
              <p className="mt-1 text-lg font-bold text-slate-800">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const KpiGridSection: React.FC<KpiGridSectionProps> = ({ kpiData }) => {
  return (
    <div className="grid gap-4 xl:grid-cols-4 xl:gap-6 mb-6">
      {kpiData.map((kpi, index) => (
        <div key={index} className={`${cardContainerStyle} transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-8px_rgba(15,23,42,0.08)]`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50/80 text-[#5680F9]">
              {kpi.icon}
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${kpi.up ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"}`}>
              {kpi.trend}
            </span>
          </div>
          <div className="mt-4 text-2xl font-bold text-slate-800 tracking-tight">{kpi.value}</div>
          <div className="mt-1 text-xs font-bold text-slate-400 uppercase tracking-wider">{kpi.label}</div>
          <div className="mt-0.5 text-[10px] text-slate-400 font-medium italic">{kpi.sub}</div>
        </div>
      ))}
    </div>
  );
};

const PendingCertificatesSection: React.FC<PendingCertsTableProps> = ({ onNavigate, pendingCerts, pendingCount }) => {
  return (
    <section className={cardContainerStyle}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
            Certificados pendientes de revisión
          </h2>
          <p className="mt-1 text-xs text-slate-400 pl-4">Resumen de las órdenes con prioridad alta y próximas entregas.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700">
          <span className="inline-flex h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          {pendingCount} pendientes
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/30">
        <table className="min-w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            <tr>
              {['N° OT', 'Cliente', 'Técnico', 'Tipo', 'Fecha', 'Acción'].map((heading) => (
                <th key={heading} className="px-4 py-3.5 font-bold">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pendingCerts.map((row, index) => (
              <tr key={index} className="transition-colors hover:bg-slate-50/50">
                <td className="px-4 py-3.5 font-semibold text-slate-700">{row.ot}</td>
                <td className="px-4 py-3.5 text-slate-600 font-medium">{row.cliente}</td>
                <td className="px-4 py-3.5 text-slate-500">{row.tecnico}</td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${row.tipo === "Acreditado" ? "bg-blue-50 text-blue-700 border border-blue-100/50" : "bg-violet-50 text-violet-700 border border-violet-100/50"}`}>
                    {row.tipo}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-400 font-mono">{row.fecha}</td>
                <td className="px-4 py-3.5">
                  <button
                    onClick={() => onNavigate("revision")}
                    className="rounded-lg bg-[#5680F9] px-3 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#4069E2] cursor-pointer"
                  >
                    Revisar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => onNavigate("revision")}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5680F9] transition hover:text-[#4069E2] cursor-pointer"
        >
          Ver todos los pendientes <ExternalLink size={12} />
        </button>
      </div>
    </section>
  );
};

const SystemAlertsSection: React.FC<SystemAlertsSectionProps> = ({ alerts, recentActivity }) => {
  return (
    <section className={cardContainerStyle}>
      <h2 className="text-base font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
        Alertas del sistema
      </h2>
      <div className="mt-5 space-y-3">
        {alerts.map((alert, index) => (
          <div key={index} className="rounded-xl border p-3.5 transition-colors" style={{ background: alert.bg, borderColor: alert.border }}>
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5" style={{ color: alert.color }}>{alert.icon}</span>
              <p className="text-xs font-semibold leading-relaxed" style={{ color: alert.color }}>{alert.text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
        <div className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">Actividad reciente</div>
        <div className="space-y-2.5 text-xs text-slate-500">
          {recentActivity.map((item, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 text-slate-600 font-medium">
                <Activity size={12} className="text-[#5680F9]" />
                {item.text}
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{item.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const QuotesBarChartSection: React.FC<QuotesBarChartSectionProps> = ({ barData }) => {
  return (
    <section className={cardContainerStyle}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
            Cotizaciones emitidas vs aprobadas
          </h2>
          <p className="mt-1 text-xs text-slate-400 pl-4">Últimos 6 meses</p>
        </div>
      </div>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} barGap={8}>
            <XAxis dataKey="mes" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "#ffffff", fontSize: 11 }}
              cursor={{ fill: "rgba(86,128,249,0.04)" }}
            />
            <Bar dataKey="emitidas" name="Emitidas" fill="#5680F9" radius={[8, 8, 0, 0]} />
            <Bar dataKey="aprobadas" name="Aprobadas" fill="#C7D2FE" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex gap-4 text-xs font-bold text-slate-500 pl-4">
        <div className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#5680F9]" />
          Emitidas
        </div>
        <div className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#C7D2FE]" />
          Aprobadas
        </div>
      </div>
    </section>
  );
};

const ServiceDistributionPieChartSection: React.FC<ServiceDistributionPieChartSectionProps> = ({ pieData }) => {
  return (
    <section className={cardContainerStyle}>
      <div>
        <h2 className="text-base font-bold text-slate-800 border-l-[3.5px] border-[#5680F9] pl-3">
          Distribución de servicios
        </h2>
      </div>
      <div className="mt-6 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={82} dataKey="value" stroke="none">
              {pieData.map((entry, index) => (
                <Cell key={index} fill={entry.color === "#6366F1" ? "#5680F9" : entry.color === "#8B5CF6" ? "#818CF8" : "#C7D2FE"} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "#ffffff", fontSize: 11 }} formatter={(val) => [`${val}%`]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 space-y-2">
        {pieData.map((d, index) => {
          const themeColor = d.color === "#6366F1" ? "#5680F9" : d.color === "#8B5CF6" ? "#818CF8" : "#C7D2FE";
          return (
            <div key={index} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-3 w-3 rounded-full" style={{ background: themeColor }} />
                <span className="text-xs font-medium text-slate-600">{d.name}</span>
              </div>
              <span className="text-xs font-bold text-slate-850">{d.value}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

const FooterSection: React.FC = () => {
  return (
    <div className="mt-8 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
      ISO/IEC 17025 · Laboratorio de Metrología USC
    </div>
  );
};

// 3. Declaración del Componente Padre (`MainRenderer` / `Dashboard`)

export function Dashboard({ onNavigate }: DashboardProps) {
  const cotizaciones = useDbTable("cotizaciones");
  const ordenes = useDbTable("ordenes_trabajo");
  const certificados = useDbTable("certificados");
  const facturas = useDbTable("facturas");
  const clientes = useDbTable("clientes");
  const { loadTable } = useDbActions();

  useEffect(() => {
    loadTable("cotizaciones");
    loadTable("ordenes_trabajo");
    loadTable("certificados");
    loadTable("facturas");
    loadTable("clientes");
  }, [loadTable]);

  const ordenesActivas = useMemo(
    () => ordenes.filter((o) => o.estado !== "Certificado_enviado").length,
    [ordenes]
  );

  const cotizacionesPendientes = useMemo(
    () =>
      cotizaciones.filter((c) => c.estado === "BORRADOR" || c.estado === "ENVIADA").length,
    [cotizaciones]
  );

  const facturasMes = useMemo(() => {
    const now = new Date();
    return facturas.filter((f) => {
      const d = new Date(f.fecha);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [facturas]);

  const ingresosMes = useMemo(
    () => facturasMes.reduce((acc, f) => acc + Number(f.valor ?? 0), 0),
    [facturasMes]
  );

  const kpiData = useMemo<KpiData[]>(() => {
    const mesActual = new Date().toLocaleString("es-CO", { month: "long" });
    return [
      {
        icon: <Wrench size={22} className="text-slate-900" />,
        label: "OT Activas",
        value: String(ordenesActivas),
        sub: `de ${ordenes.length} OTs totales`,
        trend: porcentaje(ordenesActivas, ordenes.length),
        up: true,
        color: "#6366F1",
        bg: "#EEF2FF",
      },
      {
        icon: <FileText size={22} className="text-slate-900" />,
        label: "Cotizaciones pendientes",
        value: String(cotizacionesPendientes),
        sub: `de ${cotizaciones.length} cotizaciones`,
        trend: porcentaje(cotizacionesPendientes, cotizaciones.length),
        up: false,
        color: "#F59E0B",
        bg: "#FFFBEB",
      },
      {
        icon: <DollarSign size={22} className="text-slate-900" />,
        label: "Ingresos del mes",
        value: formatMoneda(ingresosMes),
        sub: `${facturasMes.length} facturas en ${mesActual}`,
        trend: porcentaje(facturasMes.length, facturas.length),
        up: true,
        color: "#16A34A",
        bg: "#ECFDF5",
      },
      {
        icon: <Award size={22} className="text-slate-900" />,
        label: "Certificados emitidos",
        value: String(certificados.length),
        sub: "emitidos en total",
        trend: porcentaje(certificados.length, certificados.length),
        up: true,
        color: "#8B5CF6",
        bg: "#F5F3FF",
      },
    ];
  }, [ordenesActivas, ordenes, cotizacionesPendientes, cotizaciones, ingresosMes, facturasMes, facturas, certificados]);

  const barData = useMemo<BarChartPoint[]>(() => {
    const now = new Date();
    const points: BarChartPoint[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mes = d.toLocaleString("es-CO", { month: "short" });
      const emitidas = cotizaciones.filter((c) => {
        const cd = new Date(c.createdAt);
        return cd.getMonth() === d.getMonth() && cd.getFullYear() === d.getFullYear();
      }).length;
      const aprobadas = cotizaciones.filter((c) => {
        const cd = new Date(c.createdAt);
        return (
          cd.getMonth() === d.getMonth() &&
          cd.getFullYear() === d.getFullYear() &&
          c.estado === "APROBADA"
        );
      }).length;
      points.push({ mes, emitidas, aprobadas });
    }
    return points;
  }, [cotizaciones]);

  const pieData = useMemo<PieSlice[]>(() => {
    const estados = ordenes.reduce<Record<string, number>>((acc, o) => {
      const key = o.estado ?? "Sin estado";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const colors = ["#6366F1", "#8B5CF6", "#A5B4FC", "#22C55E", "#F59E0B", "#F87171", "#94A3B8"];
    return Object.entries(estados).map(([name, value], index) => ({
      name,
      value,
      color: colors[index % colors.length],
    }));
  }, [ordenes]);

  const pendingCerts = useMemo<PendingCertRow[]>(() => {
    return ordenes
      .filter((o) => o.estadoRevision === "PENDIENTE_REVISION")
      .slice(0, 4)
      .map((o) => ({
        ot: o.codigo,
        cliente: o.cliente?.razonSocial  ?? "",
        tecnico: o.responsable ?? "",
        tipo: o.estado ?? "",
        fecha: formatFechaCorta(o.createdAt),
      }));
  }, [ordenes]);

  const alerts = useMemo<AlertItem[]>(() => {
    const otsSinResponsable = ordenes.filter((o) => !o.responsable).length;
    const otsConRetraso = ordenes.filter((o) => {
      if (!o.fechaLimiteFacturacion) return false;
      return new Date(o.fechaLimiteFacturacion) < new Date();
    }).length;
    const pendientes = ordenes.filter((o) => o.estadoRevision === "PENDIENTE_REVISION").length;
    const items: AlertItem[] = [];
    if (otsConRetraso > 0) {
      items.push({
        type: "warning",
        icon: <AlertTriangle size={14} />,
        text: `${otsConRetraso} OT con fecha límite de facturación vencida`,
        bg: "#FEF3C7",
        border: "#FDE68A",
        color: "#B45309",
      });
    }
    if (otsSinResponsable > 0) {
      items.push({
        type: "warning",
        icon: <Clock size={14} />,
        text: `${otsSinResponsable} OT sin responsable asignado`,
        bg: "#FFFBEB",
        border: "#FDE68A",
        color: "#92400E",
      });
    }
    if (pendientes > 0) {
      items.push({
        type: "error",
        icon: <Lock size={14} />,
        text: `${pendientes} certificados pendientes de revisión`,
        bg: "#FEE2E2",
        border: "#FECACA",
        color: "#BE123C",
      });
    }
    return items;
  }, [ordenes]);

  const systemStats = useMemo<SystemStat[]>(() => {
    return [
      { label: "Clientes", value: String(clientes.length) },
      { label: "Cotizaciones", value: String(cotizaciones.length) },
      { label: "OT activas", value: String(ordenesActivas) },
      { label: "Facturas", value: String(facturas.length) },
    ];
  }, [clientes, cotizaciones, ordenesActivas, facturas]);

  const recentActivity = useMemo<RecentActivityItem[]>(() => {
    const actividades: RecentActivityItem[] = [];
    const ultimaCotizacion = cotizaciones[0];
    const ultimaOt = ordenes[0];
    const ultimaFactura = facturas[0];
    if (ultimaCotizacion) {
      actividades.push({
        text: `Cotización ${ultimaCotizacion.codigo} en estado ${ultimaCotizacion.estado}`,
        time: formatHora(ultimaCotizacion.createdAt),
      });
    }
    if (ultimaOt) {
      actividades.push({
        text: `OT ${ultimaOt.codigo} en estado ${ultimaOt.estado ?? ""}`,
        time: formatHora(ultimaOt.createdAt),
      });
    }
    if (ultimaFactura) {
      actividades.push({
        text: `Factura ${ultimaFactura.numero} emitida`,
        time: formatHora(ultimaFactura.fecha),
      });
    }
    return actividades;
  }, [cotizaciones, ordenes, facturas]);

  return (
    <div className="p-8 overflow-y-auto h-full bg-[#F8FAFC] text-slate-900">
      <WelcomeHeaderSection systemStats={systemStats} />
      <KpiGridSection kpiData={kpiData} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] xl:grid-cols-[2fr_1fr] mb-6">
        <PendingCertificatesSection onNavigate={onNavigate} pendingCerts={pendingCerts} pendingCount={pendingCerts.length} />
        <SystemAlertsSection alerts={alerts} recentActivity={recentActivity} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] mb-6">
        <QuotesBarChartSection barData={barData} />
        <ServiceDistributionPieChartSection pieData={pieData} />
      </div>
      <FooterSection />
    </div>
  );
}

// 4. Exportación por defecto
export default Dashboard;
