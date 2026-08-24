import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { facturaRawToDtoSchema, respuestaFacturasSchema } from './facturas.schemas.js';

export default async function facturasRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/facturas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaFacturasSchema },
      },
    },
    async () => {
      const facturas = await fastify.prisma.facturas.findMany({
        include: {
          ordenes_trabajo: {
            include: {
              clientes: true,
            },
          },
          clientes: true,
        },
        orderBy: { FECHA: 'desc' },
      });

      return { ok: true as const, data: facturas.map((f) => facturaRawToDtoSchema.parse(f)) };
    }
  );
}
