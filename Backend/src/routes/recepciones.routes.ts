import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { assertPermission } from '../lib/permissions.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { evaluarTransicionesOT } from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { sincronizarCotizacionDesdeRecepcion } from '../services/cotizacion-sync.service.js';
import {
  validarIdentidadInstrumentosRecepcion,
  validarInstrumentoSinCertificado,
} from '../services/ot-edit-lock.service.js';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import { pendientesEntregaSalida } from '../services/recepcion-entrega.service.js';
import { cerrarSeguimientoSiCompleto } from '../services/seguimiento-cierre.service.js';
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
  softDeleteInstrumentoBodySchema,
  tarifaRawToDtoSchema,
} from './recepciones.schemas.js';

type InstrumentoInput = InstrumentoRecepcionInput & { idUnidad?: string | null };

const REC_INCLUDE = {
  recepcion_equipo_detalles: {
    where: { OR: [{ activacion: true }, { activacion: null }] },
    orderBy: { ITEM: 'asc' },
              include: { calibraciones: { select: { ID_INSTRUMENTO_FK: true } } },
  },
  documentos: true,
  cotizaciones: { include: { clientes: true } },
  ordenes_trabajo: {
    include: {
      clientes: true,
      cotizaciones: true,
      orden_trabajo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        include: { usuarios: { select: { NOMBRE_COMPLETO: true } } },
      },
    },
  },
} satisfies Prisma.recepciones_equipoInclude;

/** Normaliza el sitio de calibración al enum `sitio_calibracion`. */
function normalizarSitio(valor?: string | null): 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC' {
  if (!valor) return 'LABORATORIO';
  const v = valor.toUpperCase();
  if (v.includes('LAB')) return 'LABORATORIO';
  if (v.includes('CLI')) return 'CLIENTE';
  if (v.includes('INTERNO')) return 'INTERNO_USC';
  return 'LABORATORIO';
}

function snapshotEstable(valor: unknown): string {
  const normalizar = (dato: unknown): unknown => {
    if (dato instanceof Date) return dato.toISOString();
    if (Array.isArray(dato)) return dato.map(normalizar);
    if (dato && typeof dato === 'object') {
      return Object.fromEntries(Object.entries(dato as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([clave, contenido]) => [clave, normalizar(contenido)]));
    }
    if (typeof dato === 'string') return dato.trim() || null;
    return dato ?? null;
  };
  return JSON.stringify(normalizar(valor));
}

