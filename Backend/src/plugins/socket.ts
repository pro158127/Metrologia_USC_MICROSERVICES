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
      origin: '*', // Ajusta según tus necesidades
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado vía WebSocket: ${socket.id}`);

    socket.on('join_room', (userId) => {
      const roomName = `user_room_${userId}`;
      socket.join(roomName);
      console.log(`👤 Socket ${socket.id} se unió a la sala privada: ${roomName}`);
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