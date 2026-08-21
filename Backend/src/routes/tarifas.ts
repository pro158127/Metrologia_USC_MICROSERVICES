import { FastifyInstance } from 'fastify';

// ==========================================
// SERIALIZADOR (RAW -> camelCase del frontend)
// ==========================================
function serializeHistorialTarifa(row: Record<string, any>): Record<string, any> {
  return {
    idHistorial: row.ID_HISTORIAL,
    idTarifa: row.ID_TARIFA_FK,
    fechaInicio: row.FECHA_INICIO,
    fechaFin: row.FECHA_FIN ?? null,
    precioU: row.PRECIO_U ? Number(row.PRECIO_U) : 0,
  };
}

function serializeTarifa(row: Record<string, any>): Record<string, any> {
  return {
    idTarifa: row.ID_TARIFA,
    magnitud: row.MAGNITUD,
    tipoServicio: row.TIPO_SERVICIO,
    estado: row.ESTADO,
    Instrumento: row.Instrumento,
    Norma: row.Norma,
    historial: (row.historial_tarifas ?? []).map(serializeHistorialTarifa),
  };
}

interface ActualizarTarifaBody {
  idTarifa: number;
  magnitud?: string;
  tipoServicio?: string;
  instrumento?: string;
  norma?: string;
  precioVigente?: number;
  fechaInicio?: string;
  fechaFin?: string | null;
}

interface CrearTarifaBody {
  magnitud: string;
  tipoServicio: string;
  instrumento: string;
  precioInicial: number;
  norma?: string;
  fechaInicio?: string;
  fechaFin?: string | null;
}

interface ActualizarPrecioTarifaBody {
  idTarifa: number;
  nuevoPrecio: number;
  fechaInicio?: string;
  fechaFin?: string | null;
}

interface CambiarEstadoTarifaBody {
  nuevoEstado: 'ACTIVO' | 'INACTIVO';
}

export default async function tarifasRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/tarifas',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const tarifas = await fastify.prisma.tarifas.findMany({
          include: {
            historial_tarifas: {
              orderBy: { FECHA_INICIO: 'desc' },
            },
          },
          orderBy: { ID_TARIFA: 'desc' },
        });

        return { ok: true, data: tarifas.map(serializeTarifa) };
      } catch (error) {
        request.log.error(error);
        return { ok: false, error: 'Error al consultar el catálogo de tarifas.' };
      }
    }
  );

  fastify.put<{ Body: ActualizarTarifaBody }>(
    '/api/v1/tarifas/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const { idTarifa, precioVigente, fechaInicio, fechaFin, ...camposTarifa } = request.body;

      if (!idTarifa) return { ok: false, error: 'ID de tarifa requerido.' };

      try {
        const updateData: Record<string, any> = {};
        if (camposTarifa.magnitud) updateData.MAGNITUD = camposTarifa.magnitud;
        if (camposTarifa.tipoServicio) updateData.TIPO_SERVICIO = camposTarifa.tipoServicio;
        if (camposTarifa.instrumento) updateData.Instrumento = camposTarifa.instrumento;
        if (camposTarifa.norma) updateData.Norma = camposTarifa.norma;

        if (precioVigente !== undefined && precioVigente !== null) {
          const ahora = new Date();
          const nuevaFechaInicio = fechaInicio ? new Date(fechaInicio) : ahora;
          const nuevaFechaFin = fechaFin ? new Date(fechaFin) : null;

          await fastify.prisma.$transaction(async (tx) => {
            await tx.historial_tarifas.updateMany({
              where: {
                ID_TARIFA_FK: idTarifa,
                FECHA_FIN: null,
              },
              data: { FECHA_FIN: nuevaFechaInicio },
            });

            await tx.historial_tarifas.create({
              data: {
                ID_TARIFA_FK: idTarifa,
                PRECIO_U: precioVigente,
                FECHA_INICIO: nuevaFechaInicio,
                FECHA_FIN: nuevaFechaFin,
              },
            });
          });
        }

        let tarifaActualizada;
        if (Object.keys(updateData).length > 0) {
          tarifaActualizada = await fastify.prisma.tarifas.update({
            where: { ID_TARIFA: idTarifa },
            data: updateData,
            include: { historial_tarifas: { orderBy: { FECHA_INICIO: 'desc' } } },
          });
        } else {
          tarifaActualizada = await fastify.prisma.tarifas.findUniqueOrThrow({
            where: { ID_TARIFA: idTarifa },
            include: { historial_tarifas: { orderBy: { FECHA_INICIO: 'desc' } } },
          });
        }

        return { ok: true, data: serializeTarifa(tarifaActualizada) };
      } catch (error) {
        request.log.error(error);
        return { ok: false, error: 'Error al actualizar la tarifa.' };
      }
    }
  );

  fastify.post<{ Body: CrearTarifaBody }>(
    '/api/v1/tarifas',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const precio = Number(request.body.precioInicial);
        if (isNaN(precio) || precio < 0) {
          return { ok: false, error: 'El precio inicial debe ser un número válido.' };
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

        return { ok: true, data: serializeTarifa(nuevaTarifa) };
      } catch (error) {
        request.log.error(error);
        return { ok: false, error: 'No se pudo crear la tarifa metrológica.' };
      }
    }
  );

  fastify.put<{ Body: ActualizarPrecioTarifaBody }>(
    '/api/v1/tarifas/:id/precio',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const ahora = new Date();
        const nuevaFechaInicio = request.body.fechaInicio
          ? new Date(request.body.fechaInicio)
          : ahora;
        const nuevaFechaFin = request.body.fechaFin ? new Date(request.body.fechaFin) : null;

        const tarifaActualizada = await fastify.prisma.$transaction(async (tx) => {
          await tx.historial_tarifas.updateMany({
            where: {
              ID_TARIFA_FK: request.body.idTarifa,
              FECHA_FIN: null,
            },
            data: { FECHA_FIN: nuevaFechaInicio },
          });

          await tx.historial_tarifas.create({
            data: {
              ID_TARIFA_FK: request.body.idTarifa,
              PRECIO_U: request.body.nuevoPrecio,
              FECHA_INICIO: nuevaFechaInicio,
              FECHA_FIN: nuevaFechaFin,
            },
          });

          return await tx.tarifas.findUniqueOrThrow({
            where: { ID_TARIFA: request.body.idTarifa },
            include: {
              historial_tarifas: {
                orderBy: { FECHA_INICIO: 'desc' },
              },
            },
          });
        });

        return { ok: true, data: serializeTarifa(tarifaActualizada) };
      } catch (error) {
        request.log.error(error);
        return { ok: false, error: 'Error al actualizar el precio de la tarifa.' };
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: CambiarEstadoTarifaBody }>(
    '/api/v1/tarifas/:id/estado',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const tarifa = await fastify.prisma.tarifas.update({
          where: { ID_TARIFA: Number(request.params.id) },
          data: { ESTADO: request.body.nuevoEstado },
          include: {
            historial_tarifas: {
              orderBy: { FECHA_INICIO: 'desc' },
            },
          },
        });

        return { ok: true, data: serializeTarifa(tarifa) };
      } catch (error) {
        request.log.error(error);
        return { ok: false, error: 'Error al cambiar el estado de la tarifa.' };
      }
    }
  );
}
