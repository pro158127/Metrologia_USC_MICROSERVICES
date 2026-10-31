"use server";

import { auth } from "@/app/Login/types/auth";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";

interface PerfilData {
  nombre: string;
  correo: string;
  rol: string;
}

export async function obtenerPerfil(): Promise<{ success: boolean; data?: PerfilData; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) return { success: false, error: "No autenticado." };
    const res = await fastifyRequest<{ success: boolean; data: PerfilData }>(session, "/api/v1/perfil");
    return { success: true, data: res.data };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "No se pudo cargar el perfil." };
  }
}

export async function solicitarCodigoCambio(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) return { success: false, error: "No autenticado." };
    await fastifyRequest<{ success: boolean }>(session, "/api/v1/perfil/cambiar-contrasena/solicitar-codigo", { method: "POST" });
    return { success: true };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "No se pudo enviar el código." };
  }
}

export async function confirmarCambio(codigo: string, nuevaContrasena: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) return { success: false, error: "No autenticado." };
    await fastifyRequest<{ success: boolean }>(session, "/api/v1/perfil/cambiar-contrasena/confirmar", {
      method: "POST",
      body: { codigo, nuevaContrasena },
    });
    return { success: true };
  } catch (error) {
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "No se pudo cambiar la contraseña." };
  }
}
