import { FastifyInstance } from 'fastify';
import { FrecuenciaEjecucion } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { getCronQueue, patronCronRespaldo } from '../lib/queue/queue.js';
import {
  actualizarParametrosBodySchema,
  parametroSistemaRawToDtoSchema,
  respuestaListaParametrosSchema,
  respuestaOkParametrosSchema,
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

  app.put(
    '/api/v1/parametros-sistema',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: actualizarParametrosBodySchema,
        response: { 200: respuestaOkParametrosSchema },
      },
    },
    async (request) => {
      const { parametros } = request.body;

      for (const p of parametros) {
        await fastify.prisma.parametros_sistema.upsert({
          where: { CLAVE: p.clave },
          create: {
            CLAVE: p.clave,
            CODIGO_SCRIPT: p.codigoScript ?? null,
            FRECUENCIA: (p.frecuencia as FrecuenciaEjecucion) ?? FrecuenciaEjecucion.UNA_VEZ,
            EXPRESION_CRON: p.expresionCron ?? null,
          },
          update: {
            ...(p.codigoScript !== undefined ? { CODIGO_SCRIPT: p.codigoScript } : {}),
            ...(p.frecuencia !== undefined ? { FRECUENCIA: p.frecuencia as FrecuenciaEjecucion } : {}),
            ...(p.expresionCron !== undefined ? { EXPRESION_CRON: p.expresionCron } : {}),
          },
        });
      }

      // Si se cambió la frecuencia de respaldo, re-agenda el job de backup.
      const respaldo = parametros.find((p) => p.clave === 'FRECUENCIA_RESPALDO');
      if (respaldo) {
        const patron = patronCronRespaldo(respaldo.frecuencia ?? 'UNA_VEZ', respaldo.expresionCron);
        if (patron) {
          await getCronQueue().upsertJobScheduler(
            'backup',
            { pattern: patron },
            { name: 'backup', data: { tarea: 'backup' } }
          );
        } else {
          await getCronQueue().removeJobScheduler('backup');
        }
      }

      return { ok: true as const };
    }
  );
}
