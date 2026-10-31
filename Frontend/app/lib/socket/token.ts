'use server';

import { auth } from "@/app/Login/types/auth";
import { generarTokenBackend } from "@/app/lib/auth-token";

/**
 * Emite un token de backend de corta vida (5 min) para autenticar el handshake
 * de Socket.IO. El backend verifica la firma HS256 contra AUTH_SECRET.
 */
export async function obtenerTokenSocket(): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user) return null;
    const id = session.user.id_user ?? session.user.id ?? "";
    return await generarTokenBackend({
      sub: String(id),
      email: session.user.email ?? "",
      name: session.user.name ?? "",
      role: session.user.role ?? "",
      user: {
        id: String(id),
        email: session.user.email ?? "",
        nombreCompleto: session.user.name ?? "",
        permissions: { permisos: session.user.permissions?.permisos ?? {} },
      },
    });
  } catch (error) {
    console.error("Error generando token de socket:", error);
    return null;
  }
}
