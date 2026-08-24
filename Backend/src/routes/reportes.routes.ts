import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  certificadoRawToDtoSchema,
  cotizacionRawToDtoSchema,
  facturaRawToDtoSchema,
  ordenTrabajoRawToDtoSchema,
  respuestaReportesSchema,
  usuarioRawToDtoSchema,
} from './reportes.schemas.js';

export default async function reportesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/reportes',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaReportesSchema },
      },
    },
    async () => {
      const [cotizaciones, ordenes, certificados, facturas, usuarios] = await Promise.all([
        fastify.prisma.cotizaciones.findMany({
          include: {
            clientes: true,
            cotizacion_detalles: true,
            historial_estado_cotizacion: true,
          },
        }),
        fastify.prisma.ordenes_trabajo.findMany({
          include: {
            clientes: true,
            orden_trabajo_detalles: true,
            cotizaciones: { include: { clientes: true } },
          },
        }),
        fastify.prisma.certificados.findMany({ include: { certificado_sellos: true } }),
        fastify.prisma.facturas.findMany({ include: { ordenes_trabajo: true, clientes: true } }),
        fastify.prisma.usuarios.findMany({ omit: { contrase_a: true } }),
      ]);

      return {
        ok: true as const,
        data: {
          cotizaciones: cotizaciones.map((c) => cotizacionRawToDtoSchema.parse(c)),
          ordenes: ordenes.map((o) => ordenTrabajoRawToDtoSchema.parse(o)),
          certificados: certificados.map((c) => certificadoRawToDtoSchema.parse(c)),
          facturas: facturas.map((f) => facturaRawToDtoSchema.parse(f)),
          usuarios: usuarios.map((u) => usuarioRawToDtoSchema.parse(u)),
        },
      };
    }
  );
}
