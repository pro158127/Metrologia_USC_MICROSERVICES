import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { AppError } from '../lib/errors.js';

export default fp(async (fastify: FastifyInstance) => {
  const secretKey = process.env.AUTH_SECRET;

  if (!secretKey) {
    throw new Error('AUTH_SECRET no está definido en el entorno de Fastify');
  }

  await fastify.register(fastifyJwt, {
    secret: secretKey,
  });

  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        throw new AppError(401, 'No se recibió la cabecera Authorization');
      }

      try {
        await request.jwtVerify();
        const payload = request.user as { sub?: string; sessionVersion?: number };
        const idUsuario = Number(payload.sub);
        if (!Number.isInteger(idUsuario) || !Number.isFinite(payload.sessionVersion)) {
          throw new AppError(401, 'La sesión no contiene una versión de seguridad válida. Inicia sesión nuevamente.');
        }
        const usuario = await fastify.prisma.usuarios.findUnique({
          where: { ID_USUARIO_AUTO_INCREMENT: idUsuario },
          select: { ESTADO: true, elminado: true, UPDATE_AT: true },
        });
        if (!usuario || !usuario.ESTADO || usuario.elminado || (usuario.UPDATE_AT?.getTime() ?? 0) !== payload.sessionVersion) {
          throw new AppError(401, 'La sesión fue invalidada. Inicia sesión nuevamente.');
        }
      } catch (err: unknown) {
        if (err instanceof AppError) throw err;
        const mensaje = err instanceof Error ? err.message : 'Error de autenticación';
        request.log.warn(`[JWT Error]: ${mensaje}`);
        throw new AppError(401, 'Token inválido o no provisto');
      }
    }
  );
});
