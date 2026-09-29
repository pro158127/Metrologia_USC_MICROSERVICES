import { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { evaluarTransicionesOT } from '../services/ot-fsm.service.js';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
import {
  clienteRawToDtoSchema,
  cotizacionConDetallesRawToDtoSchema,
  datosInicialesResponseSchema,
  historialCambioDtoSchema,
  InstrumentoRecepcionInput,
  ordenTrabajoResumenRawToDtoSchema,
  recepcionBodySchema,
  recepcionEquipoRawToDtoSchema,
  recepcionInstrumentoParamsSchema,
  recepcionParamsSchema,
  recepcionesEnriquecidasResponseSchema,
  respuestaHistorialRecepcionSchema,
  respuestaRecepcionMutacionSchema,
  respuestaSoftDeleteSchema,
  tarifaRawToDtoSchema,
} from './recepciones.schemas.js';

type InstrumentoInput = InstrumentoRecepcionInput;

const REC_INCLUDE = {
  recepcion_equipo_detalles: true,
  documentos: true,
  cotizaciones: { include: { clientes: true } },
  ordenes_trabajo: { include: { clientes: true, cotizaciones: true } },
} satisfies Prisma.recepciones_equipoInclude;

/** Normaliza el sitio de calibración al enum `sitio_calibracion`. */
function normalizarSitio(valor?: string | null): 'LABORATORIO' | 'CLIENTE' | null {
  if (!valor) return null;
  const v = valor.toUpperCase();
  if (v.includes('LAB')) return 'LABORATORIO';
  if (v.includes('CLI')) return 'CLIENTE';
  return null;
}

function parseVersion(numeroVersion?: string | null): number {
  const match = numeroVersion?.match(/V?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function mapDetalleCreate(inst: InstrumentoInput, item: number) {
  return {
    ITEM: item,
    INSTRUMENTO: inst.instrumento,
    MARCA: inst.marca ?? null,
    MODELO: inst.modelo ?? null,
    SERIE: inst.serie ?? null,
    CODIGO_INVENTARIO: inst.codigoInventario ?? null,
    RESOLUCION: inst.resolucion ?? null,
    TIPO_SENSOR_TEMP_init: inst.sensorInt ?? false,
    TIPO_SENSOR_TEMP_ext: inst.sensorExt ?? false,
    ESTADO_IBC: (inst.estadoIBC ?? {}) as Prisma.InputJsonValue,
    ESTAMPILLA: inst.estampilla && inst.estampilla.trim() ? inst.estampilla.trim() : null,
    OBSERVACIONES: inst.observaciones ?? null,
    activacion: true,
  };
}

function mapDetalleUpdate(inst: InstrumentoInput, item: number) {
  return {
    ITEM: item,
    INSTRUMENTO: inst.instrumento,
    MARCA: inst.marca ?? null,
    MODELO: inst.modelo ?? null,
    SERIE: inst.serie ?? null,
    CODIGO_INVENTARIO: inst.codigoInventario ?? null,
    RESOLUCION: inst.resolucion ?? null,
    TIPO_SENSOR_TEMP_init: inst.sensorInt ?? false,
    TIPO_SENSOR_TEMP_ext: inst.sensorExt ?? false,
    ESTADO_IBC: (inst.estadoIBC ?? {}) as Prisma.InputJsonValue,
    ESTAMPILLA: inst.estampilla && inst.estampilla.trim() ? inst.estampilla.trim() : null,
    OBSERVACIONES: inst.observaciones ?? null,
    activacion: true,
  };
}

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

  // ==========================================================================
  // POST /api/v1/recepciones — Creación standalone (ingeniería inversa)
  // Autogenera Cotización base → OT → Recepción dentro de una transacción.
  // ==========================================================================
  app.post(
    '/api/v1/recepciones',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: recepcionBodySchema,
        response: { 200: respuestaRecepcionMutacionSchema },
      },
    },
    async (request) => {
      const body = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      const recepcion = await fastify.prisma.$transaction(async (tx) => {
        // 1. Resolver o crear la Cotización base
        let cotizacion = body.cotizacionCodigo
          ? await tx.cotizaciones.findFirst({
              where: { CODIGO_COTIZACION: body.cotizacionCodigo },
            })
          : null;

        if (!cotizacion) {
          const codigoCot = await generarConsecutivo(tx, 'COT');
          cotizacion = await tx.cotizaciones.create({
            data: {
              CODIGO_COTIZACION: codigoCot,
              ESTADO: 'BORRADOR',
              MONTO_TOTAL: 0,
              cotizacion_detalles: {
                create: body.instrumentos.map((inst) => ({
                  EQUIPO_DESCRIPCION: inst.instrumento,
                  TIPO_SERVICIO: 'Calibración',
                  MAGNITUD: 'n/a',
                  CANTIDAD: 1,
                  VALOR_UNITARIO: 0,
                  VALOR_TOTAL: 0,
                  activacion: true,
                })),
              },
            },
          });
        }

        // 2. Resolver o crear la OT homóloga
        let ot = body.ordenTrabajoCodigo
          ? await tx.ordenes_trabajo.findFirst({
              where: { CODIGO_OT: body.ordenTrabajoCodigo },
            })
          : null;

        if (!ot) {
          const codigoOT = await generarConsecutivo(tx, 'OT');
          ot = await tx.ordenes_trabajo.create({
            data: {
              CODIGO_OT: codigoOT,
              ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
              ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
              no_cotizacion: cotizacion.CODIGO_COTIZACION,
              estado: 'Creada',
              orden_trabajo_detalles: {
                create: body.instrumentos.map((inst, idx) => ({
                  ITEM: idx + 1,
                  INSTRUMENTO: inst.instrumento,
                  TIPO_SERVICIO: 'Calibración',
                  FABRICANTE: inst.marca ?? null,
                  MODELO: inst.modelo ?? null,
                  SERIE: inst.serie ?? null,
                  CODIGO_INVENTARIO: inst.codigoInventario ?? null,
                  asignado: 1,
                  activacion: true,
                })),
              },
            },
          });
        }

        // 3. Crear la Recepción enlazada
        const codigoRec = await generarConsecutivo(tx, 'REC');
        const nueva = await tx.recepciones_equipo.create({
          data: {
            CODIGO_RECEPCION: codigoRec,
            ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
            ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
            SOLICITANTE: body.solicitante,
            NOMBRE_ENTREGA: body.nombreEntrega ?? null,
            SITIO_CALIBRACION: normalizarSitio(body.sitioCalibracion),
            FECHA_RECEPCION: new Date(body.fechaRecepcion),
            FECHA_SALIDA: body.fechaSalida ? new Date(body.fechaSalida) : null,
            NOMBRE_RECIBE: body.nombreRecibe ?? null,
            NOMBRE_EMPACA: body.nombreEmpaca ?? null,
            NOMBRE_CALIBRA: body.nombreCalibra ?? null,
            NOMBRE_RECIBE_SERVICIO: body.nombreRecibeServicio ?? null,
            ACCESORIOS: body.accesorios ?? null,
            PRUEBAS_COMPLETAS: body.pruebasCompletas ?? true,
            OBSERVACIONES_PRUEBAS: body.observacionesPruebas ?? null,
            ESTADO: body.estado ?? 'BORRADOR',
            recepcion_equipo_detalles: {
              create: body.instrumentos.map((inst, idx) => mapDetalleCreate(inst, idx + 1)),
            },
          },
          include: REC_INCLUDE,
        });

        await evaluarTransicionesOT(tx, ot.ID_ORDEN_TRABAJO);
        return nueva;
      });

      // Encolar generación documental después del commit
      const job = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await getGenerationExcelQueue().add('generar_recepcion', {
        tipo: 3,
        id_registro: recepcion.ID_RECEPCION,
        codigo_actual: recepcion.CODIGO_RECEPCION,
        tipo_entry: 'prod',
        id_job: job.id,
        id_usuario: idUsuario,
      });

      return {
        ok: true as const,
        data: recepcionEquipoRawToDtoSchema.parse(recepcion),
        message: 'Recepción creada y enlazada a su cotización/OT.',
        id_job: job.id,
      };
    }
  );

  // ==========================================================================
  // PUT /api/v1/recepciones/:id — Actualización con sincronización y versionado
  // ==========================================================================
  app.put(
    '/api/v1/recepciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: recepcionParamsSchema,
        body: recepcionBodySchema,
        response: { 200: respuestaRecepcionMutacionSchema },
      },
    },
    async (request) => {
      const { id } = request.params;
      const body = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      const recepcion = await fastify.prisma.$transaction(async (tx) => {
        const actual = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: { recepcion_equipo_detalles: true },
        });
        if (!actual) throw new AppError(404, 'Recepción no encontrada');

        // 1. Nuevo consecutivo versionado de la Recepción
        const nuevoCodigoRec = await generarConsecutivo(tx, 'REC', actual.CODIGO_RECEPCION);

        // 2. Cabecera
        await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: id },
          data: {
            CODIGO_RECEPCION: nuevoCodigoRec,
            SOLICITANTE: body.solicitante,
            NOMBRE_ENTREGA: body.nombreEntrega ?? null,
            SITIO_CALIBRACION: normalizarSitio(body.sitioCalibracion),
            FECHA_RECEPCION: new Date(body.fechaRecepcion),
            FECHA_SALIDA: body.fechaSalida ? new Date(body.fechaSalida) : null,
            NOMBRE_RECIBE: body.nombreRecibe ?? null,
            NOMBRE_EMPACA: body.nombreEmpaca ?? null,
            NOMBRE_CALIBRA: body.nombreCalibra ?? null,
            NOMBRE_RECIBE_SERVICIO: body.nombreRecibeServicio ?? null,
            ACCESORIOS: body.accesorios ?? null,
            PRUEBAS_COMPLETAS: body.pruebasCompletas ?? true,
            OBSERVACIONES_PRUEBAS: body.observacionesPruebas ?? null,
            ...(body.estado ? { ESTADO: body.estado } : {}),
          },
        });

        // 3. Sincronizar instrumentos (match por ITEM/posición, soft-delete de sobrantes)
        const existentes = [...actual.recepcion_equipo_detalles].sort(
          (a, b) => (a.ITEM ?? 0) - (b.ITEM ?? 0) || a.ID_INSTRUMENTO - b.ID_INSTRUMENTO
        );
        const usados = new Set<number>();

        for (let i = 0; i < body.instrumentos.length; i++) {
          const inst = body.instrumentos[i];
          const item = i + 1;
          const match =
            existentes.find((d) => d.ITEM === item && !usados.has(d.ID_INSTRUMENTO)) ??
            existentes.find((d) => !usados.has(d.ID_INSTRUMENTO));

          if (match) {
            usados.add(match.ID_INSTRUMENTO);
            await tx.recepcion_equipo_detalles.update({
              where: { ID_INSTRUMENTO: match.ID_INSTRUMENTO },
              data: mapDetalleUpdate(inst, item),
            });
          } else {
            await tx.recepcion_equipo_detalles.create({
              data: { ID_RECEPCION_FK: id, ...mapDetalleCreate(inst, item) },
            });
          }
        }

        // Soft delete de instrumentos removidos (NO DELETE físico)
        const sobrantes = existentes.filter((d) => !usados.has(d.ID_INSTRUMENTO));
        for (const d of sobrantes) {
          if (d.activacion === false) continue;
          await tx.recepcion_equipo_detalles.update({
            where: { ID_INSTRUMENTO: d.ID_INSTRUMENTO },
            data: { activacion: false },
          });
        }

        // 4. Sincronizar campos compartidos hacia la OT homóloga + versionar OT
        if (actual.ID_ORDEN_TRABAJO_FK) {
          const otDetalles = await tx.orden_trabajo_detalles.findMany({
            where: { ID_ORDEN_TRABAJO_FK: actual.ID_ORDEN_TRABAJO_FK },
          });

          for (let i = 0; i < body.instrumentos.length; i++) {
            const inst = body.instrumentos[i];
            const item = i + 1;
            const otDet =
              otDetalles.find((d) => d.ITEM === item) ??
              otDetalles.find((d) => d.INSTRUMENTO === inst.instrumento);

            if (otDet) {
              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: otDet.ID_DETALLE },
                data: {
                  ITEM: item,
                  INSTRUMENTO: inst.instrumento,
                  FABRICANTE: inst.marca ?? null,
                  MODELO: inst.modelo ?? null,
                  SERIE: inst.serie ?? null,
                  CODIGO_INVENTARIO: inst.codigoInventario ?? null,
                  activacion: true,
                },
              });
            }
          }

          const otActual = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: actual.ID_ORDEN_TRABAJO_FK },
            select: { CODIGO_OT: true },
          });
          if (otActual) {
            const nuevoCodigoOT = await generarConsecutivo(tx, 'OT', otActual.CODIGO_OT);
            await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: actual.ID_ORDEN_TRABAJO_FK },
              data: { CODIGO_OT: nuevoCodigoOT },
            });
          }

          await evaluarTransicionesOT(tx, actual.ID_ORDEN_TRABAJO_FK);
        }

        const final = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: REC_INCLUDE,
        });
        return final!;
      });

      // Encolar Excel (Recepción + OT) tras el commit
      const excelQueue = getGenerationExcelQueue();
      const jobRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelQueue.add('actualizacion_recepcion', {
        tipo: 3,
        id_registro: recepcion.ID_RECEPCION,
        codigo_actual: recepcion.CODIGO_RECEPCION,
        tipo_entry: 'prod',
        id_job: jobRec.id,
        id_usuario: idUsuario,
      });
      if (recepcion.ID_ORDEN_TRABAJO_FK) {
        const jobOt = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_orden', {
          tipo: 2,
          id_registro: recepcion.ID_ORDEN_TRABAJO_FK,
          codigo_actual: recepcion.ordenes_trabajo?.CODIGO_OT,
          tipo_entry: 'prod',
          id_job: jobOt.id,
          id_usuario: idUsuario,
        });
      }

      return {
        ok: true as const,
        data: recepcionEquipoRawToDtoSchema.parse(recepcion),
        message: 'Recepción actualizada, sincronizada y versionada.',
      };
    }
  );

  // ==========================================================================
  // DELETE (soft) /api/v1/recepciones/:id/instrumentos/:idInstrumento
  // Desactiva el ítem en Recepción, OT y Cotización + auditoría + historial.
  // ==========================================================================
  app.delete(
    '/api/v1/recepciones/:id/instrumentos/:idInstrumento',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: recepcionInstrumentoParamsSchema,
        response: { 200: respuestaSoftDeleteSchema },
      },
    },
    async (request) => {
      const { id, idInstrumento } = request.params;
      const idUsuario = Number(request.user?.sub ?? 0);
      const ip = request.ip;

      await fastify.prisma.$transaction(async (tx) => {
        const rec = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: { recepcion_equipo_detalles: true },
        });
        if (!rec) throw new AppError(404, 'Recepción no encontrada');

        const detalle = rec.recepcion_equipo_detalles.find(
          (d) => d.ID_INSTRUMENTO === idInstrumento
        );
        if (!detalle) throw new AppError(404, 'Instrumento no encontrado en la recepción');

        // 1. Soft delete en Recepción
        await tx.recepcion_equipo_detalles.update({
          where: { ID_INSTRUMENTO: idInstrumento },
          data: { activacion: false },
        });

        // 2. Soft delete en OT
        if (rec.ID_ORDEN_TRABAJO_FK) {
          const otDet = await tx.orden_trabajo_detalles.findFirst({
            where: {
              ID_ORDEN_TRABAJO_FK: rec.ID_ORDEN_TRABAJO_FK,
              OR: [
                ...(detalle.ITEM != null ? [{ ITEM: detalle.ITEM }] : []),
                { INSTRUMENTO: detalle.INSTRUMENTO },
              ],
            },
          });
          if (otDet) {
            await tx.orden_trabajo_detalles.update({
              where: { ID_DETALLE: otDet.ID_DETALLE },
              data: { activacion: false },
            });
          }
        }

        // 3. Soft delete en Cotización + recálculo financiero
        const cotizacionId = rec.ID_COTIZACION_FK;
        if (cotizacionId) {
          const cotDet = await tx.cotizacion_detalles.findFirst({
            where: {
              ID_COTIZACION_FK: cotizacionId,
              activacion: true,
              EQUIPO_DESCRIPCION: detalle.INSTRUMENTO,
            },
          });
          if (cotDet) {
            await tx.cotizacion_detalles.update({
              where: { ID_DETALLE: cotDet.ID_DETALLE },
              data: { activacion: false },
            });
          }

          const activos = await tx.cotizacion_detalles.findMany({
            where: { ID_COTIZACION_FK: cotizacionId, activacion: true },
          });
          const subtotal = activos.reduce((acc, d) => acc + Number(d.VALOR_TOTAL), 0);
          const cot = await tx.cotizaciones.findUnique({
            where: { ID_COTIZACION: cotizacionId },
          });
          const viaticos = Number(cot?.viaticos ?? 0);
          const descuento = Number(cot?.descuento ?? 0);
          const base = subtotal + viaticos;
          const montoTotal = base - base * (descuento / 100);

          await tx.cotizaciones.update({
            where: { ID_COTIZACION: cotizacionId },
            data: { MONTO_TOTAL: montoTotal },
          });
        }

        // 4. Auditoría
        await tx.audit_logs.create({
          data: {
            action: 'SOFT_DELETE',
            tableName: 'recepcion_equipo_detalles',
            recordId: String(idInstrumento),
            USER_ID: idUsuario,
            details: {
              before: {
                instrumento: detalle.INSTRUMENTO,
                activacion: detalle.activacion,
              },
              after: { activacion: false },
            },
            ip,
          },
        });

        // 5. Historial de cambios de la cotización
        if (cotizacionId) {
          const ultimo = await tx.historial_cambios.findFirst({
            where: { id_cotizacion: cotizacionId },
            orderBy: { created_at: 'desc' },
          });
          const nextVersion = parseVersion(ultimo?.numero_version) + 1;
          await tx.historial_cambios.create({
            data: {
              id: crypto.randomUUID(),
              numero_version: `V${nextVersion}`,
              fecha_cambio: new Date(),
              descripcion: `Eliminación (soft delete) del equipo "${detalle.INSTRUMENTO}" de la recepción ${rec.CODIGO_RECEPCION}.`,
              requiere_validacion_hoja: false,
              observaciones: null,
              aprobo: String(idUsuario),
              id_cotizacion: cotizacionId,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
        }
      });

      return {
        ok: true as const,
        message: 'Instrumento desactivado (soft delete) en recepción, OT y cotización.',
      };
    }
  );

  // ==========================================================================
  // GET /api/v1/recepciones/:id/historial — Trazabilidad vía historial_cambios
  // ==========================================================================
  app.get(
    '/api/v1/recepciones/:id/historial',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: recepcionParamsSchema,
        response: { 200: respuestaHistorialRecepcionSchema },
      },
    },
    async (request) => {
      const rec = await fastify.prisma.recepciones_equipo.findUnique({
        where: { ID_RECEPCION: request.params.id },
      });
      if (!rec) throw new AppError(404, 'Recepción no encontrada');

      if (!rec.ID_COTIZACION_FK) {
        return { ok: true as const, data: [] };
      }

      const historial = await fastify.prisma.historial_cambios.findMany({
        where: { id_cotizacion: rec.ID_COTIZACION_FK },
        orderBy: { created_at: 'desc' },
      });

      return {
        ok: true as const,
        data: historial.map((h) =>
          historialCambioDtoSchema.parse({
            id: h.id,
            numeroVersion: h.numero_version,
            fechaCambio: h.fecha_cambio,
            descripcion: h.descripcion,
            observaciones: h.observaciones,
            aprobo: h.aprobo,
            idCotizacion: h.id_cotizacion,
            createdAt: h.created_at,
          })
        ),
      };
    }
  );
}
