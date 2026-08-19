import { FastifyInstance } from 'fastify';

interface NotificacionDTO {
  idNotificacion: number;
  idUsuario: number;
  mensaje: string;
  modulo: string;
  visto: boolean;
  nivelPrioridad: string;
  createdAt: string | Date;
}

function serializeNotificacion(row: Record<string, any>): NotificacionDTO {
  return {
    idNotificacion: row.ID_NOTIFICACION,
    idUsuario: row.ID_USUARIO_FK,
    mensaje: row.MENSAJE,
    modulo: row.MODULO,
    visto: row.VISTO,
    nivelPrioridad: row.NIVEL_PRIORIDAD,
    createdAt: row.CREATED_AT,
  };
}

const crearNotificacionSchema = {
  type: 'object',
  required: ['idUsuario', 'mensaje', 'modulo', 'nivelPrioridad'],
  properties: {
    idUsuario: { type: 'integer' },
    mensaje: { type: 'string' },
    modulo: { type: 'string' },
    nivelPrioridad: { type: 'string', enum: ['ALTA', 'MEDIA', 'BAJA'] },
  },
  additionalProperties: false,
} as const;

export default async function notificacionesRoutes(fastify: FastifyInstance) {
  // Crear notificación (público: se usa en flujos previos a la sesión, p. ej. bloqueo de cuenta)
  fastify.post<{ Body: { idUsuario: number; mensaje: string; modulo: string; nivelPrioridad: string } }>(
    '/api/v1/notificaciones',
    { schema: { body: crearNotificacionSchema } },
    async (request, reply) => {
      try {
        const { idUsuario, mensaje, modulo, nivelPrioridad } = request.body;

        const usuarioExiste = await fastify.prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
        });
        if (!usuarioExiste) {
          return reply.code(404).send({ success: false, error: `El usuario con ID ${idUsuario} no existe.` });
        }

        const nueva = await fastify.prisma.notificaciones.create({
          data: {
            ID_USUARIO_FK: idUsuario,
            MENSAJE: mensaje,
            MODULO: modulo,
            NIVEL_PRIORIDAD: nivelPrioridad,
            VISTO: false,
          },
        });

        return { success: true, data: serializeNotificacion(nueva) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudo registrar la notificación.' });
      }
    }
  );

  // Notificaciones por usuario (filtro opcional de no vistas)
  fastify.get<{ Params: { idUsuario: string }; Querystring: { noVistas?: string } }>(
    '/api/v1/notificaciones/:idUsuario',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.idUsuario);
        const soloNoVistas = request.query.noVistas === 'true';

        const notificaciones = await fastify.prisma.notificaciones.findMany({
          where: {
            ID_USUARIO_FK: idUsuario,
            ...(soloNoVistas ? { VISTO: false } : {}),
          },
          orderBy: { CREATED_AT: 'desc' },
        });

        return { success: true, data: notificaciones.map(serializeNotificacion) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudieron obtener las notificaciones.' });
      }
    }
  );

  // Historial completo de notificaciones
  fastify.get<{ Params: { idUsuario: string } }>(
    '/api/v1/notificaciones/:idUsuario/historial',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.idUsuario);
        if (!idUsuario || isNaN(idUsuario) || idUsuario <= 0) {
          return { success: true, data: [] };
        }

        const notificaciones = await fastify.prisma.notificaciones.findMany({
          where: { ID_USUARIO_FK: idUsuario },
          orderBy: { CREATED_AT: 'desc' },
        });

        return { success: true, data: notificaciones.map(serializeNotificacion) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudo recuperar el historial de notificaciones.' });
      }
    }
  );

  // Eliminar una notificación
  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/notificaciones/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idNotificacion = Number(request.params.id);
        const eliminada = await fastify.prisma.notificaciones.delete({
          where: { ID_NOTIFICACION: idNotificacion },
        });
        return { success: true, message: 'Notificación eliminada correctamente.', data: serializeNotificacion(eliminada) };
      } catch (error: any) {
        if (error?.code === 'P2025') {
          return reply.code(404).send({ success: false, error: 'La notificación no existe o ya fue eliminada.' });
        }
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudo eliminar la notificación.' });
      }
    }
  );

  // Eliminar todas las notificaciones de un usuario
  fastify.delete<{ Params: { idUsuario: string } }>(
    '/api/v1/notificaciones/usuario/:idUsuario',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.idUsuario);
        const resultado = await fastify.prisma.notificaciones.deleteMany({
          where: { ID_USUARIO_FK: idUsuario },
        });
        return { success: true, message: `Se eliminaron ${resultado.count} notificaciones.`, count: resultado.count };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudieron eliminar las notificaciones.' });
      }
    }
  );

  // Marcar una notificación como leída
  fastify.patch<{ Params: { id: string } }>(
    '/api/v1/notificaciones/:id/leida',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idNotificacion = Number(request.params.id);
        const actualizada = await fastify.prisma.notificaciones.update({
          where: { ID_NOTIFICACION: idNotificacion },
          data: { VISTO: true },
        });
        return { success: true, message: 'Notificación marcada como leída.', data: serializeNotificacion(actualizada) };
      } catch (error: any) {
        if (error?.code === 'P2025') {
          return reply.code(404).send({ success: false, error: 'La notificación no existe.' });
        }
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudo actualizar la notificación.' });
      }
    }
  );

  // Marcar todas las notificaciones de un usuario como leídas
  fastify.patch<{ Params: { idUsuario: string } }>(
    '/api/v1/notificaciones/usuario/:idUsuario/leidas',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idUsuario = Number(request.params.idUsuario);
        const resultado = await fastify.prisma.notificaciones.updateMany({
          where: { ID_USUARIO_FK: idUsuario, VISTO: false },
          data: { VISTO: true },
        });
        return { success: true, message: `Se marcaron ${resultado.count} notificaciones como leídas.`, count: resultado.count };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'No se pudieron actualizar las notificaciones.' });
      }
    }
  );
}
