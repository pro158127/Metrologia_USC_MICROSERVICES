import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import {
  actualizarSeguimientoBodySchema,
  crearSeguimientoBodySchema,
  idParamSchema,
  listarSeguimientosQuerySchema,
  respuestaListaSeguimientosSchema,
  respuestaSeguimientoSchema,
  seguimientoRawToDtoSchema,
} from './seguimiento.schemas.js';

export default async function seguimientoRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/seguimientos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: listarSeguimientosQuerySchema,
        response: { 200: respuestaListaSeguimientosSchema },
      },
    },
    async (request) => {
      const idCotizacion = request.query.idCotizacion ?? undefined;
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 50;
      const skip = (page - 1) * limit;

      const where: Prisma.seguimientos_comercialesWhereInput = {
        ...(idCotizacion && { ID_COTIZACION_FK: idCotizacion }),
      };

      const [total, seguimientos] = await fastify.prisma.$transaction([
        fastify.prisma.seguimientos_comerciales.count({ where }),
        fastify.prisma.seguimientos_comerciales.findMany({
          where,
          take: limit,
          skip,
          orderBy: { FECHA_GESTION: 'desc' },
          include: {
            usuarios: {
              select: {
                ID_USUARIO_AUTO_INCREMENT: true,
                NOMBRE_COMPLETO: true,
                CORREO_INSTITUCION: true,
              },
            },
          },
        }),
      ]);

      return {
        ok: true as const,
        data: seguimientos.map((s) => seguimientoRawToDtoSchema.parse(s)),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }
  );

  app.post(
    '/api/v1/seguimientos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearSeguimientoBodySchema,
        response: { 200: respuestaSeguimientoSchema },
      },
    },
    async (request) => {
      const idUsuario = Number(request.user?.sub ?? 0);
      const { idCotizacion, tipo, descripcion, fechaGestion, proximaGestion, resultado, idUsuario: responsable } = request.body;

      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: idCotizacion },
      });
      if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');

      const nuevo = await fastify.prisma.$transaction(async (tx) => {
        const seguimiento = await tx.seguimientos_comerciales.create({
          data: {
            ID_COTIZACION_FK: idCotizacion,
            TIPO: tipo,
            DESCRIPCION: descripcion,
            FECHA_GESTION: fechaGestion ?? new Date(),
            PROXIMA_GESTION: proximaGestion ?? null,
            RESULTADO: resultado ?? null,
            ID_USUARIO_FK: responsable ?? idUsuario,
          },
          include: {
            usuarios: {
              select: {
                ID_USUARIO_AUTO_INCREMENT: true,
                NOMBRE_COMPLETO: true,
                CORREO_INSTITUCION: true,
              },
            },
          },
        });

        await registrarBitacora(tx, {
          action: 'CREATE',
          tableName: 'seguimientos_comerciales',
          recordId: seguimiento.ID_SEGUIMIENTO,
          userId: idUsuario,
          ip: request.ip,
          details: { idCotizacion, tipo, descripcion },
        });

        return seguimiento;
      });

      return { ok: true as const, data: seguimientoRawToDtoSchema.parse(nuevo) };
    }
  );

  app.put(
    '/api/v1/seguimientos/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarSeguimientoBodySchema,
        response: { 200: respuestaSeguimientoSchema },
      },
    },
    async (request) => {
      const idUsuario = Number(request.user?.sub ?? 0);
      const idSeguimiento = request.params.id;

      const existente = await fastify.prisma.seguimientos_comerciales.findUnique({
        where: { ID_SEGUIMIENTO: idSeguimiento },
      });
      if (!existente) throw new AppError(404, 'Seguimiento no encontrado');

      const actualizado = await fastify.prisma.$transaction(async (tx) => {
        const seguimiento = await tx.seguimientos_comerciales.update({
          where: { ID_SEGUIMIENTO: idSeguimiento },
          data: {
            ...(request.body.tipo && { TIPO: request.body.tipo }),
            ...(request.body.descripcion && { DESCRIPCION: request.body.descripcion }),
            ...(request.body.fechaGestion && { FECHA_GESTION: request.body.fechaGestion }),
            ...(request.body.proximaGestion !== undefined && { PROXIMA_GESTION: request.body.proximaGestion }),
            ...(request.body.resultado !== undefined && { RESULTADO: request.body.resultado }),
            ...(request.body.idUsuario !== undefined && { ID_USUARIO_FK: request.body.idUsuario }),
          },
          include: {
            usuarios: {
              select: {
                ID_USUARIO_AUTO_INCREMENT: true,
                NOMBRE_COMPLETO: true,
                CORREO_INSTITUCION: true,
              },
            },
          },
        });

        await registrarBitacora(tx, {
          action: 'UPDATE',
          tableName: 'seguimientos_comerciales',
          recordId: idSeguimiento,
          userId: idUsuario,
          ip: request.ip,
          details: { idCotizacion: seguimiento.ID_COTIZACION_FK },
        });

        return seguimiento;
      });

      return { ok: true as const, data: seguimientoRawToDtoSchema.parse(actualizado) };
    }
  );

  app.delete(
    '/api/v1/seguimientos/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: {
          200: z.object({ ok: z.literal(true), message: z.string() }),
        },
      },
    },
    async (request) => {
      const idUsuario = Number(request.user?.sub ?? 0);
      const idSeguimiento = request.params.id;

      const existente = await fastify.prisma.seguimientos_comerciales.findUnique({
        where: { ID_SEGUIMIENTO: idSeguimiento },
      });
      if (!existente) throw new AppError(404, 'Seguimiento no encontrado');

      await fastify.prisma.$transaction(async (tx) => {
        await tx.seguimientos_comerciales.delete({ where: { ID_SEGUIMIENTO: idSeguimiento } });
        await registrarBitacora(tx, {
          action: 'DELETE',
          tableName: 'seguimientos_comerciales',
          recordId: idSeguimiento,
          userId: idUsuario,
          ip: request.ip,
          details: { idCotizacion: existente.ID_COTIZACION_FK },
        });
      });

      return { ok: true as const, message: 'Seguimiento eliminado correctamente.' };
    }
  );
}