function parseVersion(numeroVersion?: string | null): number {
  const match = numeroVersion?.match(/V?(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function validarRecepcionDefinitiva(body: InstrumentoInput[], cabecera: { nombreEntrega?: string | null; fechaRecepcion?: string | null }) {
  return Boolean(
    cabecera.nombreEntrega?.trim() && cabecera.fechaRecepcion && body.length > 0 &&
    body.every((inst) => {
      const entrada = (inst.estadoIBC as any)?.entrada;
      return [inst.instrumento, inst.marca, inst.modelo, inst.serie, inst.codigoInventario, inst.resolucion]
        .every((v) => v != null && String(v).trim() !== '') &&
        ['E', 'T', 'D', 'A'].every((k) => typeof entrada?.[k] === 'boolean');
    })
  );
}

function calcularEstadoRecepcion(
  instrumentos: InstrumentoInput[],
  cabecera: {
    estado?: string;
    nombreEntrega?: string | null;
    fechaRecepcion?: string | null;
    fechaSalida?: string | null;
    nombreRecibe?: string | null;
    nombreEmpaca?: string | null;
    accesorios?: string | null;
    nombreRecibeServicio?: string | null;
  },
  nombreRecibeSesion: string,
): 'BORRADOR' | 'RECIBIDO' | 'ENTREGADO' {
  const entradaCompleta = validarRecepcionDefinitiva(instrumentos, cabecera);
  const pendientesSalida = pendientesEntregaSalida({
    fechaSalida: cabecera.fechaSalida,
    nombreRecibe: nombreRecibeSesion || cabecera.nombreRecibe,
    nombreEmpaca: cabecera.nombreEmpaca,
    accesorios: cabecera.accesorios,
    nombreRecibeServicio: cabecera.nombreRecibeServicio,
    instrumentos: instrumentos.map((instrumento) => ({
      instrumento: instrumento.instrumento,
      estadoIBC: instrumento.estadoIBC as { salida?: Record<string, unknown> } | null,
      activacion: true,
    })),
  });
  const salidaCompleta = entradaCompleta && pendientesSalida.length === 0;

  if (cabecera.estado === 'ENTREGADO' && !salidaCompleta) {
    throw new AppError(409, 'No se puede cerrar la recepción: faltan datos de salida de uno o más instrumentos.');
  }
  if (cabecera.estado === 'RECIBIDO' && !entradaCompleta) {
    throw new AppError(409, 'No se puede marcar RECIBIDO: complete datos de entrada de todos los instrumentos.');
  }

  if (!entradaCompleta) return 'BORRADOR';
  return salidaCompleta ? 'ENTREGADO' : 'RECIBIDO';
}

/** Nombre del usuario autenticado (para autocompletar NOMBRE_RECIBE). */
function nombreUsuarioActual(request: {
  user?: { name?: string; user?: { nombreCompleto?: string } } | null;
}): string {
  return request.user?.name ?? request.user?.user?.nombreCompleto ?? '';
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
    ID_UNIDAD_FK: inst.idUnidad ?? randomUUID(),
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
    ID_UNIDAD_FK: inst.idUnidad,
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
        where: { VIGENTE: true, activacion: { not: false } },
        include: {
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            orderBy: { ITEM: 'asc' },
            include: { calibraciones: { select: { ID_INSTRUMENTO_FK: true } } },
          },
          cotizaciones: { include: { clientes: true } },
          ordenes_trabajo: {
            include: {
              clientes: true,
              cotizaciones: true,
              orden_trabajo_detalles: {
                where: { OR: [{ activacion: true }, { activacion: null }] },
                include: { usuarios: { select: { NOMBRE_COMPLETO: true } } },
              },
            },
          },
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
            where: { VIGENTE: true, activacion: { not: false } },
            include: {
              recepcion_equipo_detalles: {
                where: { OR: [{ activacion: true }, { activacion: null }] },
                orderBy: { ITEM: 'asc' },
                include: { calibraciones: { select: { ID_INSTRUMENTO_FK: true } } },
              },
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
      preHandler: [
        fastify.authenticate,
        async () => {
          await verificarPlantillasOperativas(fastify.prisma);
        },
      ],
      schema: {
        body: recepcionBodySchema,
        response: { 200: respuestaRecepcionMutacionSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'recepcion_de_equipos', 'registrar');
      const body = request.body;
      const estadoCalculado = calcularEstadoRecepcion(
        body.instrumentos,
        body,
        nombreUsuarioActual(request),
      );
      let instrumentosConId: InstrumentoInput[] = body.instrumentos.map((instrumento) => ({ ...instrumento, idUnidad: randomUUID() }));
      const idUsuario = Number(request.user?.sub ?? 0);

      const recepcion = await fastify.prisma.$transaction(async (tx) => {
        // 1. Resolver o crear la Cotización base
        let cotizacion = body.cotizacionCodigo
          ? await tx.cotizaciones.findFirst({
              where: { CODIGO_COTIZACION: body.cotizacionCodigo },
            })
          : null;

        const cotizacionNueva = !cotizacion;
        if (!cotizacion) {
          const codigoCot = await generarConsecutivo(tx, 'COT');
          cotizacion = await tx.cotizaciones.create({
            data: {
              CODIGO_COTIZACION: codigoCot,
              ID_CLIENTE_FK: body.idCliente ?? null,
              ESTADO: 'BORRADOR',
              MONTO_TOTAL: 0,
            },
          });
        }

        // 2. Resolver o crear la OT homóloga
        let ot = body.ordenTrabajoCodigo
          ? await tx.ordenes_trabajo.findFirst({
              where: { CODIGO_OT: body.ordenTrabajoCodigo },
            })
          : null;

        const otNueva = !ot;
        if (!ot) {
          const codigoOT = await generarConsecutivo(tx, 'OT');
          ot = await tx.ordenes_trabajo.create({
            data: {
              CODIGO_OT: codigoOT,
              ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
              ID_CLIENTE_FK: body.idCliente ?? cotizacion.ID_CLIENTE_FK,
              no_cotizacion: cotizacion.CODIGO_COTIZACION,
              estado: 'Creada',
              orden_trabajo_detalles: {
                create: instrumentosConId.map((inst, idx) => ({
                  ITEM: idx + 1,
                  INSTRUMENTO: inst.instrumento,
                  TIPO_SERVICIO: inst.tipoServicio ?? 'Calibración',
                  FABRICANTE: inst.marca ?? null,
                  MODELO: inst.modelo ?? null,
                  SERIE: inst.serie ?? null,
                  CODIGO_INVENTARIO: inst.codigoInventario ?? null,
                  ID_UNIDAD_FK: inst.idUnidad,
                  asignado: null,
                  activacion: true,
                })),
              },
            },
          });
        }

        // Una recepción nueva puede apuntar a una OT que ya existe (por ejemplo,
        // la OT creada al aprobar una cotización). En ese caso también hay que
        // sincronizar sus instrumentos: crear solo la recepción dejaba la OT sin
        // detalles y la FSM no podía avanzar a En_recepción.
        const detallesOT = await tx.orden_trabajo_detalles.findMany({
          where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
          orderBy: [{ ITEM: 'asc' }, { ID_DETALLE: 'asc' }],
        });
        const detallesOTActivos = detallesOT.filter((detalle) => detalle.activacion !== false);
        const detallesUsados = new Set<number>();
        const detalleAsignadoPorIndice = new Map<number, (typeof detallesOTActivos)[number]>();
        let otCambio = false;

        instrumentosConId = instrumentosConId.map((instrumento, index) => {
          const existente =
            detallesOTActivos.find((detalle) => detalle.ITEM === index + 1 && !detallesUsados.has(detalle.ID_DETALLE)) ??
            detallesOTActivos.find((detalle) => detalle.INSTRUMENTO === instrumento.instrumento && !detallesUsados.has(detalle.ID_DETALLE));
          if (existente) {
            detallesUsados.add(existente.ID_DETALLE);
            detalleAsignadoPorIndice.set(index, existente);
            return { ...instrumento, idUnidad: existente.ID_UNIDAD_FK ?? instrumento.idUnidad };
          }
          return instrumento;
        });

        for (let index = 0; index < instrumentosConId.length; index++) {
          const instrumento = instrumentosConId[index];
          const existente = detalleAsignadoPorIndice.get(index);
          const data = {
            ITEM: index + 1,
            INSTRUMENTO: instrumento.instrumento,
            TIPO_SERVICIO: instrumento.tipoServicio ?? 'Calibración',
            FABRICANTE: instrumento.marca ?? null,
            MODELO: instrumento.modelo ?? null,
            SERIE: instrumento.serie ?? null,
            CODIGO_INVENTARIO: instrumento.codigoInventario ?? null,
            ID_UNIDAD_FK: instrumento.idUnidad,
            activacion: true,
          };
          // Si ya existía, se conserva intacto y solo se comparte su ID de unidad
          // con la recepción. Así la recepción no reescribe datos de una OT
          // vigente (incluidos instrumentos que puedan tener certificados).
          if (!existente) {
            otCambio = true;
            await tx.orden_trabajo_detalles.create({
              data: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO, ...data, asignado: null },
            });
          } else if (instrumento.tipoServicio && existente.TIPO_SERVICIO !== instrumento.tipoServicio) {
            otCambio = true;
            await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: existente.ID_DETALLE }, data: { TIPO_SERVICIO: instrumento.tipoServicio } });
          }
        }

        if (otCambio && !otNueva) {
          await tx.ordenes_trabajo.update({ where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO }, data: { CODIGO_OT: await generarConsecutivo(tx, 'OT', ot.CODIGO_OT) } });
        }

        const otConPadre = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO }, select: { ID_OT_PADRE_FK: true } });
        if (otConPadre?.ID_OT_PADRE_FK) {
          const idMaestra = otConPadre.ID_OT_PADRE_FK;
          const hijosActivos = await tx.orden_trabajo_detalles.findMany({ where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO, OR: [{ activacion: true }, { activacion: null }] } });
          const detallesMaestros = await tx.orden_trabajo_detalles.findMany({ where: { ID_ORDEN_TRABAJO_FK: idMaestra, OR: [{ activacion: true }, { activacion: null }] } });
          let cambioMaestro = false;
          for (const [index, hijo] of hijosActivos.entries()) {
            const maestro = hijo.ID_UNIDAD_FK ? detallesMaestros.find((d) => d.ID_UNIDAD_FK === hijo.ID_UNIDAD_FK) : null;
            if (!maestro) {
              cambioMaestro = true;
              await tx.orden_trabajo_detalles.create({ data: {
                ID_ORDEN_TRABAJO_FK: idMaestra, ITEM: index + 1, INSTRUMENTO: hijo.INSTRUMENTO,
                TIPO_SERVICIO: hijo.TIPO_SERVICIO, FABRICANTE: hijo.FABRICANTE, MODELO: hijo.MODELO,
                SERIE: hijo.SERIE, CODIGO_INVENTARIO: hijo.CODIGO_INVENTARIO, ID_UNIDAD_FK: hijo.ID_UNIDAD_FK,
                asignado: hijo.asignado, activacion: true,
              } });
            } else if (maestro.ITEM !== index + 1 || maestro.INSTRUMENTO !== hijo.INSTRUMENTO || maestro.TIPO_SERVICIO !== hijo.TIPO_SERVICIO || maestro.activacion === false) {
              cambioMaestro = true;
              await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: maestro.ID_DETALLE }, data: { ITEM: index + 1, INSTRUMENTO: hijo.INSTRUMENTO, TIPO_SERVICIO: hijo.TIPO_SERVICIO, activacion: true } });
            }
          }
          if (cambioMaestro) {
            const maestra = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: idMaestra }, select: { CODIGO_OT: true } });
            if (maestra) await tx.ordenes_trabajo.update({ where: { ID_ORDEN_TRABAJO: idMaestra }, data: { CODIGO_OT: await generarConsecutivo(tx, 'OT', maestra.CODIGO_OT) } });
          }
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
            NOMBRE_RECIBE: nombreUsuarioActual(request) || body.nombreRecibe || null,
            NOMBRE_EMPACA: body.nombreEmpaca ?? null,
            NOMBRE_CALIBRA: body.nombreCalibra ?? null,
            NOMBRE_RECIBE_SERVICIO: body.nombreRecibeServicio ?? null,
            ACCESORIOS: body.accesorios ?? null,
            PRUEBAS_COMPLETAS: body.pruebasCompletas ?? true,
            OBSERVACIONES_PRUEBAS: body.observacionesPruebas ?? null,
            ESTADO: estadoCalculado,
            recepcion_equipo_detalles: {
              create: instrumentosConId.map((inst, idx) => mapDetalleCreate(inst, idx + 1)),
            },
          },
          include: REC_INCLUDE,
        });

        const cotizacionCambio = await sincronizarCotizacionDesdeRecepcion(
          tx,
          cotizacion.ID_COTIZACION,
          instrumentosConId.map((instrumento) => ({ instrumento: instrumento.instrumento, idUnidad: instrumento.idUnidad, tipoServicio: instrumento.tipoServicio })),
          normalizarSitio(body.sitioCalibracion),
        );
        if (cotizacionCambio && !cotizacionNueva) {
          await tx.cotizaciones.update({ where: { ID_COTIZACION: cotizacion.ID_COTIZACION }, data: { CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT', cotizacion.CODIGO_COTIZACION) } });
        }

        await evaluarTransicionesOT(tx, ot.ID_ORDEN_TRABAJO);
        await cerrarSeguimientoSiCompleto(tx, cotizacion.ID_COTIZACION, idUsuario || null);

        await registrarBitacora(tx, {
          action: 'CREATE',
          tableName: 'recepciones_equipo',
          recordId: nueva.ID_RECEPCION,
          userId: idUsuario,
          ip: request.ip,
          details: {
            codigo: nueva.CODIGO_RECEPCION,
            idCotizacion: cotizacion.ID_COTIZACION,
            idOrdenTrabajo: ot.ID_ORDEN_TRABAJO,
          },
        });

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
      if (recepcion.ID_COTIZACION_FK) {
        const jobCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await getGenerationExcelQueue().add('generar_cotizacion_desde_recepcion', {
          tipo: 1, id_registro: recepcion.ID_COTIZACION_FK, codigo_actual: null,
          tipo_entry: 'prod', id_job: jobCot.id, id_usuario: idUsuario,
        });
      }

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
      assertPermission(request, 'recepcion_de_equipos', 'registrar');
      const { id } = request.params;
      const body = request.body;
      const estadoCalculado = calcularEstadoRecepcion(
        body.instrumentos,
        body,
        nombreUsuarioActual(request),
      );
      const idUsuario = Number(request.user?.sub ?? 0);
      let generarRecDoc = false;
      let generarOtDoc = false;
      let generarCotDoc = false;
      let generarMaestroDoc = false;

      const recepcion = await fastify.prisma.$transaction(async (tx) => {
        const actual = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: { recepcion_equipo_detalles: true },
        });
        if (!actual) throw new AppError(404, 'Recepción no encontrada');

        const detallesActuales = actual.recepcion_equipo_detalles.filter((d) => d.activacion !== false).sort((a, b) => (a.ITEM ?? 0) - (b.ITEM ?? 0));
        const nombreRecibeEfectivo = nombreUsuarioActual(request) || body.nombreRecibe || null;
        const valorEntrada = snapshotEstable({
          cabecera: {
            solicitante: body.solicitante,
            nombreEntrega: body.nombreEntrega,
            sitio: normalizarSitio(body.sitioCalibracion),
            fechaRecepcion: new Date(body.fechaRecepcion),
            fechaSalida: body.fechaSalida ? new Date(body.fechaSalida) : null,
            nombreRecibe: nombreRecibeEfectivo,
            nombreEmpaca: body.nombreEmpaca,
            nombreCalibra: body.nombreCalibra,
            nombreRecibeServicio: body.nombreRecibeServicio,
            accesorios: body.accesorios,
            pruebasCompletas: body.pruebasCompletas ?? true,
            observacionesPruebas: body.observacionesPruebas,
            estado: estadoCalculado,
          },
          instrumentos: body.instrumentos.map((inst) => ({
            idUnidad: inst.idUnidad ?? null,
            idInstrumento: inst.idInstrumento ?? null,
            item: inst.item ?? null,
            instrumento: inst.instrumento,
            marca: inst.marca,
            modelo: inst.modelo,
            serie: inst.serie,
            codigoInventario: inst.codigoInventario,
            resolucion: inst.resolucion,
            sensorInt: inst.sensorInt ?? false,
            sensorExt: inst.sensorExt ?? false,
            estampilla: inst.estampilla,
            observaciones: inst.observaciones,
            estadoIBC: inst.estadoIBC,
          })),
        });
        const valorPersistido = snapshotEstable({
          cabecera: {
            solicitante: actual.SOLICITANTE,
            nombreEntrega: actual.NOMBRE_ENTREGA,
            sitio: normalizarSitio(actual.SITIO_CALIBRACION),
            fechaRecepcion: actual.FECHA_RECEPCION,
            fechaSalida: actual.FECHA_SALIDA,
            nombreRecibe: actual.NOMBRE_RECIBE,
            nombreEmpaca: actual.NOMBRE_EMPACA,
            nombreCalibra: actual.NOMBRE_CALIBRA,
            nombreRecibeServicio: actual.NOMBRE_RECIBE_SERVICIO,
            accesorios: actual.ACCESORIOS,
            pruebasCompletas: actual.PRUEBAS_COMPLETAS,
            observacionesPruebas: actual.OBSERVACIONES_PRUEBAS,
            estado: actual.ESTADO,
          },
          instrumentos: detallesActuales.map((d) => ({
            idUnidad: d.ID_UNIDAD_FK,
            idInstrumento: d.ID_INSTRUMENTO,
            item: d.ITEM,
            instrumento: d.INSTRUMENTO,
            marca: d.MARCA,
            modelo: d.MODELO,
            serie: d.SERIE,
            codigoInventario: d.CODIGO_INVENTARIO,
            resolucion: d.RESOLUCION,
            sensorInt: d.TIPO_SENSOR_TEMP_init ?? false,
            sensorExt: d.TIPO_SENSOR_TEMP_ext ?? false,
            estampilla: d.ESTAMPILLA,
            observaciones: d.OBSERVACIONES,
            estadoIBC: d.ESTADO_IBC,
          })),
        });
        const recepcionCambio = valorEntrada !== valorPersistido;

        if (actual.ID_ORDEN_TRABAJO_FK) {
          await validarIdentidadInstrumentosRecepcion(
            tx,
            actual.ID_ORDEN_TRABAJO_FK,
            actual.recepcion_equipo_detalles.filter((d) => d.activacion !== false),
            body.instrumentos,
          );
        }

        // 1. Nuevo consecutivo versionado de la Recepción
        const nuevoCodigoRec = recepcionCambio ? await generarConsecutivo(tx, 'REC', actual.CODIGO_RECEPCION) : actual.CODIGO_RECEPCION;

        // 2. Cabecera
        await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: id },
          data: {
            ...(recepcionCambio ? { CODIGO_RECEPCION: nuevoCodigoRec } : {}),
            SOLICITANTE: body.solicitante,
            NOMBRE_ENTREGA: body.nombreEntrega ?? null,
            SITIO_CALIBRACION: normalizarSitio(body.sitioCalibracion),
            FECHA_RECEPCION: new Date(body.fechaRecepcion),
            FECHA_SALIDA: body.fechaSalida ? new Date(body.fechaSalida) : null,
            NOMBRE_RECIBE: nombreUsuarioActual(request) || body.nombreRecibe || null,
            NOMBRE_EMPACA: body.nombreEmpaca ?? null,
            NOMBRE_CALIBRA: body.nombreCalibra ?? null,
            NOMBRE_RECIBE_SERVICIO: body.nombreRecibeServicio ?? null,
            ACCESORIOS: body.accesorios ?? null,
            PRUEBAS_COMPLETAS: body.pruebasCompletas ?? true,
            OBSERVACIONES_PRUEBAS: body.observacionesPruebas ?? null,
            ESTADO: estadoCalculado,
          },
        });

        // 3. Sincronizar instrumentos (match por ITEM/posición, soft-delete de sobrantes)
        const existentes = actual.recepcion_equipo_detalles.filter((d) => d.activacion !== false).sort(
          (a, b) => (a.ITEM ?? 0) - (b.ITEM ?? 0) || a.ID_INSTRUMENTO - b.ID_INSTRUMENTO
        );
        const usados = new Set<number>();
        const instrumentosActualizados: InstrumentoInput[] = [];

        for (let i = 0; i < body.instrumentos.length; i++) {
          const inst = body.instrumentos[i];
          const item = i + 1;
          const match =
            (inst.idInstrumento != null
              ? existentes.find((d) => d.ID_INSTRUMENTO === inst.idInstrumento && !usados.has(d.ID_INSTRUMENTO))
              : existentes.find((d) => d.ITEM === item && !usados.has(d.ID_INSTRUMENTO)) ??
                existentes.find((d) => !usados.has(d.ID_INSTRUMENTO)));

          if (match) {
            usados.add(match.ID_INSTRUMENTO);
            const instrumentoActualizado = { ...inst, idUnidad: match.ID_UNIDAD_FK ?? randomUUID() };
            instrumentosActualizados.push(instrumentoActualizado);
            await tx.recepcion_equipo_detalles.update({
              where: { ID_INSTRUMENTO: match.ID_INSTRUMENTO },
              data: mapDetalleUpdate(instrumentoActualizado, item),
            });
          } else {
            const instrumentoActualizado = { ...inst, idUnidad: randomUUID() };
            instrumentosActualizados.push(instrumentoActualizado);
            await tx.recepcion_equipo_detalles.create({
              data: { ID_RECEPCION_FK: id, ...mapDetalleCreate(instrumentoActualizado, item) },
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

          let otCambio = false;
          const idsOTConservados = new Set<number>();

          for (let i = 0; i < instrumentosActualizados.length; i++) {
            const inst = instrumentosActualizados[i];
            const item = i + 1;
            const detalleAnterior = inst.idInstrumento != null
              ? existentes.find((d) => d.ID_INSTRUMENTO === inst.idInstrumento)
              : null;
            const otDet =
              otDetalles.find((d) => d.ID_UNIDAD_FK === inst.idUnidad) ??
              (detalleAnterior ? otDetalles.find((d) => d.ITEM === detalleAnterior.ITEM) : undefined) ??
              (!inst.idInstrumento ? otDetalles.find((d) => d.ITEM === item) : undefined) ??
              otDetalles.find((d) => d.INSTRUMENTO === inst.instrumento);

            if (otDet) {
              // Retener por PK, no por el ID_UNIDAD_FK de la copia cargada
              // antes del UPDATE. Si ese ID era null, comparar la copia vieja
              // abajo podía retirar el mismo detalle que acabamos de reparar.
              idsOTConservados.add(otDet.ID_DETALLE);
              const marca = inst.marca ?? null;
              const modelo = inst.modelo ?? null;
              const serie = inst.serie ?? null;
              const codigoInventario = inst.codigoInventario ?? null;

              const cambio =
                otDet.ITEM !== item ||
                otDet.INSTRUMENTO !== inst.instrumento ||
                otDet.FABRICANTE !== marca ||
                otDet.MODELO !== modelo ||
                otDet.SERIE !== serie ||
                otDet.CODIGO_INVENTARIO !== codigoInventario ||
                (inst.tipoServicio != null && otDet.TIPO_SERVICIO !== inst.tipoServicio) ||
                otDet.ID_UNIDAD_FK !== inst.idUnidad ||
                otDet.activacion === false;

              if (cambio) {
                otCambio = true;
                await tx.orden_trabajo_detalles.update({
                  where: { ID_DETALLE: otDet.ID_DETALLE },
                  data: {
                    ITEM: item,
                    INSTRUMENTO: inst.instrumento,
                    FABRICANTE: marca,
                    MODELO: modelo,
                    SERIE: serie,
                    CODIGO_INVENTARIO: codigoInventario,
                    ...(inst.tipoServicio != null ? { TIPO_SERVICIO: inst.tipoServicio } : {}),
                    ID_UNIDAD_FK: inst.idUnidad,
                    activacion: true,
                  },
                });
              }
            } else {
              // Instrumento nuevo en recepción: crear su detalle en la OT.
              otCambio = true;
              const nuevoDetalleOT = await tx.orden_trabajo_detalles.create({
                data: {
                  ID_ORDEN_TRABAJO_FK: actual.ID_ORDEN_TRABAJO_FK,
                  ITEM: item,
                  INSTRUMENTO: inst.instrumento,
                  TIPO_SERVICIO: inst.tipoServicio ?? 'Calibración',
                  FABRICANTE: inst.marca ?? null,
                  MODELO: inst.modelo ?? null,
                  SERIE: inst.serie ?? null,
                  CODIGO_INVENTARIO: inst.codigoInventario ?? null,
                  ID_UNIDAD_FK: inst.idUnidad,
                  asignado: null,
                  activacion: true,
                },
              });
              idsOTConservados.add(nuevoDetalleOT.ID_DETALLE);
            }
          }

          const idsOTRetirados = otDetalles
            .filter((detalle) => detalle.activacion !== false && !idsOTConservados.has(detalle.ID_DETALLE))
            .map((detalle) => detalle.ID_DETALLE);
          if (idsOTRetirados.length) {
            otCambio = true;
            await tx.orden_trabajo_detalles.updateMany({ where: { ID_DETALLE: { in: idsOTRetirados } }, data: { activacion: false } });
          }

          const otHija = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: actual.ID_ORDEN_TRABAJO_FK },
            select: { ID_OT_PADRE_FK: true },
          });
          if (otHija?.ID_OT_PADRE_FK) {
            const idOtMaestra = otHija.ID_OT_PADRE_FK;
            const detallesMaestros = await tx.orden_trabajo_detalles.findMany({ where: { ID_ORDEN_TRABAJO_FK: idOtMaestra } });
            const idsMaestrosVigentes = new Set<string>();
            let maestroCambio = false;
            for (let i = 0; i < instrumentosActualizados.length; i++) {
              const inst = instrumentosActualizados[i];
              const detalle = detallesMaestros.find((d) => d.ID_UNIDAD_FK === inst.idUnidad);
              if (detalle) {
                idsMaestrosVigentes.add(inst.idUnidad!);
                if (detalle.ITEM !== i + 1 || detalle.INSTRUMENTO !== inst.instrumento || (inst.tipoServicio != null && detalle.TIPO_SERVICIO !== inst.tipoServicio) || detalle.activacion === false) {
                  maestroCambio = true;
                  await tx.orden_trabajo_detalles.update({
                    where: { ID_DETALLE: detalle.ID_DETALLE },
                    data: { ITEM: i + 1, INSTRUMENTO: inst.instrumento, ...(inst.tipoServicio != null ? { TIPO_SERVICIO: inst.tipoServicio } : {}), activacion: true },
                  });
                }
              } else {
                maestroCambio = true;
                idsMaestrosVigentes.add(inst.idUnidad!);
                await tx.orden_trabajo_detalles.create({
                  data: {
                    ID_ORDEN_TRABAJO_FK: idOtMaestra,
                    ITEM: i + 1,
                    INSTRUMENTO: inst.instrumento,
                    TIPO_SERVICIO: inst.tipoServicio ?? 'Calibración',
                    ID_UNIDAD_FK: inst.idUnidad,
                    asignado: null,
                    activacion: true,
                  },
                });
              }
            }
            const retirarMaestros = detallesMaestros
              .filter((d) => d.activacion !== false && (!d.ID_UNIDAD_FK || !idsMaestrosVigentes.has(d.ID_UNIDAD_FK)))
              .map((d) => d.ID_DETALLE);
            if (retirarMaestros.length) {
              maestroCambio = true;
              await tx.orden_trabajo_detalles.updateMany({ where: { ID_DETALLE: { in: retirarMaestros } }, data: { activacion: false } });
            }
            if (maestroCambio) {
              generarMaestroDoc = true;
              const maestra = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: idOtMaestra }, select: { CODIGO_OT: true } });
              if (maestra) {
                const codigo = await generarConsecutivo(tx, 'OT', maestra.CODIGO_OT);
                await tx.ordenes_trabajo.update({ where: { ID_ORDEN_TRABAJO: idOtMaestra }, data: { CODIGO_OT: codigo } });
              }
            }
          }

          // Solo se versiona el consecutivo de la OT si sus datos cambiaron.
          if (otCambio) {
            generarOtDoc = true;
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
          }

          await evaluarTransicionesOT(tx, actual.ID_ORDEN_TRABAJO_FK);
        }

        // 5. Sincronizar la cotización: agrupar por cantidad y recalcular monto.
        if (actual.ID_COTIZACION_FK) {
          const cotizacionCambio = await sincronizarCotizacionDesdeRecepcion(
            tx,
            actual.ID_COTIZACION_FK,
            instrumentosActualizados,
            normalizarSitio(body.sitioCalibracion ?? actual.SITIO_CALIBRACION),
          );
          if (cotizacionCambio) {
            const cot = await tx.cotizaciones.findUnique({ where: { ID_COTIZACION: actual.ID_COTIZACION_FK }, select: { CODIGO_COTIZACION: true } });
            if (cot) await tx.cotizaciones.update({ where: { ID_COTIZACION: actual.ID_COTIZACION_FK }, data: { CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT', cot.CODIGO_COTIZACION) } });
            generarCotDoc = true;
          }
        }
        generarRecDoc = recepcionCambio;

        const final = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: REC_INCLUDE,
        });

        const idCotizacionCierre = actual.ID_COTIZACION_FK ?? (actual.ID_ORDEN_TRABAJO_FK
          ? (await tx.ordenes_trabajo.findUnique({
              where: { ID_ORDEN_TRABAJO: actual.ID_ORDEN_TRABAJO_FK },
              select: { ID_COTIZACION_FK: true },
            }))?.ID_COTIZACION_FK
          : null);
        if (idCotizacionCierre) {
          await cerrarSeguimientoSiCompleto(tx, idCotizacionCierre, idUsuario || null);
        }

        if (generarRecDoc || generarOtDoc || generarCotDoc || generarMaestroDoc) {
          await registrarBitacora(tx, {
            action: 'UPDATE',
            tableName: 'recepciones_equipo',
            recordId: id,
            userId: idUsuario,
            ip: request.ip,
            details: {
              codigo: final!.CODIGO_RECEPCION,
              idCotizacion: actual.ID_COTIZACION_FK,
              idOrdenTrabajo: actual.ID_ORDEN_TRABAJO_FK,
            },
          });
        }

        return final!;
      });

      // Encolar solo los documentos cuyo contenido cambió.
      const excelQueue = getGenerationExcelQueue();
      if (generarRecDoc) {
        const jobRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_recepcion', {
        tipo: 3,
        id_registro: recepcion.ID_RECEPCION,
        codigo_actual: recepcion.CODIGO_RECEPCION,
        tipo_entry: 'prod',
        id_job: jobRec.id,
        id_usuario: idUsuario,
        });
      }
      if (generarOtDoc && recepcion.ID_ORDEN_TRABAJO_FK) {
        const jobOt = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_orden', {
          tipo: 2,
          id_registro: recepcion.ID_ORDEN_TRABAJO_FK,
          codigo_actual: recepcion.ordenes_trabajo?.CODIGO_OT,
          tipo_entry: 'prod',
          id_job: jobOt.id,
          id_usuario: idUsuario,
        });
        const otActual = await fastify.prisma.ordenes_trabajo.findUnique({
          where: { ID_ORDEN_TRABAJO: recepcion.ID_ORDEN_TRABAJO_FK },
          select: { ID_OT_PADRE_FK: true },
        });
        if (generarMaestroDoc && otActual?.ID_OT_PADRE_FK) {
          const otMaestra = await fastify.prisma.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: otActual.ID_OT_PADRE_FK },
            select: { CODIGO_OT: true },
          });
          if (otMaestra) {
            const jobMaestro = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
            await excelQueue.add('actualizacion_orden', {
              tipo: 2,
              id_registro: otActual.ID_OT_PADRE_FK,
              codigo_actual: otMaestra.CODIGO_OT,
              tipo_entry: 'prod',
              id_job: jobMaestro.id,
              id_usuario: idUsuario,
            });
          }
        }
      }
      if (generarCotDoc && recepcion.ID_COTIZACION_FK) {
        const jobCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_cotizacion', { tipo: 1, id_registro: recepcion.ID_COTIZACION_FK, codigo_actual: null, tipo_entry: 'prod', id_job: jobCot.id, id_usuario: idUsuario });
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
        body: softDeleteInstrumentoBodySchema,
        response: { 200: respuestaSoftDeleteSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'recepcion_de_equipos', 'registrar');
      const { id, idInstrumento } = request.params;
      const idUsuario = Number(request.user?.sub ?? 0);
      const ip = request.ip;
      const motivo = request.body?.descripcion ?? null;
      const observaciones = request.body?.observaciones ?? null;
      const aprobo = request.body?.aprobo ?? String(idUsuario);

      let idCotizacionFinal: number | null = null;
      let idOrdenTrabajoFinal: number | null = null;
      let idOTPadreFinal: number | null = null;
      let codigoRecepcion = '';

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
        await validarInstrumentoSinCertificado(tx, detalle.ID_INSTRUMENTO);

        const instrumentosActivos = rec.recepcion_equipo_detalles.filter((d) => d.activacion !== false);
        if (detalle.activacion === false) {
          throw new AppError(404, 'El instrumento ya está desactivado en la recepción');
        }
        if (instrumentosActivos.length <= 1) {
          throw new AppError(409, 'No se puede eliminar el último instrumento activo de una recepción.');
        }

        // 1. Soft delete en Recepción
        await tx.recepcion_equipo_detalles.update({
          where: { ID_INSTRUMENTO: idInstrumento },
          data: { activacion: false },
        });

        // 2. Soft delete en OT
        if (rec.ID_ORDEN_TRABAJO_FK) {
          const otDetPorItem = detalle.ITEM != null
            ? await tx.orden_trabajo_detalles.findFirst({
                where: {
                  ID_ORDEN_TRABAJO_FK: rec.ID_ORDEN_TRABAJO_FK,
                  ITEM: detalle.ITEM,
                  OR: [{ activacion: true }, { activacion: null }],
                },
              })
            : null;
          const otDet = (detalle.ID_UNIDAD_FK
            ? await tx.orden_trabajo_detalles.findFirst({ where: { ID_ORDEN_TRABAJO_FK: rec.ID_ORDEN_TRABAJO_FK, ID_UNIDAD_FK: detalle.ID_UNIDAD_FK } })
            : null) ?? otDetPorItem ?? await tx.orden_trabajo_detalles.findFirst({
            where: {
              ID_ORDEN_TRABAJO_FK: rec.ID_ORDEN_TRABAJO_FK,
              INSTRUMENTO: detalle.INSTRUMENTO,
              OR: [{ activacion: true }, { activacion: null }],
            },
          });
          if (otDet) {
            await tx.orden_trabajo_detalles.update({
              where: { ID_DETALLE: otDet.ID_DETALLE },
              data: { activacion: false },
            });
          }
          const otHija = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: rec.ID_ORDEN_TRABAJO_FK },
            select: { ID_OT_PADRE_FK: true },
          });
          if (otHija?.ID_OT_PADRE_FK) {
            idOTPadreFinal = otHija.ID_OT_PADRE_FK;
            if (detalle.ID_UNIDAD_FK) {
              const detalleMaestro = await tx.orden_trabajo_detalles.findFirst({
                where: { ID_ORDEN_TRABAJO_FK: idOTPadreFinal, ID_UNIDAD_FK: detalle.ID_UNIDAD_FK, OR: [{ activacion: true }, { activacion: null }] },
              });
              if (detalleMaestro) await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: detalleMaestro.ID_DETALLE }, data: { activacion: false } });
            }
            const maestro = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: idOTPadreFinal }, select: { CODIGO_OT: true } });
            if (maestro) await tx.ordenes_trabajo.update({ where: { ID_ORDEN_TRABAJO: idOTPadreFinal }, data: { CODIGO_OT: await generarConsecutivo(tx, 'OT', maestro.CODIGO_OT) } });
          }
        }

        // 3. Sincronizar cotización (agrupar por cantidad + recalcular monto).
        const cotizacionId = rec.ID_COTIZACION_FK;
        if (cotizacionId) {
          const activosRec = await tx.recepcion_equipo_detalles.findMany({
            where: { ID_RECEPCION_FK: id, activacion: { not: false } },
          });
          const detallesCotizacion = await tx.cotizacion_detalles.findMany({ where: { ID_COTIZACION_FK: cotizacionId, activacion: true } });
          await sincronizarCotizacionDesdeRecepcion(
            tx,
            cotizacionId,
            activosRec.map((d) => ({
              instrumento: d.INSTRUMENTO,
              idUnidad: d.ID_UNIDAD_FK,
              tipoServicio: detallesCotizacion.find((linea) => d.ID_UNIDAD_FK && linea.ID_UNIDADES?.includes(d.ID_UNIDAD_FK))?.TIPO_SERVICIO,
            })),
            rec.SITIO_CALIBRACION ?? 'LABORATORIO',
          );
        }

        // 4. Versionar OT y recepción para reflejar el cambio en sus consecutivos.
        if (rec.ID_ORDEN_TRABAJO_FK) {
          const otActual = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: rec.ID_ORDEN_TRABAJO_FK },
            select: { CODIGO_OT: true },
          });
          if (otActual) {
            await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: rec.ID_ORDEN_TRABAJO_FK },
              data: { CODIGO_OT: await generarConsecutivo(tx, 'OT', otActual.CODIGO_OT) },
            });
          }
        }
        codigoRecepcion = await generarConsecutivo(tx, 'REC', rec.CODIGO_RECEPCION);
        await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: id },
          data: { CODIGO_RECEPCION: codigoRecepcion },
        });

        // 4. Auditoría (bitácora compartida)
        await registrarBitacora(tx, {
          action: 'SOFT_DELETE',
          tableName: 'recepcion_equipo_detalles',
          recordId: idInstrumento,
          userId: idUsuario,
          ip,
          details: {
            before: {
              instrumento: detalle.INSTRUMENTO,
              activacion: detalle.activacion,
            },
            after: { activacion: false },
            motivo: motivo ?? 'Sin motivo especificado',
          },
        });

        // 5. Historial de cambios de la cotización (con el motivo capturado)
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
              descripcion:
                motivo ??
                `Eliminación (soft delete) del equipo "${detalle.INSTRUMENTO}" de la recepción ${rec.CODIGO_RECEPCION}.`,
              requiere_validacion_hoja: false,
              observaciones,
              aprobo,
              id_cotizacion: cotizacionId,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });

          // Versionar el consecutivo de la cotización (acción originada en recepción).
          const cotActual = await tx.cotizaciones.findUnique({
            where: { ID_COTIZACION: cotizacionId },
            select: { CODIGO_COTIZACION: true },
          });
          if (cotActual) {
            await tx.cotizaciones.update({
              where: { ID_COTIZACION: cotizacionId },
              data: {
                CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT', cotActual.CODIGO_COTIZACION),
              },
            });
          }
        }

        // 6. Recalcular el estado automático de la OT tras el soft delete.
        if (rec.ID_ORDEN_TRABAJO_FK) {
          await evaluarTransicionesOT(tx, rec.ID_ORDEN_TRABAJO_FK);
        }

        idCotizacionFinal = cotizacionId;
        idOrdenTrabajoFinal = rec.ID_ORDEN_TRABAJO_FK ?? null;
      });

      // 7. Regenerar documentos dependientes (nueva versión visible en Gestión de Clientes).
      const excelQueue = getGenerationExcelQueue();
      if (idCotizacionFinal) {
        const jobCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_cotizacion', {
          tipo: 1,
          id_registro: idCotizacionFinal,
          codigo_actual: null,
          tipo_entry: 'prod',
          id_job: jobCot.id,
          id_usuario: idUsuario,
        });
      }
      if (idOrdenTrabajoFinal) {
        const jobOt = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelQueue.add('actualizacion_orden', {
          tipo: 2,
          id_registro: idOrdenTrabajoFinal,
          codigo_actual: null,
          tipo_entry: 'prod',
          id_job: jobOt.id,
          id_usuario: idUsuario,
        });
      }
      if (idOTPadreFinal) {
        const otMaestra = await fastify.prisma.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: idOTPadreFinal }, select: { CODIGO_OT: true } });
        if (otMaestra) {
          const jobMaestro = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
          await excelQueue.add('actualizacion_orden', {
            tipo: 2,
            id_registro: idOTPadreFinal,
            codigo_actual: otMaestra.CODIGO_OT,
            tipo_entry: 'prod',
            id_job: jobMaestro.id,
            id_usuario: idUsuario,
          });
        }
      }
      const jobRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelQueue.add('actualizacion_recepcion', {
        tipo: 3,
        id_registro: id,
        codigo_actual: codigoRecepcion,
        tipo_entry: 'prod',
        id_job: jobRec.id,
        id_usuario: idUsuario,
      });

      return {
        ok: true as const,
        message: 'Instrumento desactivado (soft delete) en recepción, OT y cotización.',
      };
    }
  );

  // ==========================================================================
  // DELETE (soft) /api/v1/recepciones/:id — Soft delete de la Recepción completa
  // ==========================================================================
  app.delete(
    '/api/v1/recepciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: recepcionParamsSchema,
        body: softDeleteInstrumentoBodySchema.optional(),
        response: { 200: respuestaSoftDeleteSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'recepcion_de_equipos', 'registrar');
      const idUsuario = Number(request.user?.sub ?? 0);
      const ip = request.ip;
      const motivo = request.body?.descripcion ?? null;
      const observaciones = request.body?.observaciones ?? null;
      const aprobo = request.body?.aprobo ?? String(idUsuario);

      await fastify.prisma.$transaction(async (tx) => {
        const rec = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: request.params.id },
        });
        if (!rec) throw new AppError(404, 'Recepción no encontrada');

        const certificadosActivos = await tx.certificados.count({
          where: { calibraciones: { recepcion_equipo_detalles: { ID_RECEPCION_FK: rec.ID_RECEPCION } } },
        });
        if (certificadosActivos) {
          throw new AppError(409, 'No se puede desactivar la recepción completa mientras tenga instrumentos con certificado creado.');
        }

        // Soft delete de la recepción (no se borra físicamente).
        await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: rec.ID_RECEPCION },
          data: { activacion: false, VIGENTE: false },
        });

        await registrarBitacora(tx, {
          action: 'SOFT_DELETE',
          tableName: 'recepciones_equipo',
          recordId: rec.ID_RECEPCION,
          userId: idUsuario,
          ip,
          details: {
            before: { codigo: rec.CODIGO_RECEPCION, activacion: true },
            after: { activacion: false },
            motivo: motivo ?? 'Sin motivo especificado',
          },
        });

        // Trazabilidad sobre la cotización vinculada (si existe).
        if (rec.ID_COTIZACION_FK) {
          const ultimo = await tx.historial_cambios.findFirst({
            where: { id_cotizacion: rec.ID_COTIZACION_FK },
            orderBy: { created_at: 'desc' },
          });
          const nextVersion = parseVersion(ultimo?.numero_version) + 1;
          await tx.historial_cambios.create({
            data: {
              id: crypto.randomUUID(),
              numero_version: `V${nextVersion}`,
              fecha_cambio: new Date(),
              descripcion:
                motivo ?? `Eliminación (soft delete) de la recepción ${rec.CODIGO_RECEPCION}.`,
              requiere_validacion_hoja: false,
              observaciones,
              aprobo,
              id_cotizacion: rec.ID_COTIZACION_FK,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });
        }
      });

      return {
        ok: true as const,
        message: 'Recepción desactivada (soft delete).',
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
