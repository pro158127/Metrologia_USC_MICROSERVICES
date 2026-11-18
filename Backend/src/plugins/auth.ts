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
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : 'Error de autenticación';
        request.log.warn(`[JWT Error]: ${mensaje}`);
        throw new AppError(401, 'Token inválido o no provisto');
      }
    }
  );
});