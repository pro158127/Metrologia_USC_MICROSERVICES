import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  clienteRawToDtoSchema,
  cotizacionConDetallesRawToDtoSchema,
  datosInicialesResponseSchema,
  ordenTrabajoResumenRawToDtoSchema,
  recepcionEquipoRawToDtoSchema,
  recepcionesEnriquecidasResponseSchema,
  tarifaRawToDtoSchema,
} from './recepciones.schemas.js';

export default async function recepcionesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/recepciones/enriquecidas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: recepcionesEnriquecidasResponseSchema },
      },
    },
    async () => {
      const recepciones = await fastify.prisma.recepciones_equipo.findMany({
        include: {
          recepcion_equipo_detalles: true,
          cotizaciones: { include: { clientes: true } },
          ordenes_trabajo: { include: { clientes: true, cotizaciones: true } },
          documentos: true,
        },
        orderBy: { FECHA_RECEPCION: 'desc' },
      });

      return recepciones.map((rec) => {
        let clienteNombre = 'Cliente no especificado';
        if (rec.cotizaciones?.clientes?.RAZON_SOCIAL) {
          clienteNombre = rec.cotizaciones.clientes.RAZON_SOCIAL;
        } else if (rec.ordenes_trabajo?.clientes?.RAZON_SOCIAL) {
          clienteNombre = rec.ordenes_trabajo.clientes.RAZON_SOCIAL;
        } else if (rec.ID_COTIZACION_FK && rec.cotizaciones?.clientes) {
          clienteNombre = rec.cotizaciones.clientes.RAZON_SOCIAL || 'Sin razón social';
        } else if (rec.ID_ORDEN_TRABAJO_FK && rec.ordenes_trabajo?.clientes) {
          clienteNombre = rec.ordenes_trabajo.clientes.RAZON_SOCIAL || 'Sin razón social';
        }

        const codigoCotizacion = rec.cotizaciones?.CODIGO_COTIZACION || '';
        const codigoOT = rec.ordenes_trabajo?.CODIGO_OT || '';

        return {
          idRecepcion: rec.ID_RECEPCION,
          codigo: rec.CODIGO_RECEPCION || `REC-${rec.ID_RECEPCION}`,
          clienteNombre,
          fecha: rec.FECHA_RECEPCION
            ? new Date(rec.FECHA_RECEPCION).toISOString().split('T')[0]
            : '',
          cantidadInstrumentos: rec.recepcion_equipo_detalles?.length || 0,
          codigoCotizacion,
          codigoOT,
          raw: recepcionEquipoRawToDtoSchema.parse(rec),
        };
      });
    }
  );

  app.get(
    '/api/v1/recepciones',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: datosInicialesResponseSchema },
      },
    },
    async () => {
      const [recepciones, clientes, cotizaciones, ordenes, tarifas] =
        await fastify.prisma.$transaction([
          fastify.prisma.recepciones_equipo.findMany({
            include: {
              recepcion_equipo_detalles: true,
              cotizaciones: { include: { clientes: true } },
              ordenes_trabajo: { include: { clientes: true, cotizaciones: true } },
              documentos: true,
            },
            orderBy: { FECHA_RECEPCION: 'desc' },
          }),
          fastify.prisma.clientes.findMany({ orderBy: { RAZON_SOCIAL: 'asc' } }),
          fastify.prisma.cotizaciones.findMany({
            include: {
              clientes: { select: { ID_CLIENTE: true, RAZON_SOCIAL: true, CORREO: true } },
              cotizacion_detalles: true,
            },
            orderBy: { CREATED_AT: 'desc' },
          }),
          fastify.prisma.ordenes_trabajo.findMany({
            include: {
              clientes: { select: { ID_CLIENTE: true, RAZON_SOCIAL: true, CORREO: true } },
              cotizaciones: { select: { ID_COTIZACION: true, CODIGO_COTIZACION: true } },
            },
            orderBy: { CREATED_AT: 'desc' },
          }),
          fastify.prisma.tarifas.findMany({
            include: { historial_tarifas: true },
            orderBy: { Instrumento: 'asc' },
          }),
        ]);

      return {
        recepciones: recepciones.map((r) => recepcionEquipoRawToDtoSchema.parse(r)),
        clientes: clientes.map((c) => clienteRawToDtoSchema.parse(c)),
        cotizaciones: cotizaciones.map((c) => cotizacionConDetallesRawToDtoSchema.parse(c)),
        ordenes: ordenes.map((o) => ordenTrabajoResumenRawToDtoSchema.parse(o)),
        tarifas: tarifas.map((t) => tarifaRawToDtoSchema.parse(t)),
      };
    }
  );
}
