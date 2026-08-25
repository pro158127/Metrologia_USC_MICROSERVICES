import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { 
  internalHeadersSchema, 
  emitirSocketBodySchema, 
  successResponseSchema, 
  errorResponseSchema
} from './internal-schema.js';

export default async function internalRoutes(fastify: FastifyInstance) {
  // 1. Configuramos los compiladores en el contexto de este plugin
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  
  // 2. Inyectamos el Type Provider a una nueva instancia encapsulada
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/internal/emitir-socket',
    {
      schema: {
        summary: 'Emite un evento de WebSockets desde un Worker interno',
        tags: ['Internal'],
        headers: internalHeadersSchema,
        body: emitirSocketBodySchema,
        response: {
          200: successResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // Validamos el secreto del worker por los headers tipados automáticamente
      const secret = request.headers['x-worker-secret'];
      
      if (secret !== 'SecretoInternoDocker123') {
        return reply.status(403).send({ error: 'Prohibido' });
      }

      // Desestructuramos los datos validados por Zod en request.body
      const { evento, payload, room } = request.body;

      if (room) {
        // 🔥 Aseguramos que el nombre de la sala coincida exactamente 
        // con la convención utilizada en el frontend (ej: user_room_1)
        const targetRoom = room.startsWith('user_room_') ? room : `user_room_${room}`;
        
        fastify.io.to(targetRoom).emit(evento, payload);
        request.log.info(`📡 Evento "${evento}" emitido a la sala privada: ${targetRoom}`);
      } else {
        fastify.io.emit(evento, payload);
        request.log.info(`📡 Evento "${evento}" emitido de forma global`);
      }

      return reply.code(200).send({ success: true });
    }
  );
}