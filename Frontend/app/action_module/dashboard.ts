"use server";
import { auth } from '@/app/Login/types/auth';
import { fastifyRequest } from '@/app/lib/api/fastifyClient';
import type { CotizacionModel, OrdenTrabajoModel, CertificadoModel, FacturaModel, ClienteModel } from '@/tipos/entidades';
import type { CertificadoRevisionItem } from './certificados';
export interface DashboardSnapshot {
  generatedAt: string;
  cotizaciones: CotizacionModel[];
  ordenes: OrdenTrabajoModel[];
  certificados: CertificadoModel[];
  facturas: FacturaModel[];
  clientes: ClienteModel[];
  metricas: { estado: string; emitidaAt: string | null; aprobadaAt: string | null }[];
  bandeja: CertificadoRevisionItem[];
}
export async function obtenerDashboardSnapshot(): Promise<DashboardSnapshot> {
  return fastifyRequest(await auth(), '/api/v1/dashboard/snapshot');
}
