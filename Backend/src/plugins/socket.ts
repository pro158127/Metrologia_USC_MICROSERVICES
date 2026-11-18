import { FastifyInstance } from 'fastify';
import { Server, ServerOptions } from 'socket.io';
import fp from 'fastify-plugin';

// Tipamos Fastify para que reconozca fastify.io en TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
}

async function socketPluginHandler(fastify: FastifyInstance) {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env.FRONTEND_URL || true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Autenticación por JWT en el handshake: el token debe venir en auth.token.
  // Se verifica contra AUTH_SECRET (mismo secreto de @fastify/jwt y del frontend).
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        return next(new Error('No autenticado: falta token en el handshake.'));
      }
      const payload = fastify.jwt.verify(token) as { sub?: string };
      if (!payload?.sub) {
        return next(new Error('Token inválido: sin subject.'));
      }
      (socket as any).data = { userId: String(payload.sub) };
      next();
    } catch {
      next(new Error('Token inválido o expirado.'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).data?.userId as string | undefined;
    const roomName = `user_room_${userId}`;
    socket.join(roomName);
    console.log(`👤 Socket ${socket.id} autenticado (userId=${userId}) unido a ${roomName}`);

    // Se conserva el evento por compatibilidad, pero el id del cliente se ignora:
    // la sala siempre se resuelve desde el token verificado.
    socket.on('join_room', () => {
      socket.join(roomName);
    });

    socket.on('disconnect', () => {
      console.log(`❌ Cliente desconectado: ${socket.id}`);
    });
  });

  // INYECCIÓN CLAVE: Decoramos la instancia de Fastify para que sea global
  fastify.decorate('io', io);

  fastify.addHook('onClose', (fastifyInstance, done) => {
    fastifyInstance.io.close();
    done();
  });
}

// Exportamos envuelto en 'fastify-plugin' para evitar que Fastify encapsule la propiedad
export const socketPlugin = fp(socketPluginHandler);
