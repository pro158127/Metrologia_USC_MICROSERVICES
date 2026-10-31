"use server";

import { BASE_URL } from "@/app/lib/api/fastifyClient";

export async function solicitarCodigoRecuperacion(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/solicitar-recuperacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { success: false, error: data.error ?? "No se pudo enviar el código." };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Error de red al solicitar el código." };
  }
}

export async function recuperarContrasena(
  email: string,
  codigo: string,
  nuevaContrasena: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/recuperar-contrasena`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, codigo, nuevaContrasena }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { success: false, error: data.error ?? "No se pudo restablecer la contraseña." };
    }
    return { success: true };
  } catch {
    return { success: false, error: "Error de red al restablecer la contraseña." };
  }
}
