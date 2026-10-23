import { Prisma } from '@prisma/client';

type PrismaClientLike = {
  historial_estado_cotizacion: {
    findFirst: (args: {
      where: Prisma.historial_estado_cotizacionWhereInput;
      orderBy: Prisma.historial_estado_cotizacionOrderByWithRelationInput;
    }) => Promise<{ ID_USUARIO_FK: number | null } | null>;
  };
  notificaciones: {
    create: (args: { data: Prisma.notificacionesUncheckedCreateInput }) => Promise<unknown>;
  };
};

/**
 * Resuelve el usuario "dueño/creador" de una cotización a partir del primer
 * registro de su historial de estados (el POST /cotizaciones lo escribe con el
 * ID del usuario que la creó). Devuelve `null` si no puede determinarse.
 */
export async function resolverUsuarioCreadorCotizacion(
  client: PrismaClientLike,
  idCotizacion: number
): Promise<number | null> {
  const primer = await client.historial_estado_cotizacion.findFirst({
    where: { ID_COTIZACION_FK: idCotizacion },
    orderBy: { CREATED_AT: 'asc' },
  });
  return primer?.ID_USUARIO_FK ?? null;
}

export interface NotificarInput {
  idUsuario: number | null;
  mensaje: string;
  modulo: string;
  nivelPrioridad?: string;
}

/**
 * Crea una notificación para un usuario. Si `idUsuario` es nulo no hace nada.
 * La emisión vía Socket.IO se produce mediante el trigger LISTEN/NOTIFY de la BD.
 */
export async function notificarUsuario(
  client: PrismaClientLike,
  input: NotificarInput
): Promise<void> {
  if (!input.idUsuario) return;

  try {
    await client.notificaciones.create({
      data: {
        ID_USUARIO_FK: input.idUsuario,
        MENSAJE: input.mensaje,
        MODULO: input.modulo,
        NIVEL_PRIORIDAD: input.nivelPrioridad ?? 'NORMAL',
        VISTO: false,
      },
    });
  } catch (error) {
    // La notificación no debe romper el flujo principal.
    console.error('[notificacion] Error creando notificación:', error);
  }
}
