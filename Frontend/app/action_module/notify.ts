"use server";
import prisma from "../lib/data_base/prisma";


export async function getNotificacionesByUsuario(idUsuario: number, soloNoVistas = false) {
  try {
    const notificaciones = await prisma.notificacion.findMany({
      where: {
        idUsuario: idUsuario,
        ...(soloNoVistas ? { visto: false } : {}), // Filtro opcional para traer solo pendientes
      },
      orderBy: {
        createdAt: "desc", // Primero las más recientes
      },
    });

    return { success: true, data: notificaciones };
  } catch (error) {
    console.error("Error al obtener notificaciones:", error);
    return { success: false, error: "No se pudieron obtener las notificaciones." };
  }
}

interface CrearNotificacionInput {
  idUsuario: number;
  mensaje: string;
  modulo: string;
  nivelPrioridad: "ALTA" | "MEDIA" | "BAJA";
}

/**
 * Crea una nueva notificación para un usuario
 */
export async function crearNotificacion({
  idUsuario,
  mensaje,
  modulo,
  nivelPrioridad,
}: CrearNotificacionInput) {
  try {
    // 1. Verificamos primero si el usuario existe para evitar errores de clave foránea
    const usuarioExiste = await prisma.usuario.findUnique({
      where: { id_usuario: idUsuario },
    });

    if (!usuarioExiste) {
      return { success: false, error: `El usuario con ID ${idUsuario} no existe.` };
    }

    // 2. Creamos la notificación en la base de datos
    const nuevaNotificacion = await prisma.notificacion.create({
      data: {
        idUsuario,
        mensaje,
        modulo,
        nivelPrioridad,
        visto: false, // Por defecto se crea como "no leída"
      },
    });

    return { success: true, data: nuevaNotificacion };
  } catch (error) {
    console.error("Error al crear notificación:", error);
    return { success: false, error: "No se pudo registrar la notificación." };
  }
}       

/**
 * Elimina una notificación específica por su ID
 * @param idNotificacion ID de la notificación a eliminar
 */
export async function eliminarNotificacion(idNotificacion: number) {
  try {
    // Eliminamos directamente la notificación
    const notificacionEliminada = await prisma.notificacion.delete({
      where: {
        idNotificacion: idNotificacion,
      },
    });

    return { 
      success: true, 
      message: "Notificación eliminada correctamente.", 
      data: notificacionEliminada 
    };
  } catch (error: any) {
    // Si Prisma no encuentra el registro, lanzará un error específico (P2025)
    if (error.code === "P2025") {
      return { success: false, error: "La notificación no existe o ya fue eliminada." };
    }
    
    console.error("Error al eliminar la notificación:", error);
    return { success: false, error: "No se pudo eliminar la notificación." };
  }
}

/**
 * Elimina todas las notificaciones pertenecientes a un usuario
 * @param idUsuario ID del usuario al que se le limpiará el historial
 */
export async function eliminarTodasLasNotificaciones(idUsuario: number) {
  try {
    const resultado = await prisma.notificacion.deleteMany({
      where: {
        idUsuario: idUsuario,
      },
    });

    return { 
      success: true, 
      message: `Se eliminaron ${resultado.count} notificaciones.`,
      count: resultado.count 
    };
  } catch (error) {
    console.error("Error al vaciar las notificaciones:", error);
    return { success: false, error: "No se pudieron eliminar las notificaciones." };
  }
}

/**
 * Marca una notificación específica como leída
 * @param idNotificacion ID de la notificación a actualizar
 */
export async function marcarNotificacionComoLeida(idNotificacion: number) {
  try {
    const notificacionActualizada = await prisma.notificacion.update({
      where: {
        idNotificacion: idNotificacion,
      },
      data: {
        visto: true,
      },
    });

    return { 
      success: true, 
      message: "Notificación marcada como leída.", 
      data: notificacionActualizada 
    };
  } catch (error: any) {
    if (error.code === "P2025") {
      return { success: false, error: "La notificación no existe." };
    }
    
    console.error("Error al actualizar notificación:", error);
    return { success: false, error: "No se pudo actualizar la notificación." };
  }
}

export async function marcarTodasComoLeidas(idUsuario: number) {
  try {
    const resultado = await prisma.notificacion.updateMany({
      where: {
        idUsuario: idUsuario,
        visto: false, // Solo actualizamos las que no han sido vistas para optimizar
      },
      data: {
        visto: true,
      },
    });

    return { 
      success: true, 
      message: `Se marcaron ${resultado.count} notificaciones como leídas.`,
      count: resultado.count 
    };
  } catch (error) {
    console.error("Error al actualizar todas las notificaciones:", error);
    return { success: false, error: "No se pudieron actualizar las notificaciones." };
  }
}

export async function getHistorialCompletoNotificaciones(idUsuario: number) {
  try {
    // VALIDACIÓN DE SEGURIDAD: Si no viene un ID válido, salimos de una vez
    if (!idUsuario || isNaN(idUsuario) || idUsuario <= 0) {
      console.warn("Se intentó buscar notificaciones con un idUsuario inválido:", idUsuario);
      return { success: true, data: [] }; // Retornamos un array vacío de forma segura
    }

    const notificaciones = await prisma.notificacion.findMany({
      where: {
        idUsuario: idUsuario, // Prisma usa el nombre del campo en CamelCase, mapeado internamente a ID_USUARIO_FK
      },
      orderBy: {
        createdAt: "desc", 
      },
    });

    return { 
      success: true, 
      data: notificaciones 
    };
  } catch (error) {
    console.error("Error al obtener el historial de notificaciones:", error);
    return { 
      success: false, 
      error: "No se pudo recuperar el historial de notificaciones." 
    };
  }
}