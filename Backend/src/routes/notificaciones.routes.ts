import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import {
  crearNotificacionBodySchema,
  idParamSchema,
  idUsuarioParamSchema,
  noVistasQuerySchema,
  notificacionRawToDtoSchema,
  respuestaConteoNotificacionesSchema,
  respuestaListaNotificacionesSchema,
  respuestaNotificacionConMensajeSchema,
  respuestaNotificacionSchema,
} from './notificaciones.schemas.js';

export default async function notificacionesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/notificaciones',
    {
      schema: {
        body: crearNotificacionBodySchema,
        response: { 200: respuestaNotificacionSchema },
      },
    },
    async (request) => {
      const { idUsuario, mensaje, modulo, nivelPrioridad } = request.body;

      const usuarioExiste = await fastify.prisma.usuarios.findUnique({
        where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
      });
      if (!usuarioExiste) throw new AppError(404, `El usuario con ID ${idUsuario} no existe.`);

      const nueva = await fastify.prisma.notificaciones.create({
        data: {
          ID_USUARIO_FK: idUsuario,
          MENSAJE: mensaje,
          MODULO: modulo,
          NIVEL_PRIORIDAD: nivelPrioridad,
          VISTO: false,
        },
      });

      return { ok: true as const, data: notificacionRawToDtoSchema.parse(nueva) };
    }
  );

  app.get(
    '/api/v1/notificaciones/:idUsuario',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idUsuarioParamSchema,
        querystring: noVistasQuerySchema,
        response: { 200: respuestaListaNotificacionesSchema },
      },
    },
    async (request) => {
      const soloNoVistas = request.query.noVistas === 'true';

      const notificaciones = await fastify.prisma.notificaciones.findMany({
        where: {
          ID_USUARIO_FK: request.params.idUsuario,
          ...(soloNoVistas ? { VISTO: false } : {}),
        },
        orderBy: { CREATED_AT: 'desc' },
      });

      return {
        ok: true as const,
        data: notificaciones.map((n) => notificacionRawToDtoSchema.parse(n)),
      };
    }
  );

  app.get(
    '/api/v1/notificaciones/:idUsuario/historial',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idUsuarioParamSchema,
        response: { 200: respuestaListaNotificacionesSchema },
      },
    },
    async (request) => {
      if (request.params.idUsuario <= 0) {
        return { ok: true as const, data: [] };
      }

      const notificaciones = await fastify.prisma.notificaciones.findMany({
        where: { ID_USUARIO_FK: request.params.idUsuario },
        orderBy: { CREATED_AT: 'desc' },
      });

      return {
        ok: true as const,
        data: notificaciones.map((n) => notificacionRawToDtoSchema.parse(n)),
      };
    }
  );

  app.delete(
    '/api/v1/notificaciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaNotificacionConMensajeSchema },
      },
    },
    async (request) => {
      const eliminada = await fastify.prisma.notificaciones.delete({
        where: { ID_NOTIFICACION: request.params.id },
      });

      return {
        ok: true as const,
        message: 'Notificación eliminada correctamente.',
        data: notificacionRawToDtoSchema.parse(eliminada),
      };
    }
  );

  app.delete(
    '/api/v1/notificaciones/usuario/:idUsuario',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idUsuarioParamSchema,
        response: { 200: respuestaConteoNotificacionesSchema },
      },
    },
    async (request) => {
      const resultado = await fastify.prisma.notificaciones.deleteMany({
        where: { ID_USUARIO_FK: request.params.idUsuario },
      });

      return {
        ok: true as const,
        message: `Se eliminaron ${resultado.count} notificaciones.`,
        count: resultado.count,
      };
    }
  );

  app.patch(
    '/api/v1/notificaciones/:id/leida',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaNotificacionConMensajeSchema },
      },
    },
    async (request) => {
      const actualizada = await fastify.prisma.notificaciones.update({
        where: { ID_NOTIFICACION: request.params.id },
        data: { VISTO: true },
      });

      return {
        ok: true as const,
        message: 'Notificación marcada como leída.',
        data: notificacionRawToDtoSchema.parse(actualizada),
      };
    }
  );

  app.patch(
    '/api/v1/notificaciones/usuario/:idUsuario/leidas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idUsuarioParamSchema,
        response: { 200: respuestaConteoNotificacionesSchema },
      },
    },
    async (request) => {
      const resultado = await fastify.prisma.notificaciones.updateMany({
        where: { ID_USUARIO_FK: request.params.idUsuario, VISTO: false },
        data: { VISTO: true },
      });

      return {
        ok: true as const,
        message: `Se marcaron ${resultado.count} notificaciones como leídas.`,
        count: resultado.count,
      };
    }
  );
}
