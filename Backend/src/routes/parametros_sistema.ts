import { FastifyInstance } from 'fastify';

// Contrato camelCase que consume el frontend (mismo shape que el modelo ParametroSistema del frontend).
interface ParametroSistemaDTO {
  idParametro: number;
  clave: string;
  codigoScript: string | null;
  frecuencia: string;
  expresionCron: string | null;
  proximaEjecucion: string | Date | null;
  ultimaEjecucion: string | Date | null;
}

// Mapea la fila cruda (nombres de columna reales de la DB) al contrato camelCase del frontend.
function serializeParametroSistema(row: Record<string, any>): ParametroSistemaDTO {
  return {
    idParametro: row.ID_PARAMETRO,
    clave: row.CLAVE,
    codigoScript: row.CODIGO_SCRIPT ?? null,
    frecuencia: row.FRECUENCIA,
    expresionCron: row.EXPRESION_CRON ?? null,
    proximaEjecucion: row.PROXIMA_EJECUCION ?? null,
    ultimaEjecucion: row.ULTIMA_EJECUCION ?? null,
  };
}

export default async function parametrosSistemaRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/parametros-sistema',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const parametros = await fastify.prisma.parametros_sistema.findMany({
          orderBy: { ID_PARAMETRO: 'asc' },
        });

        return { success: true, data: parametros.map(serializeParametroSistema) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor al consultar los parámetros' });
      }
    }
  );
}
