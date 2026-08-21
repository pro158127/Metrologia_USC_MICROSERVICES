import { FastifyInstance } from 'fastify';

// Contrato camelCase que consume el frontend (mismo shape que el modelo Sello del frontend).
interface SelloDTO {
  idSello: number;
  nombre: string;
  idDocumento: number;
  estado: boolean;
}

// Mapea la fila cruda (nombres de columna reales de la DB) al contrato camelCase del frontend.
function serializeSello(row: Record<string, any>): SelloDTO {
  return {
    idSello: row.ID_SELLO,
    nombre: row.NOMBRE,
    idDocumento: row.ID_DOCUMENTO_FK,
    estado: row.ESTADO,
  };
}

export default async function sellosRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/sellos',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const sellos = await fastify.prisma.sellos.findMany({
          orderBy: { ID_SELLO: 'asc' },
        });

        return { success: true, data: sellos.map(serializeSello) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al consultar los sellos' });
      }
    }
  );
}
