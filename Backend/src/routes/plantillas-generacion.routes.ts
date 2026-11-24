// routes/plantillas-generacion.routes.ts
// Endpoint de generación dinámica de Excel: hidrata la plantilla activa con los
// valores del registro (COTIZACION / ORDEN_TRABAJO / RECEPCION) usando el
// MAPPING_CONFIG de la versión vigente y devuelve el binario (stream) o una URL.
import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';

import { generarExcelBodySchema,respuestaGeneracionEncoladaSchema,GenerarExcelBody } from './plantillas-generacion.schemas.js';

import { registrarGeneracionPendiente } from '../services/generacion-pendiente.service.js';
import { AppError } from '../lib/errors.js';

export default async function plantillasGeneracionRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/plantillas/generar-excel',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: generarExcelBodySchema,
        response: {
          202: respuestaGeneracionEncoladaSchema,
          400: respuestaGeneracionEncoladaSchema,
          500: respuestaGeneracionEncoladaSchema
        }
      },
    },
    async (request, reply) => {
      const body: GenerarExcelBody = request.body;
      let { tipo, id_registro,action } = body;
      const { codigo_actual, tipo_entry } = body;
      const p = fastify.prisma;
      
      if (tipo_entry === 'prod' && !id_registro) {
        const msg = 'El registro es obligatorio para generar un documento.';
        return reply.status(400).send({ ok: false, mensaje: msg, error: msg });
      }

      if (tipo_entry === 'test') {
        if (tipo == 1) {
          const count = await p.cotizaciones.count();
          if (count > 0) {
            const randomSkip = Math.floor(Math.random() * count);
            const randomRecord = await p.cotizaciones.findFirst({
              skip: randomSkip,
              select: { ID_COTIZACION: true } 
            });
            id_registro = randomRecord?.ID_COTIZACION || id_registro;
          }
        }

        if (tipo == 2) {
          const count = await p.ordenes_trabajo.count();
          if (count > 0) {
            const randomSkip = Math.floor(Math.random() * count);
            const randomRecord = await p.ordenes_trabajo.findFirst({
              skip: randomSkip,
              select: { ID_ORDEN_TRABAJO: true }
            });
            id_registro = randomRecord?.ID_ORDEN_TRABAJO || id_registro;
          }
        }

        if (tipo == 3) {
          const count = await p.recepciones_equipo.count();
          if (count > 0) {
            const randomSkip = Math.floor(Math.random() * count);
            const randomRecord = await p.recepciones_equipo.findFirst({
              skip: randomSkip,
              select: { ID_RECEPCION: true }
            });
            id_registro = randomRecord?.ID_RECEPCION || id_registro;
          }
        }

        if(id_registro == null){
          const msg = 'No se pudo obtener un registro aleatorio para el tipo especificado';
          return reply.status(400).send({ ok: false, mensaje: msg, error: msg });
        }
      }

      /// incializar la tarea 
      try {
        const quote_base = await p.$transaction((tx) => registrarGeneracionPendiente(tx, 'generar_excel', {
          tipo, id_registro, tipo_entry, codigo_actual, action,
          force_regenerate: body.force_regenerate,
          id_usuario: Number(request.user?.sub ?? 0) || undefined,
          id_cotizacion: tipo === 1 ? id_registro : undefined,
        }));

        // El 202 es de éxito, no requiere la llave error
        return reply.status(202).send({ ok: true, mensaje: 'Generación de Excel encolada correctamente', id_job: quote_base.id }); 
      }
      catch (e) {
        if (e instanceof AppError && (e.statusCode === 400 || e.statusCode === 412)) {
          return reply.status(400).send({ ok: false, mensaje: e.message, error: e.message });
        }
        request.log.error({ err: e }, 'Error al registrar la generación de Excel');
        const msg = 'Error al encolar la generación de Excel';
        return reply.status(500).send({ ok: false, mensaje: msg, error: msg });
      }
    }
  );
}
