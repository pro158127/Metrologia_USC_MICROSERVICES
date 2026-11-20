import { FastifyInstance } from 'fastify';
import { FrecuenciaEjecucion } from '@prisma/client';
import { assertPermission } from '../lib/permissions.js';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { getCronQueue, patronCronRespaldo } from '../lib/queue/queue.js';
import { AppError } from '../lib/errors.js';
import {
  actualizarParametrosBodySchema,
  parametroSistemaRawToDtoSchema,
  respuestaListaParametrosSchema,
  respuestaOkParametrosSchema,
} from './parametros_sistema.schemas.js';

function cronEsValido(expresion: string): boolean {
  const limites = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;
  const campos = expresion.trim().split(/\s+/);
  if (campos.length !== 5) return false;
  return campos.every((campo, indice) => campo.split(',').every((parte) => {
    const [base, paso] = parte.split('/');
    if (paso !== undefined && (!/^\d+$/.test(paso) || Number(paso) < 1)) return false;
    if (base === '*') return true;
    const rango = base.split('-');
    if (rango.length > 2 || rango.some((n) => !/^\d+$/.test(n))) return false;
    const [desde, hasta = desde] = rango.map(Number);
    return desde >= limites[indice][0] && hasta <= limites[indice][1] && desde <= hasta;
  }));
}

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
      assertPermission(request, 'administracion', 'configurar_catalogo_parametros');
      const { parametros } = request.body;

      for (const parametro of parametros) {
        if (['DIAS_RECHAZAR_COTIZACION', 'DIAS_SEGUIMIENTO_COTIZACION', 'RETENCION_BACKUPS'].includes(parametro.clave)) {
          const minimo = parametro.clave === 'RETENCION_BACKUPS' ? 1 : 0;
          if (parametro.codigoScript == null || !/^\d+$/.test(parametro.codigoScript) || Number(parametro.codigoScript) < minimo || Number(parametro.codigoScript) > 3650) {
            throw new AppError(400, `El parámetro ${parametro.clave} debe ser un número entero entre ${minimo} y 3650.`);
          }
        }
        if (parametro.frecuencia != null && !Object.values(FrecuenciaEjecucion).includes(parametro.frecuencia as FrecuenciaEjecucion)) {
          throw new AppError(400, `Frecuencia no válida para ${parametro.clave}.`);
        }
        if (parametro.clave === 'FRECUENCIA_RESPALDO' && parametro.frecuencia === 'PROGRAMADA_CRON' && !cronEsValido(parametro.expresionCron ?? '')) {
          throw new AppError(400, 'La expresión cron debe tener cinco campos válidos (minuto, hora, día, mes y día de semana).');
        }
      }

      await fastify.prisma.$transaction(async (tx) => {
        for (const p of parametros) {
          await tx.parametros_sistema.upsert({
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
      });

      // Si se cambió la frecuencia de respaldo, re-agenda el job de backup.
      const respaldo = parametros.find((p) => p.clave === 'FRECUENCIA_RESPALDO');
      if (respaldo) {
        const patron = patronCronRespaldo(respaldo.frecuencia ?? 'UNA_VEZ', respaldo.expresionCron);
        if (patron) {
          try {
            await getCronQueue().upsertJobScheduler('backup', { pattern: patron }, { name: 'backup', data: { tarea: 'backup' } });
          } catch (error) {
            request.log.error({ error }, 'No se pudo reprogramar el respaldo en Redis; la configuración quedó guardada y requiere reconciliación.');
            throw new AppError(503, 'Parámetros guardados, pero no se pudo reprogramar el respaldo. Reintente guardar la frecuencia.');
          }
        } else {
          try {
            await getCronQueue().removeJobScheduler('backup');
          } catch (error) {
            request.log.error({ error }, 'No se pudo retirar el respaldo programado de Redis.');
            throw new AppError(503, 'Parámetros guardados, pero no se pudo actualizar la programación del respaldo.');
          }
        }
      }

      return { ok: true as const };
    }
  );
}
