import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { assertPermission } from '../lib/permissions.js';
import {
  actualizarPrecioTarifaBodySchema,
  actualizarTarifaBodySchema,
  cambiarEstadoTarifaBodySchema,
  crearTarifaBodySchema,
  idParamSchema,
  respuestaListaTarifasSchema,
  respuestaTarifaSchema,
  tarifaRawToDtoSchema,
} from './tarifas.schemas.js';

async function registrarPrecio(
  tx: Prisma.TransactionClient,
  idTarifa: number,
  precio: number,
  inicio?: Date | string | null,
  fin?: Date | string | null,
): Promise<void> {
  const [tarifa] = await tx.$queryRaw<{ ID_TARIFA: number }[]>`SELECT "ID_TARIFA" FROM tarifas WHERE "ID_TARIFA" = ${idTarifa} FOR UPDATE`;
  if (!tarifa) throw new AppError(404, 'Tarifa no encontrada.');

  const vigente = await tx.historial_tarifas.findFirst({
    where: { ID_TARIFA_FK: idTarifa },
    orderBy: { FECHA_INICIO: 'desc' },
  });
  const fechaInicio = inicio ? new Date(inicio) : new Date();
  const fechaFin = fin ? new Date(fin) : null;
  if ((vigente && fechaInicio <= vigente.FECHA_INICIO) || (fechaFin && fechaFin <= fechaInicio)) {
    throw new AppError(409, 'La nueva vigencia debe empezar después de la vigente y terminar después de su inicio.');
  }
  await tx.historial_tarifas.updateMany({
    where: { ID_TARIFA_FK: idTarifa, OR: [{ FECHA_FIN: null }, { FECHA_FIN: { gt: fechaInicio } }] },
    data: { FECHA_FIN: fechaInicio },
  });
  await tx.historial_tarifas.create({
    data: { ID_TARIFA_FK: idTarifa, PRECIO_U: precio, FECHA_INICIO: fechaInicio, FECHA_FIN: fechaFin },
  });
}

export default async function tarifasRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/tarifas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaTarifasSchema },
      },
    },
    async () => {
      const tarifas = await fastify.prisma.tarifas.findMany({
        include: {
          historial_tarifas: {
            orderBy: { FECHA_INICIO: 'desc' },
          },
        },
        orderBy: { ID_TARIFA: 'desc' },
      });

      return {
        ok: true as const,
        data: tarifas.map((t) => tarifaRawToDtoSchema.parse(t)),
      };
    }
  );

  app.put(
    '/api/v1/tarifas/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarTarifaBodySchema,
        response: { 200: respuestaTarifaSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'gestionar_catalogo_tarifas');
      const { idTarifa, precioVigente, fechaInicio, fechaFin, ...camposTarifa } = request.body;

      if (!idTarifa) throw new AppError(400, 'ID de tarifa requerido.');

      const updateData: Record<string, any> = {};
      if (camposTarifa.magnitud) updateData.MAGNITUD = camposTarifa.magnitud;
      if (camposTarifa.tipoServicio) updateData.TIPO_SERVICIO = camposTarifa.tipoServicio;
      if (camposTarifa.instrumento) updateData.Instrumento = camposTarifa.instrumento;
      if (camposTarifa.norma) updateData.Norma = camposTarifa.norma;

      const tarifaActualizada = await fastify.prisma.$transaction(async (tx) => {
        if (precioVigente != null) await registrarPrecio(tx, idTarifa, precioVigente, fechaInicio, fechaFin);
        if (Object.keys(updateData).length > 0) {
          return tx.tarifas.update({
            where: { ID_TARIFA: idTarifa },
            data: updateData,
            include: { historial_tarifas: { orderBy: { FECHA_INICIO: 'desc' } } },
          });
        }
        return tx.tarifas.findUniqueOrThrow({
          where: { ID_TARIFA: idTarifa },
          include: { historial_tarifas: { orderBy: { FECHA_INICIO: 'desc' } } },
        });
      });

      return { ok: true as const, data: tarifaRawToDtoSchema.parse(tarifaActualizada) };
    }
  );

  app.post(
    '/api/v1/tarifas',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearTarifaBodySchema,
        response: { 200: respuestaTarifaSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'gestionar_catalogo_tarifas');
      const precio = Number(request.body.precioInicial);
      if (isNaN(precio) || precio < 0) {
        throw new AppError(400, 'El precio inicial debe ser un número válido.');
      }

      const ahora = new Date();
      const fechaInicio = request.body.fechaInicio ? new Date(request.body.fechaInicio) : ahora;
      const fechaFin = request.body.fechaFin ? new Date(request.body.fechaFin) : null;

      const nuevaTarifa = await fastify.prisma.$transaction(async (tx) => {
        return await tx.tarifas.create({
          data: {
            MAGNITUD: request.body.magnitud,
            TIPO_SERVICIO: request.body.tipoServicio,
            Instrumento: request.body.instrumento,
            Norma: request.body.norma || 'n/a',
            ESTADO: 'ACTIVO',
            historial_tarifas: {
              create: {
                PRECIO_U: precio,
                FECHA_INICIO: fechaInicio,
                FECHA_FIN: fechaFin,
              },
            },
          },
          include: { historial_tarifas: true },
        });
      });

      return { ok: true as const, data: tarifaRawToDtoSchema.parse(nuevaTarifa) };
    }
  );

  app.put(
    '/api/v1/tarifas/:id/precio',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarPrecioTarifaBodySchema,
        response: { 200: respuestaTarifaSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'gestionar_catalogo_tarifas');
      const { idTarifa, nuevoPrecio, fechaInicio, fechaFin } = request.body;
      const tarifaActualizada = await fastify.prisma.$transaction(async (tx) => {
        await registrarPrecio(tx, idTarifa, nuevoPrecio, fechaInicio, fechaFin);
        return await tx.tarifas.findUniqueOrThrow({
          where: { ID_TARIFA: idTarifa },
          include: {
            historial_tarifas: {
              orderBy: { FECHA_INICIO: 'desc' },
            },
          },
        });
      });

      return { ok: true as const, data: tarifaRawToDtoSchema.parse(tarifaActualizada) };
    }
  );

  app.patch(
    '/api/v1/tarifas/:id/estado',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: cambiarEstadoTarifaBodySchema,
        response: { 200: respuestaTarifaSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'gestionar_catalogo_tarifas');
      const tarifa = await fastify.prisma.tarifas.update({
        where: { ID_TARIFA: request.params.id },
        data: { ESTADO: request.body.nuevoEstado },
        include: {
          historial_tarifas: {
            orderBy: { FECHA_INICIO: 'desc' },
          },
        },
      });

      return { ok: true as const, data: tarifaRawToDtoSchema.parse(tarifa) };
    }
  );
}
