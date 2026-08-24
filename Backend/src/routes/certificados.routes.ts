import { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  calibracionRawToDtoSchema,
  certificadoRawToDtoSchema,
  clienteRawToDtoSchema,
  ordenTrabajoRawToDtoSchema,
  recepcionEquipoDetalleRawToDtoSchema,
  respuestaCertificadosSchema,
} from './certificados.schemas.js';

export default async function certificadosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/certificados',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaCertificadosSchema },
      },
    },
    async () => {
      const [certificados, calibraciones, instrumentos, ordenes, clientes] = await Promise.all([
        fastify.prisma.certificados.findMany({
          include: { certificado_sellos: true },
          orderBy: { ID_CERTIFICADO: 'desc' },
        }),
        fastify.prisma.calibraciones.findMany(),
        fastify.prisma.recepcion_equipo_detalles.findMany(),
        fastify.prisma.ordenes_trabajo.findMany({
          include: {
            clientes: true,
            cotizaciones: { include: { clientes: true } },
            orden_trabajo_detalles: true,
          },
        }),
        fastify.prisma.clientes.findMany(),
      ]);

      return {
        ok: true as const,
        data: {
          certificados: certificados.map((c) => certificadoRawToDtoSchema.parse(c)),
          calibraciones: calibraciones.map((c) => calibracionRawToDtoSchema.parse(c)),
          instrumentos: instrumentos.map((i) => recepcionEquipoDetalleRawToDtoSchema.parse(i)),
          ordenes: ordenes.map((o) => ordenTrabajoRawToDtoSchema.parse(o)),
          clientes: clientes.map((cl) => clienteRawToDtoSchema.parse(cl)),
        },
      };
    }
  );
}
