
import { FastifyInstance } from 'fastify';
import { quoteIdSchema } from './schema-checkStatus.js';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
// 2. Endpoint en Fastify con validación Zod
import { urls_schema,url } from './schema-checkStatus.js';
import { responseQuote } from './schema-checkStatus.js';
export default async function quoteStatusRoutes(fastify: FastifyInstance) {

    fastify.setValidatorCompiler(validatorCompiler);
    fastify.setSerializerCompiler(serializerCompiler);
    const app = fastify.withTypeProvider<ZodTypeProvider>();

 app.get(
    '/api/quotes/:id/status',
    {
      preHandler: [fastify.authenticate], // Sincronizado al nivel correcto de la ruta
      schema: {
        params: quoteIdSchema,
        response:{200:responseQuote,400:responseQuote,404:responseQuote}
      },
    },
    async (request, reply) => {
      // Zod y Fastify ya validaron y tiparon request.params automáticamente
      const { id } = request.params;

      const quote = await fastify.prisma.quote.findUnique({
        where: { id },
        select: { 
          status: true, 
          data:true
        }
      });

      if (!quote) {
        return reply.code(404).send({ ok:false,error:"no se encontro la cola "});
      }
      const typedData = quote.data as unknown as url;
      return { 
        ok:true,
        urls:{excel:typedData.excel,
          imagenes:typedData.imagenes,
          url_pdf:typedData.url_pdf
        },
        estado:quote.status
      };
    }
  );

  


}