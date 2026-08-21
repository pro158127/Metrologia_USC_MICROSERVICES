"use server"

import { auth } from "@/app/Login/types/auth";
import { headers } from "next/headers";
import { fastifyRequest, FastifyHttpError } from "@/app/lib/api/fastifyClient";

export async function obtenerIpCliente(): Promise<string> {
  const headersList = await headers();
  let ip = "";

  const xForwardedFor = headersList.get("x-forwarded-for");
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",");
    ip = ips[0].trim();
  } else {
    ip = headersList.get("x-real-ip") || "127.0.0.1";
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  if (ip === "::1") {
    ip = "127.0.0.1";
  }

  return ip;
}

export type AdminTab = "usuarios" | "bitacora" | "config";

export interface init_bitacora {
  fecha: string;
  usuario: string;
  rol: string;
  accion: string;
  modulo: string;
  ip: string;
}

interface UsuarioDTO {
  idUsuario: number;
  nombreCompleto: string;
  idRol: number;
  correo: string;
  createdAt: string | Date;
  updatedAt: string | Date | null;
  estado: boolean;
  intentos: number;
  elminado: boolean;
  rol?: { idRol: number; nombreRol: string; permisos: unknown; justificacion: string; directrizDirector: boolean };
}

interface RolDTO {
  idRol: number;
  nombreRol: string;
  permisos: unknown;
  justificacion: string;
  directrizDirector: boolean;
}

export interface ActualizarUsuarioInput {
  nombreCompleto?: string;
  correo?: string;
  idRol?: number;
  estado?: boolean;
  intentos?: number;
  elminado?: boolean;
}

export async function obtenerUsuariosPorPermiso(): Promise<{ success: boolean; data?: UsuarioDTO[]; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const res = await fastifyRequest<{ success: boolean; data: UsuarioDTO[] }>(session, '/api/v1/usuarios');
    return res;
  } catch (error) {
    console.error("Error en obtenerUsuariosPorPermiso (v5):", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Ocurrió un error interno en el servidor." };
  }
}

export async function actualizarUsuarioGenerico(
  idUsuario: number,
  datosActualizar: ActualizarUsuarioInput
): Promise<{ success: boolean; warning?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    const res = await fastifyRequest<{ success: boolean; warning?: string }>(
      session,
      `/api/v1/usuarios/${idUsuario}`,
      { method: 'PUT', body: datosActualizar }
    );
    return res;
  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Error de servidor al intentar guardar el cambio." };
  }
}

interface DatosCrearUsuario {
  nombre: string;
  correo: string;
  idRol: number;
  estado?: boolean;
}

export async function crearUsuarioGenerico(datos: DatosCrearUsuario): Promise<{ success: boolean; warning?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    const res = await fastifyRequest<{ success: boolean; warning?: string }>(
      session,
      '/api/v1/usuarios',
      { method: 'POST', body: datos }
    );
    return res;
  } catch (error) {
    console.error("Error al crear usuario:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Error interno del servidor al procesar el registro." };
  }
}

interface DatosEliminarUsuario {
  idUsuario: number;
}

export async function eliminarUsuario(datos: DatosEliminarUsuario): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    if (session.user.id_user && Number(session.user.id_user) === datos.idUsuario) {
      return { success: false, error: "No puedes eliminar tu propia cuenta de usuario." };
    }
    
    if (!datos?.idUsuario) {
      console.error("El idUsuario está indefinido:", datos);
      return  { success: false, error: "No  hay usuario ." } ;
      }
    

    const res = await fastifyRequest<{ success: boolean; message?: string }>(
      session,
      `/api/v1/usuarios/${datos.idUsuario}`,
      { method: 'DELETE' }
    );
    
    return res;
  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Error interno del servidor al procesar la eliminación." };
  }
}

export async function restablecerContrasenaGenerico(idUsuario: number): Promise<{ success: boolean; warning?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    const res = await fastifyRequest<{ success: boolean; warning?: string }>(
      session,
      `/api/v1/usuarios/${idUsuario}/restablecer`,
      { method: 'POST' }
    );
    return res;
  } catch (error) {
    console.error("Error al restablecer contraseña:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Error interno del servidor al intentar restablecer la contraseña." };
  }
}

interface DatosRestaurarUsuario {
  idUsuario: number;
}

export async function restaurarUsuario(datos: DatosRestaurarUsuario): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.gestionar_usuarios_roles) {
      return { success: false, error: "No tienes permisos suficientes para realizar esta acción." };
    }

    const res = await fastifyRequest<{ success: boolean; message?: string }>(
      session,
      `/api/v1/usuarios/${datos.idUsuario}/restaurar`,
      { method: 'PATCH' }
    );
    return res;
  } catch (error) {
    console.error("Error al restaurar usuario:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Error interno del servidor al procesar la restauración." };
  }
}

export async function obtenerBitacoraPorPermiso(): Promise<{ success: boolean; data?: init_bitacora[]; error?: string }> {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return { success: false, error: "No autenticado. Por favor inicia sesión." };
    }

    const permisos = session.user.permissions?.permisos;
    if (!permisos?.administracion?.consultar_bitacora_auditoria) {
      return { success: false, error: "Acceso denegado: No tienes permisos para consultar la bitácora de auditoría." };
    }

    const res = await fastifyRequest<{ success: boolean; data: init_bitacora[] }>(session, '/api/v1/bitacora');
    return res;
  } catch (error) {
    console.error("Error en obtenerBitacoraPorPermiso:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "Ocurrió un error interno en el servidor al intentar cargar la bitácora." };
  }
}

export async function obtenerRolesAction(): Promise<{ success: boolean; data?: RolDTO[]; error?: string }> {
  try {
    const session = await auth();
    const res = await fastifyRequest<{ success: boolean; data: RolDTO[] }>(session, '/api/v1/roles');
    return res;
  } catch (error) {
    console.error("❌ Error al obtener los roles:", error);
    if (error instanceof FastifyHttpError) return { success: false, error: error.message };
    return { success: false, error: "No se pudieron cargar los roles" };
  }
}
