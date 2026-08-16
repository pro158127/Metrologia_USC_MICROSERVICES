// ============================================================
// reportes.ts
// Tipos de los datos agregados del módulo de Reportes y Consolidados.
// ============================================================

export interface BarChartData {
  mes: string;
  externo: number;
  interno: number;
}

export interface ConversionData {
  mes: string;
  tasa: number;
}

export interface TecnicoResumen {
  tecnico: string;
  ots: number;
  equipos: number;
  promedioDias: number;
}

export interface CertificadoHistorico {
  cert: string;
  cliente: string;
  nit: string;
  instrumento: string;
  fecha: string;
  tecnico: string;
}

export interface Kpi {
  label: string;
  val: string;
  sub: string;
  color: string;
  bg: string;
  trend: string;
}

export interface AuditTraceabilityRow {
  factura: string;
  cliente: string;
  fecha: string;
  valor: string;
  ots: string;
  equipos: number;
  cert: string;
}

export interface AuditTraceabilityReportProps {
  facturaSearch: string;
  showTrazabilidad: boolean;
  onSearchChange: (value: string) => void;
  onGenerateReport: () => void;
  filas: AuditTraceabilityRow[];
}
