// 1. Imports
import React from "react";
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

// Interfaces
interface DashboardProps {
  onNavigate: (module: any) => void;
}

interface PendingCertsTableProps {
  onNavigate: (module: any) => void;
}

// Constantes de datos
const kpiData = [
  {
    icon: <Wrench size={22} className="text-slate-900" />,
    label: "OT Activas",
    value: "23",
    sub: "esta semana",
    trend: "+3",
    up: true,
    color: "#6366F1",
    bg: "#EEF2FF",
  },
  {
    icon: <FileText size={22} className="text-slate-900" />,
    label: "Cotizaciones pendientes",
    value: "8",
    sub: "sin respuesta",
    trend: "+2",
    up: false,
    color: "#F59E0B",
    bg: "#FFFBEB",
  },
  {
    icon: <DollarSign size={22} className="text-slate-900" />,
    label: "Ingresos del mes",
    value: "$14.28M",
    sub: "vs mes anterior",
    trend: "+12%",
    up: true,
    color: "#16A34A",
    bg: "#ECFDF5",
  },
  {
    icon: <Award size={22} className="text-slate-900" />,
    label: "Certificados emitidos",
    value: "87",
    sub: "de 100-150 esperados",
    trend: "87%",
    up: true,
    color: "#8B5CF6",
    bg: "#F5F3FF",
  },
];

const barData = [
  { mes: "Ene", emitidas: 42, aprobadas: 31 },
  { mes: "Feb", emitidas: 56, aprobadas: 48 },
  { mes: "Mar", emitidas: 38, aprobadas: 29 },
  { mes: "Abr", emitidas: 65, aprobadas: 55 },
  { mes: "May", emitidas: 71, aprobadas: 62 },
  { mes: "Jun", emitidas: 58, aprobadas: 47 },
];

const pieData = [
  { name: "Acreditados", value: 68, color: "#6366F1" },
  { name: "No acreditados", value: 22, color: "#8B5CF6" },
  { name: "Internos USC", value: 10, color: "#A5B4FC" },
];

const pendingCerts = [
  { ot: "OT-2026-089", cliente: "Empresa ABC S.A.S", tecnico: "J. Martínez", tipo: "Acreditado", fecha: "Hoy 10:23" },
  { ot: "OT-2026-087", cliente: "Clínica del Sur", tecnico: "M. Torres", tipo: "No acreditado", fecha: "Hoy 09:15" },
  { ot: "OT-2026-085", cliente: "USC Ingeniería", tecnico: "J. Martínez", tipo: "Acreditado", fecha: "Ayer" },
  { ot: "OT-2026-083", cliente: "Metales del Valle", tecnico: "P. Ríos", tipo: "Acreditado", fecha: "Ayer" },
];

const alerts = [
  { type: "warning", icon: <AlertTriangle size={14} />, text: "3 OT con retraso mayor a 3 días", bg: "#FEF3C7", border: "#FDE68A", color: "#B45309" },
  { type: "error", icon: <Lock size={14} />, text: "1 cuenta bloqueada: secretaria@usc.edu.co", bg: "#FEE2E2", border: "#FECACA", color: "#BE123C" },
  { type: "warning", icon: <Clock size={14} />, text: "Plantilla de certificación vence en 15 días", bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" },
];

const systemStats = [
  { label: "Disponibilidad", value: "98.7%" },
  { label: "Cumplimiento", value: "91.2%" },
  { label: "SLA", value: "72h" },
  { label: "NPS", value: "84" },
];

const recentActivity = [
  { text: "Certificado OT-086 aprobado", time: "10:45 AM" },
  { text: "Cotización 26-0046A enviada", time: "09:30 AM" },
  { text: "Usuario técnico creado", time: "08:15 AM" },
];

// Reusable Tailwind Style Maps (> 3 repeticiones)
const cardContainerStyle =
  "rounded-[24px] border border-slate-100 bg-white p-6 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.04)]";

// 2. Declaración de Componentes Hijos (Extraídos)

const WelcomeHeaderSection: React.FC = () => {
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

const KpiGridSection: React.FC = () => {
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

const PendingCertificatesSection: React.FC<PendingCertsTableProps> = ({ onNavigate }) => {
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
          12 pendientes
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

const SystemAlertsSection: React.FC = () => {
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

const QuotesBarChartSection: React.FC = () => {
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

const ServiceDistributionPieChartSection: React.FC = () => {
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
            <Tooltip contentStyle={{ background: "#0f172a", border: "none", borderRadius: 12, color: "#ffffff", fontSize:11 }} formatter={(val: any) => [`${val}%`]} />
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
  return (
    <div className="p-8 overflow-y-auto h-full bg-[#F8FAFC] text-slate-900">
      <WelcomeHeaderSection />
      <KpiGridSection />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] xl:grid-cols-[2fr_1fr] mb-6">
        <PendingCertificatesSection onNavigate={onNavigate} />
        <SystemAlertsSection />
      </div>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] mb-6">
        <QuotesBarChartSection />
        <ServiceDistributionPieChartSection />
      </div>
      <FooterSection />
    </div>
  );
}

// 4. Exportación por defecto
export default Dashboard;