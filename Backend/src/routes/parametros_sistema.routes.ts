import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  parametroSistemaRawToDtoSchema,
  respuestaListaParametrosSchema,
} from './parametros_sistema.schemas.js';

export default async function parametrosSistemaRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/parametros-sistema',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaParametrosSchema },
      },
    },
    async () => {
      const parametros = await fastify.prisma.parametros_sistema.findMany({
        orderBy: { ID_PARAMETRO: 'asc' },
      });

      return {
        ok: true as const,
        data: parametros.map((p) => parametroSistemaRawToDtoSchema.parse(p)),
      };
    }
  );
}
