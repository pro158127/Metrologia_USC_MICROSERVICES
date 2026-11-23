'use server';

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest } from "@/app/lib/api/fastifyClient";

export interface FiltrosReporte {
  fechaInicio?: string;
  fechaFin?: string;
  tipoServicio?: string;
  cliente?: string;
  tecnico?: string;
}

export interface CertificadoReporte {
  codigo: string;
  instrumento: string;
  estampilla: string | null;
  cliente: string;
  nit: string;
  tecnico: string;
  ot: string;
  fecha: string | null;
  rutaUrl: string | null;
  tipoServicio: string | null;
}

export interface TecnicoReporte {
  tecnico: string;
  ots: number;
  equipos: number;
  promedioDias: number;
}

export interface TrazabilidadReporte {
  factura: string;
  cliente: string;
  fecha: string | null;
  valor: number;
  ots: string;
  equipos: number;
  cert: string | null;
}

export interface DatosReporte {
  series: { mes: string; interno: number; externo: number; tasa: number }[];
  kpis: {
    cotizacionesEmitidas: number;
    tasaConversion: number;
    ingresos: number;
    ordenesInternas: number;
  };
  certificados: CertificadoReporte[];
  tecnicos: TecnicoReporte[];
  trazabilidad: TrazabilidadReporte[];
}

export async function obtenerReportes(filtros: FiltrosReporte = {}): Promise<DatosReporte | null> {
  try {
    const session = await auth();
    const qs = new URLSearchParams();
    if (filtros.fechaInicio) qs.set("fechaInicio", filtros.fechaInicio);
    if (filtros.fechaFin) qs.set("fechaFin", filtros.fechaFin);
    if (filtros.tipoServicio) qs.set("tipoServicio", filtros.tipoServicio);
    if (filtros.cliente) qs.set("cliente", filtros.cliente);
    if (filtros.tecnico) qs.set("tecnico", filtros.tecnico);
    const query = qs.toString();
    const res = await fastifyRequest<{ ok: boolean; data: DatosReporte }>(
      session,
      `/api/v1/reportes${query ? `?${query}` : ""}`
    );
    return res.data ?? null;
  } catch (error) {
    console.error("Error obteniendo reportes:", error);
    return null;
  }
}

async function exportarReporte(
  formato: "pdf" | "excel",
  filtros: FiltrosReporte
): Promise<{ jobId: string | null; error: string | null }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: { jobId: string } }>(
      session,
      `/api/v1/reportes/exportar-${formato}`,
      { method: "POST", body: filtros }
    );
    return { jobId: res.data?.jobId ?? null, error: null };
  } catch (error) {
    console.error(`Error exportando reporte ${formato}:`, error);
    return { jobId: null, error: error instanceof Error ? error.message : "Error desconocido" };
  }
}

export async function exportarReportePdf(
  filtros: FiltrosReporte = {}
): Promise<{ jobId: string | null; error: string | null }> {
  return exportarReporte("pdf", filtros);
}

export async function exportarReporteExcel(
  filtros: FiltrosReporte = {}
): Promise<{ jobId: string | null; error: string | null }> {
  return exportarReporte("excel", filtros);
}

export interface EstadoJobReporte {
  status: string;
  url: string | null;
  archivos?: { pdf: string | null; excel: string | null };
  resumen?: {
    factura: string; cliente: string; fecha: string | null; valor: number;
    ots: string; equipos: number; cert: string | null;
  };
  error: string | null;
}

export async function encolarReporteAuditoriaFactura(numeroFactura: string): Promise<{ jobId: string | null; error: string | null }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: { jobId: string } }>(
      session,
      '/api/v1/reportes/trazabilidad-factura',
      { method: 'POST', body: { numeroFactura } },
    );
    return { jobId: res.data?.jobId ?? null, error: null };
  } catch (error) {
    return { jobId: null, error: error instanceof Error ? error.message : 'No se pudo generar el reporte de auditoría.' };
  }
}

export async function consultarEstadoJobReporte(jobId: string): Promise<EstadoJobReporte | null> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ ok: boolean; data: EstadoJobReporte }>(
      session,
      `/api/v1/reportes/job/${jobId}`
    );
    return res.data ?? null;
  } catch (error) {
    console.error("Error consultando job de reporte:", error);
    return null;
  }
}
