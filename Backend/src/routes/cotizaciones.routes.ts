import { FastifyInstance } from 'fastify';
import { Estados, Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import {
  actualizarCotizacionBodySchema,
  cambiarEstadoBodySchema,
  crearCotizacionBodySchema,
  cotizacionRawToDtoSchema,
  idParamSchema,
  listarCotizacionesQuerySchema,
  respuestaCotizacionSchema,
  respuestaListaCotizacionesSchema,
} from './cotizaciones.schemas.js';

const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  ENVIADA: [Estados.APROBADA, Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};

export default async function cotizacionesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/cotizaciones',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearCotizacionBodySchema,
        response: { 200: respuestaCotizacionSchema },
      },
    },
    async (request) => {
      const idUsuario = Number(request.user?.sub ?? 0);

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        let subtotalDetalles = 0;
        const detallesMapeados = request.body.detalles.map((d) => {
          const valorTotal = d.cantidad * d.valorUnitario;
          subtotalDetalles += valorTotal;
          return {
            EQUIPO_DESCRIPCION: d.equipoDescripcion,
            TIPO_SERVICIO: d.tipoServicio,
            MAGNITUD: d.magnitud,
            NORMA_TECNICA: d.normaTecnica ?? null,
            CANTIDAD: d.cantidad,
            VALOR_UNITARIO: d.valorUnitario,
            VALOR_TOTAL: valorTotal,
          };
        });

        const viaticos = request.body.viaticos || 0;
        const descuentoPorcentaje = request.body.descuento || 0;
        const subtotalConViaticos = subtotalDetalles + viaticos;
        const montoTotal = subtotalConViaticos - subtotalConViaticos * (descuentoPorcentaje / 100);

        const estado = request.body.estado || Estados.BORRADOR;

        const nuevaCotizacion = await tx.cotizaciones.create({
          data: {
            CODIGO_COTIZACION: request.body.codigo,
            ID_CLIENTE_FK: request.body.idCliente,
            viaticos,
            descuento: descuentoPorcentaje,
            MONTO_TOTAL: montoTotal,
            ESTADO: estado,
            cotizacion_detalles: { create: detallesMapeados },
          },
          include: { cotizacion_detalles: true, clientes: true },
        });

        const historialData: {
          ID_COTIZACION_FK: number;
          ESTADO_ANTERIOR: Estados | null;
          ESTADO_NUEVO: Estados;
          ID_USUARIO_FK: number;
        }[] = [];
        if (estado === Estados.ENVIADA) {
          historialData.push({
            ID_COTIZACION_FK: nuevaCotizacion.ID_COTIZACION,
            ESTADO_ANTERIOR: null,
            ESTADO_NUEVO: Estados.BORRADOR,
            ID_USUARIO_FK: idUsuario,
          });
        }
        historialData.push({
          ID_COTIZACION_FK: nuevaCotizacion.ID_COTIZACION,
          ESTADO_ANTERIOR: estado === Estados.ENVIADA ? Estados.BORRADOR : null,
          ESTADO_NUEVO: estado,
          ID_USUARIO_FK: idUsuario,
        });

        await tx.historial_estado_cotizacion.createMany({ data: historialData });

        return nuevaCotizacion;
      });

      return { ok: true as const, data: cotizacionRawToDtoSchema.parse(resultado) };
    }
  );

  app.get(
    '/api/v1/cotizaciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaCotizacionSchema },
      },
    },
    async (request) => {
      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: request.params.id },
        include: {
          clientes: true,
          cotizacion_detalles: true,
          ordenes_trabajo: true,
          recepciones_equipo: true,
          documentos: true,
        },
      });

      if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');

      return { ok: true as const, data: cotizacionRawToDtoSchema.parse(cotizacion) };
    }
  );

  app.put(
    '/api/v1/cotizaciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarCotizacionBodySchema,
        response: { 200: respuestaCotizacionSchema },
      },
    },
    async (request) => {
      const idCotizacion = request.body.idCotizacion;
      const idUsuario = Number(request.user?.sub ?? 0);

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        const existente = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacion },
          include: { cotizacion_detalles: true },
        });
        if (!existente) throw new AppError(404, 'Cotización no encontrada');

        let detallesMapeados:
          | {
              EQUIPO_DESCRIPCION: string;
              TIPO_SERVICIO: string;
              MAGNITUD: string;
              NORMA_TECNICA: string | null;
              CANTIDAD: number;
              VALOR_UNITARIO: number;
              VALOR_TOTAL: number;
            }[]
          | undefined;
        let subtotal = 0;
        if (request.body.detalles) {
          await tx.cotizacion_detalles.deleteMany({ where: { ID_COTIZACION_FK: idCotizacion } });
          detallesMapeados = request.body.detalles.map((d) => {
            const valorTotal = d.cantidad * d.valorUnitario;
            subtotal += valorTotal;
            return {
              EQUIPO_DESCRIPCION: d.equipoDescripcion,
              TIPO_SERVICIO: d.tipoServicio,
              MAGNITUD: d.magnitud,
              NORMA_TECNICA: d.normaTecnica ?? null,
              CANTIDAD: d.cantidad,
              VALOR_UNITARIO: d.valorUnitario,
              VALOR_TOTAL: valorTotal,
            };
          });
        } else {
          subtotal = existente.cotizacion_detalles.reduce(
            (acc, d) => acc + d.CANTIDAD * Number(d.VALOR_UNITARIO),
            0
          );
        }

        const viaticos =
          request.body.viaticos !== undefined
            ? request.body.viaticos
            : Number(existente.viaticos || 0);
        const descuento =
          request.body.descuento !== undefined
            ? request.body.descuento
            : Number(existente.descuento || 0);
        const subtotalConViaticos = subtotal + viaticos;
        const montoTotal = subtotalConViaticos - subtotalConViaticos * (descuento / 100);

        if (request.body.estado && request.body.estado !== existente.ESTADO) {
          const permitidos = transicionesValidas[existente.ESTADO] || [];
          if (!permitidos.includes(request.body.estado)) {
            throw new AppError(
              409,
              `Transición no permitida de ${existente.ESTADO} a ${request.body.estado}`
            );
          }
        }

        const cotizacionActualizada = await tx.cotizaciones.update({
          where: { ID_COTIZACION: idCotizacion },
          data: {
            ...(request.body.codigo && { CODIGO_COTIZACION: request.body.codigo }),
            ...(request.body.idCliente && { ID_CLIENTE_FK: request.body.idCliente }),
            ...(request.body.estado && { ESTADO: request.body.estado }),
            viaticos,
            descuento,
            MONTO_TOTAL: montoTotal,
            ...(detallesMapeados && { cotizacion_detalles: { create: detallesMapeados } }),
          },
          include: {
            clientes: true,
            cotizacion_detalles: true,
            historial_estado_cotizacion: true,
          },
        });

        if (request.body.estado && request.body.estado !== existente.ESTADO) {
          await tx.historial_estado_cotizacion.create({
            data: {
              ID_COTIZACION_FK: idCotizacion,
              ESTADO_ANTERIOR: existente.ESTADO,
              ESTADO_NUEVO: request.body.estado,
              ID_USUARIO_FK: idUsuario,
            },
          });
        }

        return cotizacionActualizada;
      });

      return { ok: true as const, data: cotizacionRawToDtoSchema.parse(resultado) };
    }
  );

  app.patch(
    '/api/v1/cotizaciones/:id/estado',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: cambiarEstadoBodySchema,
        response: { 200: respuestaCotizacionSchema },
      },
    },
    async (request) => {
      const idCotizacion = request.params.id;
      const nuevoEstado = request.body.nuevoEstado;
      const idUsuario = Number(request.user?.sub ?? 0);

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        const actual = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacion },
          select: { ESTADO: true },
        });
        if (!actual) throw new AppError(404, 'Cotización no encontrada');

        const permitidos = transicionesValidas[actual.ESTADO] || [];
        if (!permitidos.includes(nuevoEstado)) {
          throw new AppError(409, `Transición no permitida de ${actual.ESTADO} a ${nuevoEstado}`);
        }

        const cotizacion = await tx.cotizaciones.update({
          where: { ID_COTIZACION: idCotizacion },
          data: { ESTADO: nuevoEstado },
          include: {
            clientes: true,
            cotizacion_detalles: true,
            historial_estado_cotizacion: true,
          },
        });

        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: idCotizacion,
            ESTADO_ANTERIOR: actual.ESTADO,
            ESTADO_NUEVO: nuevoEstado,
            ID_USUARIO_FK: idUsuario,
          },
        });

        return cotizacion;
      });

      return { ok: true as const, data: cotizacionRawToDtoSchema.parse(resultado) };
    }
  );

  app.get(
    '/api/v1/cotizaciones',
    {
      preHandler: [fastify.authenticate],
      schema: {
        querystring: listarCotizacionesQuerySchema,
        response: { 200: respuestaListaCotizacionesSchema },
      },
    },
    async (request) => {
      const page = request.query.page ?? 1;
      const limit = request.query.limit ?? 10;
      const skip = (page - 1) * limit;
      const estado = request.query.estado ?? undefined;
      const idCliente = request.query.idCliente ?? undefined;
      const busqueda = request.query.busqueda ?? undefined;

      const where: Prisma.cotizacionesWhereInput = {
        ...(estado && { ESTADO: estado }),
        ...(idCliente && { ID_CLIENTE_FK: idCliente }),
        ...(busqueda && {
          CODIGO_COTIZACION: {
            contains: busqueda,
            mode: 'insensitive',
          },
        }),
      };

      const [total, cotizaciones] = await fastify.prisma.$transaction([
        fastify.prisma.cotizaciones.count({ where }),
        fastify.prisma.cotizaciones.findMany({
          where,
          take: limit,
          skip,
          orderBy: { CREATED_AT: 'desc' },
          include: {
            clientes: true,
            cotizacion_detalles: true,
            historial_estado_cotizacion: true,
            historial_cambios: true,
            _count: {
              select: {
                ordenes_trabajo: true,
                recepciones_equipo: true,
                documentos: true,
                historial_estado_cotizacion: true,
              },
            },
          },
        }),
      ]);

      return {
        ok: true as const,
        data: cotizaciones.map((c) => cotizacionRawToDtoSchema.parse(c)),
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  );
}
