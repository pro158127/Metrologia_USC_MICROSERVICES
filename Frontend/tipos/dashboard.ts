// ============================================================
// dashboard.ts
// Tipos del Panel de Control (KPIs, gráficos, alertas y props).
// ============================================================

import type { ReactNode } from 'react';
import type { ModuleKey } from '@/app/dashboard/components/sidebar';

export interface KpiData {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  trend: string;
  up: boolean;
  color: string;
  bg: string;
}

export interface BarChartPoint {
  mes: string;
  emitidas: number;
  aprobadas: number;
}

export interface PieSlice {
  name: string;
  value: number;
  color: string;
}

export interface PendingCertRow {
  ot: string;
  cliente: string;
  tecnico: string;
  tipo: string;
  fecha: string;
}

export interface AlertItem {
  type: "warning" | "error";
  icon: ReactNode;
  text: string;
  bg: string;
  border: string;
  color: string;
}

export interface SystemStat {
  label: string;
  value: string;
}

export interface RecentActivityItem {
  text: string;
  time: string;
}

export interface DashboardProps {
  onNavigate: (module: ModuleKey) => void;
}

export interface PendingCertsTableProps {
  onNavigate: (module: ModuleKey) => void;
  pendingCerts: PendingCertRow[];
  pendingCount: number;
}

export interface WelcomeHeaderSectionProps {
  systemStats: SystemStat[];
}

export interface KpiGridSectionProps {
  kpiData: KpiData[];
}

export interface SystemAlertsSectionProps {
  alerts: AlertItem[];
  recentActivity: RecentActivityItem[];
}

export interface QuotesBarChartSectionProps {
  barData: BarChartPoint[];
}

export interface ServiceDistributionPieChartSectionProps {
  pieData: PieSlice[];
}
