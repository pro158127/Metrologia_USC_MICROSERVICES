"use server";

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";

interface NotificacionDTO {
  idNotificacion: number;
  idUsuario: number;
  mensaje: string;
  modulo: string;
  visto: boolean;
  nivelPrioridad: string;
  createdAt: string | Date;
}

export async function getNotificacionesByUsuario(
  idUsuario: number,
  soloNoVistas = false
): Promise<{ success: boolean; data?: NotificacionDTO[]; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: NotificacionDTO[] }>(
      session,
      `/api/v1/notificaciones/${idUsuario}?noVistas=${soloNoVistas}`
    );
    return { success: true, data: res.data };
  } catch (error) {
    console.error("Error al obtener notificaciones:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "No se pudieron obtener las notificaciones." };
  }
}

export async function eliminarNotificacion(
  idNotificacion: number
): Promise<{ success: boolean; message?: string; data?: NotificacionDTO; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; message: string; data: NotificacionDTO }>(
      session,
      `/api/v1/notificaciones/${idNotificacion}`,
      { method: 'DELETE' }
    );
    return { success: true, message: res.message, data: res.data };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    console.error("Error al eliminar la notificación:", error);
    return { success: false, error: "No se pudo eliminar la notificación." };
  }
}

export async function eliminarTodasLasNotificaciones(
  idUsuario: number
): Promise<{ success: boolean; message?: string; count?: number; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; message: string; count: number }>(
      session,
      `/api/v1/notificaciones/usuario/${idUsuario}`,
      { method: 'DELETE' }
    );
    return { success: true, message: res.message, count: res.count };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    console.error("Error al vaciar las notificaciones:", error);
    return { success: false, error: "No se pudieron eliminar las notificaciones." };
  }
}

export async function marcarNotificacionComoLeida(
  idNotificacion: number
): Promise<{ success: boolean; message?: string; data?: NotificacionDTO; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; message: string; data: NotificacionDTO }>(
      session,
      `/api/v1/notificaciones/${idNotificacion}/leida`,
      { method: 'PATCH' }
    );
    return { success: true, message: res.message, data: res.data };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    console.error("Error al actualizar notificación:", error);
    return { success: false, error: "No se pudo actualizar la notificación." };
  }
}

export async function marcarTodasComoLeidas(
  idUsuario: number
): Promise<{ success: boolean; message?: string; count?: number; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; message: string; count: number }>(
      session,
      `/api/v1/notificaciones/usuario/${idUsuario}/leidas`,
      { method: 'PATCH' }
    );
    return { success: true, message: res.message, count: res.count };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    console.error("Error al actualizar todas las notificaciones:", error);
    return { success: false, error: "No se pudieron actualizar las notificaciones." };
  }
}

export async function getHistorialCompletoNotificaciones(
  idUsuario: number
): Promise<{ success: boolean; data?: NotificacionDTO[]; error?: string }> {
  try {
    if (!idUsuario || isNaN(idUsuario) || idUsuario <= 0) {
      return { success: true, data: [] };
    }
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: NotificacionDTO[] }>(
      session,
      `/api/v1/notificaciones/${idUsuario}/historial`
    );
    return { success: true, data: res.data };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    console.error("Error al obtener el historial de notificaciones:", error);
    return { success: false, error: "No se pudo recuperar el historial de notificaciones." };
  }
}
