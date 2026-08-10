import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';

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
      try {
        // Log para depuración exacta en tu terminal de Docker
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          throw new Error('No se recibió la cabecera Authorization');
        }

        await request.jwtVerify();
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : 'Error de autenticación';
        request.log.error(`[JWT Error]: ${mensaje}`);
        
        reply.code(401).send({ 
          error: 'Token inválido o no provisto',
          detalle: mensaje 
        });
      }
    }
  );
});