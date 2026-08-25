import { FastifyInstance } from 'fastify';

export default async function jobsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/jobs/:id',
    {
      preHandler: [fastify.authenticate], // Protegemos la ruta con tu middleware actual
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        // Consultamos la tabla 'quote' (donde guardas los trackers de BullMQ)
        const job = await fastify.prisma.quote.findUnique({
          where: { id: id },
        });

        if (!job) {
          return reply.code(404).send({ 
            status: 'FAILED', 
            data: { error: 'Job no encontrado en la base de datos' } 
          });
        }

        // Retornamos el estado actual (ej. PENDING, COMPLETED, FAILED)
        return reply.code(200).send({
          status: job.status,
          // Si guardas logs de error en alguna columna, la envías aquí:
          data: { error: job.data || null } 
        });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ 
          status: 'FAILED', 
          data: { error: 'Error interno consultando el estado del Job' } 
        });
      }
    }
  );
}