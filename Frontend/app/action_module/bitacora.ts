'use server';

import { auth } from '@/app/Login/types/auth';
import { fastifyRequest, FastifyHttpError } from '@/app/lib/api/fastifyClient';

export interface BitacoraItem {
  id: number;
  action: string;
  tableName: string;
  recordId: string;
  userId: number | null;
  createdAt: string;
  details: unknown;
  ip: string;
  usuario: { idUsuario: number; nombreCompleto: string; rol: string | null } | null;
}

export interface RespuestaBitacora {
  ok: boolean;
  data: BitacoraItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface BitacoraFiltros {
  tableName?: string;
  recordId?: string;
  action?: string;
  userId?: number;
  page?: number;
  limit?: number;
}

export async function obtenerBitacora(filtros: BitacoraFiltros = {}): Promise<RespuestaBitacora | null> {
  try {
    const session = await auth();
    const query = new URLSearchParams();
    if (filtros.tableName) query.set('tableName', filtros.tableName);
    if (filtros.recordId) query.set('recordId', filtros.recordId);
    if (filtros.action) query.set('action', filtros.action);
    if (filtros.userId) query.set('userId', String(filtros.userId));
    if (filtros.page) query.set('page', String(filtros.page));
    if (filtros.limit) query.set('limit', String(filtros.limit));
    const qs = query.toString();

    const res = await fastifyRequest<RespuestaBitacora>(
      session,
      `/api/v1/audit${qs ? `?${qs}` : ''}`
    );
    return res;
  } catch (error) {
    console.error('Error en obtenerBitacora:', error);
    if (error instanceof FastifyHttpError) return null;
    return null;
  }
}
