import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { assertPermission } from '../lib/permissions.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { evaluarTransicionesOT, vincularUnidadRecepcion } from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { cotizacionDesalineadaConRecepcion, normalizarServicioCotizado, retirarUnidadesDeCotizacion, sincronizarCotizacionDesdeRecepcion } from '../services/cotizacion-sync.service.js';
import {
  validarIdentidadInstrumentosRecepcion,
  validarInstrumentoSinCertificado,
} from '../services/ot-edit-lock.service.js';
import { registrarGeneracionPendiente } from '../services/generacion-pendiente.service.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import { pendientesEntregaSalida } from '../services/recepcion-entrega.service.js';
import { datosSitioOT, sincronizarOTMaestraDesdeRecepcion } from '../services/recepcion-ot-sync.service.js';
import { cerrarSeguimientoSiCompleto, cotizacionListaParaSeguimiento } from '../services/seguimiento-cierre.service.js';
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
  cotizaciones: { include: {
    clientes: true,
    cotizacion_detalles: { where: { activacion: true }, orderBy: { ID_DETALLE: 'asc' } },
  } },
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

async function validarRecepcionEditable(tx: Prisma.TransactionClient, recepcion: {
  ID_RECEPCION: number;
  CODIGO_RECEPCION: string;
  VIGENTE: boolean;
  activacion: boolean;
  ID_COTIZACION_FK: number | null;
}) {
  if (recepcion.ID_COTIZACION_FK) {
    await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${recepcion.ID_COTIZACION_FK} FOR UPDATE`;
  }
  const [vigente] = await tx.$queryRaw<{ CODIGO_RECEPCION: string; VIGENTE: boolean; activacion: boolean }[]>
    `SELECT "CODIGO_RECEPCION", "VIGENTE", activacion FROM recepciones_equipo
      WHERE "ID_RECEPCION" = ${recepcion.ID_RECEPCION} FOR UPDATE`;
  if (!vigente?.VIGENTE || !vigente.activacion) throw new AppError(409, 'La recepción está desactivada.');
  if (vigente.CODIGO_RECEPCION !== recepcion.CODIGO_RECEPCION) {
    throw new AppError(409, 'La recepción cambió mientras la editabas. Vuelve a abrirla.');
  }
  if (recepcion.ID_COTIZACION_FK && await cotizacionListaParaSeguimiento(tx, recepcion.ID_COTIZACION_FK)) {
    throw new AppError(409, 'La operación ya está cerrada: certificados enviados y recepciones entregadas.');
  }
}

async function reunirUnidadesDelSitio(
  tx: Prisma.TransactionClient,
  idCotizacion: number,
  idRecepcion: number,
  sitio: ReturnType<typeof normalizarSitio>,
  unidades: InstrumentoInput[],
): Promise<InstrumentoInput[]> {
  const otras = await tx.recepciones_equipo.findMany({
    where: {
      ID_COTIZACION_FK: idCotizacion, ID_RECEPCION: { not: idRecepcion }, activacion: true, VIGENTE: true,
      ...(sitio === 'LABORATORIO' ? { OR: [{ SITIO_CALIBRACION: sitio }, { SITIO_CALIBRACION: null }] }
        : { SITIO_CALIBRACION: sitio }),
    },
    select: { recepcion_equipo_detalles: {
      where: { OR: [{ activacion: true }, { activacion: null }] },
      select: { INSTRUMENTO: true, ID_UNIDAD_FK: true },
    } },
  });
  return [...unidades, ...otras.flatMap((recepcion) => recepcion.recepcion_equipo_detalles.map((detalle) => ({
    instrumento: detalle.INSTRUMENTO, idUnidad: detalle.ID_UNIDAD_FK,
  })))];
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

function snapshotIBC(valor: unknown) {
  const objeto = valor && typeof valor === 'object' ? valor as Record<string, unknown> : {};
  const grupo = (estado: unknown) => {
    const campos = estado && typeof estado === 'object' ? estado as Record<string, unknown> : {};
    return ['E', 'T', 'D', 'A'].map((clave) => typeof campos[clave] === 'boolean' ? campos[clave] : null);
  };
  return { entrada: grupo(objeto.entrada ?? objeto), salida: grupo(objeto.salida) };
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
        const codigoCotizacion = rec.cotizaciones?.CODIGO_COTIZACION || '';
        const codigoOT = rec.ordenes_trabajo?.CODIGO_OT || '';

        return {
          idRecepcion: rec.ID_RECEPCION,
          codigo: rec.CODIGO_RECEPCION || `REC-${rec.ID_RECEPCION}`,
          solicitante: rec.SOLICITANTE,
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

  const consultarRecepciones = () => fastify.prisma.recepciones_equipo.findMany({
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
  });

  app.get('/api/v1/recepciones/listado', {
    preHandler: [fastify.authenticate],
    schema: { response: { 200: datosInicialesResponseSchema.shape.recepciones } },
  }, async () => (await consultarRecepciones()).map((recepcion) =>
    recepcionEquipoRawToDtoSchema.parse(recepcion)));

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
          consultarRecepciones(),
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

      const sitio = normalizarSitio(body.sitioCalibracion);
      const documentosOT = new Set<number>();
      let generarCotizacion = false;
      const { recepcion, job } = await fastify.prisma.$transaction(async (tx) => {
        const codigoCotizacion = body.cotizacionCodigo?.trim();
        const codigoOTSolicitada = body.ordenTrabajoCodigo?.trim();
        let ot = codigoOTSolicitada ? await tx.ordenes_trabajo.findUnique({
          where: { CODIGO_OT: codigoOTSolicitada },
        }) : null;
        if (codigoOTSolicitada && !ot) throw new AppError(404, 'La OT indicada no existe.');

        let cotizacion = codigoCotizacion ? await tx.cotizaciones.findUnique({
          where: { CODIGO_COTIZACION: codigoCotizacion },
        }) : ot?.ID_COTIZACION_FK ? await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: ot.ID_COTIZACION_FK },
        }) : null;
        if (codigoCotizacion && !cotizacion) throw new AppError(404, 'La cotización indicada no existe.');
        if (ot && (!cotizacion || ot.ID_COTIZACION_FK !== cotizacion.ID_COTIZACION)) {
          throw new AppError(409, 'La OT indicada no pertenece a la cotización.');
        }
        if (cotizacion && (cotizacion.ESTADO === 'RECHAZADA' || cotizacion.ESTADO === 'EN_SEGUIMIENTO' ||
            await cotizacionListaParaSeguimiento(tx, cotizacion.ID_COTIZACION))) {
          throw new AppError(409, 'La cotización está cerrada y no admite otra recepción.');
        }

        const cotizacionNueva = !cotizacion;
        if (!cotizacion) {
          cotizacion = await tx.cotizaciones.create({
            data: {
              CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT'),
              ID_CLIENTE_FK: body.idCliente ?? null,
              ESTADO: 'BORRADOR',
              MONTO_TOTAL: 0,
            },
          });
        }

        await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${cotizacion.ID_COTIZACION} FOR UPDATE`;
        const familia = await tx.ordenes_trabajo.findMany({
          where: { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, VIGENTE: true },
        });
        const maestros = new Set(familia.map((orden) => orden.ID_OT_PADRE_FK).filter((id) => id != null));
        const sitiosInferidos = new Map<number, ReturnType<typeof normalizarSitio>>();
        const gruposAnteriores = familia.filter((orden) => !maestros.has(orden.ID_ORDEN_TRABAJO));
        for (const orden of gruposAnteriores) {
          if (orden.SITIO_CALIBRACION != null) continue;
          const recepcionAnterior = await tx.recepciones_equipo.findFirst({
            where: { ID_ORDEN_TRABAJO_FK: orden.ID_ORDEN_TRABAJO, VIGENTE: true, activacion: true },
            select: { SITIO_CALIBRACION: true },
          });
          sitiosInferidos.set(orden.ID_ORDEN_TRABAJO, recepcionAnterior?.SITIO_CALIBRACION ??
            (orden.ES_EN_SITIO ? 'CLIENTE' : orden.ES_INTERNO_USC ? 'INTERNO_USC' : 'LABORATORIO'));
        }
        if (ot) ot = familia.find((orden) => orden.ID_ORDEN_TRABAJO === ot?.ID_ORDEN_TRABAJO) ?? ot;
        else ot = gruposAnteriores.find((orden) => (orden.SITIO_CALIBRACION ?? sitiosInferidos.get(orden.ID_ORDEN_TRABAJO)) === sitio) ?? null;
        if (ot && (!ot.VIGENTE || ot.estado === 'Certificado_enviado' ||
            ((ot.SITIO_CALIBRACION ?? sitiosInferidos.get(ot.ID_ORDEN_TRABAJO) ?? sitio) !== sitio) ||
            familia.some((orden) => orden.ID_OT_PADRE_FK === ot?.ID_ORDEN_TRABAJO))) {
          throw new AppError(409, 'La OT no es una orden operativa disponible para este sitio.');
        }
        const otId = ot?.ID_ORDEN_TRABAJO;
        const existente = await tx.recepciones_equipo.findFirst({
          where: {
            VIGENTE: true,
            activacion: true,
            OR: [
              { ID_COTIZACION_FK: cotizacion.ID_COTIZACION, SITIO_CALIBRACION: sitio },
              ...(otId ? [{ ID_ORDEN_TRABAJO_FK: otId }] : []),
            ],
          },
          select: { CODIGO_RECEPCION: true },
        });
        if (existente) throw new AppError(409, `El grupo ya tiene una recepción vigente. Abre ${existente.CODIGO_RECEPCION} para editarla.`);

        if (ot && await tx.calibraciones.count({
          where: { recepcion_equipo_detalles: { recepciones_equipo: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO } } },
        })) {
          throw new AppError(409, 'La OT tiene calibraciones en su historial y no admite otra recepción desde este formulario.');
        }

        const otNueva = !ot;
        if (!ot) {
          ot = await tx.ordenes_trabajo.create({
            data: {
              CODIGO_OT: await generarConsecutivo(tx, 'OT'),
              ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
              ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
              no_cotizacion: cotizacion.CODIGO_COTIZACION,
              estado: 'Creada',
              ...datosSitioOT(sitio),
            },
          });
        }

        // Una recepción nueva puede apuntar a una OT que ya existe (por ejemplo,
        // la OT creada al aprobar una cotización). En ese caso también hay que
        // sincronizar sus instrumentos: crear solo la recepción dejaba la OT sin
        // detalles y la FSM no podía avanzar a En_recepción.
        const detallesOT = await tx.orden_trabajo_detalles.findMany({
          where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO, OR: [{ activacion: true }, { activacion: null }] },
          orderBy: [{ ITEM: 'asc' }, { ID_DETALLE: 'asc' }],
        });
        const usados = new Set<number>();
        let otCambio = ot.SITIO_CALIBRACION !== sitio;
        for (const [indice, instrumento] of instrumentosConId.entries()) {
          const item = indice + 1;
          const candidatos = detallesOT.filter((detalle) => !usados.has(detalle.ID_DETALLE) &&
            detalle.INSTRUMENTO.trim().toLowerCase() === instrumento.instrumento.trim().toLowerCase());
          const anterior = candidatos.find((detalle) => detalle.ITEM === item) ??
            (candidatos.length === 1 ? candidatos[0] : undefined);
          const idUnidad = anterior?.ID_UNIDAD_FK ?? instrumento.idUnidad;
          instrumentosConId[indice] = { ...instrumento, idUnidad, tipoServicio: instrumento.tipoServicio ?? anterior?.TIPO_SERVICIO };
          const datos = {
            ITEM: item,
            INSTRUMENTO: instrumento.instrumento,
            TIPO_SERVICIO: instrumento.tipoServicio ?? anterior?.TIPO_SERVICIO ?? 'Calibración',
            FABRICANTE: instrumento.marca ?? null,
            MODELO: instrumento.modelo ?? null,
            SERIE: instrumento.serie ?? null,
            CODIGO_INVENTARIO: instrumento.codigoInventario ?? null,
            RESOLUCION: instrumento.resolucion ?? null,
            ID_UNIDAD_FK: idUnidad,
            activacion: true,
          };
          if (!anterior) {
            await tx.orden_trabajo_detalles.create({ data: { ...datos, ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO } });
            otCambio = true;
          } else {
            usados.add(anterior.ID_DETALLE);
            if (Object.entries(datos).some(([campo, valor]) => anterior[campo as keyof typeof datos] !== valor)) {
              await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: anterior.ID_DETALLE }, data: datos });
              otCambio = true;
            }
          }
        }
        const retirar = detallesOT.filter((detalle) => !usados.has(detalle.ID_DETALLE));
        if (retirar.length) {
          await tx.orden_trabajo_detalles.updateMany({
            where: { ID_DETALLE: { in: retirar.map((detalle) => detalle.ID_DETALLE) } },
            data: { activacion: false },
          });
          otCambio = true;
        }
        if (otNueva || otCambio) {
          if (!otNueva) await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
            data: { ...datosSitioOT(sitio), CODIGO_OT: await generarConsecutivo(tx, 'OT', ot.CODIGO_OT) },
          });
          documentosOT.add(ot.ID_ORDEN_TRABAJO);
        }

        const otrosGrupos = familia.filter((orden) => orden.ID_ORDEN_TRABAJO !== ot?.ID_ORDEN_TRABAJO &&
          (orden.SITIO_CALIBRACION != null || !familia.some((hija) => hija.ID_OT_PADRE_FK === orden.ID_ORDEN_TRABAJO)));
        if (otrosGrupos.length > 0 && (otNueva || ot.ID_OT_PADRE_FK != null)) {
          const maestraVigente = familia.find((orden) => maestros.has(orden.ID_ORDEN_TRABAJO));
          const maestra = maestraVigente ?? await tx.ordenes_trabajo.create({
              data: {
                CODIGO_OT: await generarConsecutivo(tx, 'OT'),
                ID_CLIENTE_FK: cotizacion.ID_CLIENTE_FK,
                ID_COTIZACION_FK: cotizacion.ID_COTIZACION,
                no_cotizacion: cotizacion.CODIGO_COTIZACION,
              },
            });
          await tx.ordenes_trabajo.updateMany({
            where: { ID_ORDEN_TRABAJO: { in: [ot.ID_ORDEN_TRABAJO, ...otrosGrupos.map((orden) => orden.ID_ORDEN_TRABAJO)] } },
            data: { ID_OT_PADRE_FK: maestra.ID_ORDEN_TRABAJO, ID_OT_RAIZ: maestra.ID_ORDEN_TRABAJO },
          });
          if (await sincronizarOTMaestraDesdeRecepcion(tx, maestra.ID_ORDEN_TRABAJO, !maestraVigente)) {
            documentosOT.add(maestra.ID_ORDEN_TRABAJO);
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
            SITIO_CALIBRACION: sitio,
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
          sitio,
        );
        generarCotizacion = cotizacionNueva || cotizacionCambio;
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

        const job = await registrarGeneracionPendiente(tx, 'generar_recepcion', {
          tipo: 3,
          id_registro: nueva.ID_RECEPCION,
          codigo_actual: nueva.CODIGO_RECEPCION,
          tipo_entry: 'prod',
          id_usuario: idUsuario,
        });
        for (const idOT of documentosOT) {
          await registrarGeneracionPendiente(tx, 'generar_orden_desde_recepcion', {
            tipo: 2, id_registro: idOT, tipo_entry: 'prod', id_usuario: idUsuario,
          });
        }
        if (generarCotizacion && nueva.ID_COTIZACION_FK) {
          await registrarGeneracionPendiente(tx, 'generar_cotizacion_desde_recepcion', {
            tipo: 1, id_registro: nueva.ID_COTIZACION_FK, codigo_actual: null,
            tipo_entry: 'prod', id_usuario: idUsuario,
          });
        }

        return { recepcion: nueva, job };
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
  // GET /api/v1/recepciones/:id — Lectura autoritativa para abrir el formulario
  // ==========================================================================
  app.get(
    '/api/v1/recepciones/:id',
    {
      preHandler: [fastify.authenticate],
      schema: { params: recepcionParamsSchema },
    },
    async (request) => {
      const recepcion = await fastify.prisma.recepciones_equipo.findUnique({
        where: { ID_RECEPCION: request.params.id },
        include: REC_INCLUDE,
      });
      if (!recepcion) throw new AppError(404, 'Recepción no encontrada');
      return {
        ok: true as const,
        data: recepcionEquipoRawToDtoSchema.parse(recepcion),
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
        await validarRecepcionEditable(tx, actual);
        if (body.codigoRecepcionActual && body.codigoRecepcionActual !== actual.CODIGO_RECEPCION) {
          throw new AppError(409, 'La recepción tiene una versión más reciente. Vuelve a abrirla antes de guardar.');
        }
        const otDetalles = actual.ID_ORDEN_TRABAJO_FK ? await tx.orden_trabajo_detalles.findMany({
          where: { ID_ORDEN_TRABAJO_FK: actual.ID_ORDEN_TRABAJO_FK },
        }) : [];
        const sitioAnterior = normalizarSitio(actual.SITIO_CALIBRACION);
        const sitio = body.sitioCalibracion?.trim() ? normalizarSitio(body.sitioCalibracion) : sitioAnterior;
        if (sitio !== sitioAnterior && (actual.ID_ORDEN_TRABAJO_FK || actual.ID_COTIZACION_FK)) {
          throw new AppError(409, 'El sitio identifica al grupo de esta recepción. Cambia el sitio por instrumento en la cotización para reorganizar los grupos.');
        }

        const lineasCotizadas = actual.ID_COTIZACION_FK ? await tx.cotizacion_detalles.findMany({
          where: { ID_COTIZACION_FK: actual.ID_COTIZACION_FK, activacion: true },
          select: { ID_UNIDADES: true, TIPO_SERVICIO: true },
        }) : [];
        const servicioPorUnidad = new Map(lineasCotizadas.flatMap((linea) =>
          linea.ID_UNIDADES.map((id): [string, string] => [id, linea.TIPO_SERVICIO])));

        const detallesActuales = actual.recepcion_equipo_detalles.filter((d) => d.activacion !== false).sort((a, b) => (a.ITEM ?? 0) - (b.ITEM ?? 0));
        const nombreRecibeEfectivo = actual.NOMBRE_RECIBE || nombreUsuarioActual(request) || body.nombreRecibe || null;
        const porId = new Map(detallesActuales.map((detalle) => [detalle.ID_INSTRUMENTO, detalle]));
        const idsRecibidos = body.instrumentos.flatMap((inst) => inst.idInstrumento == null ? [] : [inst.idInstrumento]);
        if (new Set(idsRecibidos).size !== idsRecibidos.length || idsRecibidos.some((id) => !porId.has(id))) {
          throw new AppError(409, 'Hay instrumentos repetidos o que ya no pertenecen a esta recepción. Vuelve a abrirla.');
        }
        const valorEntrada = snapshotEstable({
          cabecera: {
            solicitante: body.solicitante,
            nombreEntrega: body.nombreEntrega,
            sitio,
            fechaRecepcion: new Date(body.fechaRecepcion).toISOString().slice(0, 10),
            fechaSalida: body.fechaSalida ? new Date(body.fechaSalida).toISOString().slice(0, 10) : null,
            nombreRecibe: nombreRecibeEfectivo,
            nombreEmpaca: body.nombreEmpaca,
            nombreCalibra: body.nombreCalibra,
            nombreRecibeServicio: body.nombreRecibeServicio,
            accesorios: body.accesorios,
            pruebasCompletas: body.pruebasCompletas ?? true,
            observacionesPruebas: body.observacionesPruebas,
            estado: estadoCalculado,
          },
          instrumentos: body.instrumentos.map((inst, indice) => ({
            idUnidad: inst.idInstrumento == null ? null : porId.get(inst.idInstrumento)?.ID_UNIDAD_FK,
            idInstrumento: inst.idInstrumento ?? null,
            item: indice + 1,
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
            estadoIBC: snapshotIBC(inst.estadoIBC),
          })),
        });
        const valorPersistido = snapshotEstable({
          cabecera: {
            solicitante: actual.SOLICITANTE,
            nombreEntrega: actual.NOMBRE_ENTREGA,
            sitio: sitioAnterior,
            fechaRecepcion: actual.FECHA_RECEPCION.toISOString().slice(0, 10),
            fechaSalida: actual.FECHA_SALIDA?.toISOString().slice(0, 10),
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
            estadoIBC: snapshotIBC(d.ESTADO_IBC),
          })),
        });
        const repararIdentidades = detallesActuales.some((detalle) => !detalle.ID_UNIDAD_FK);
        const recepcionCambio = valorEntrada !== valorPersistido || repararIdentidades;
        let requiereSyncComercial = repararIdentidades || sitio !== sitioAnterior ||
          idsRecibidos.length !== detallesActuales.length || idsRecibidos.length !== body.instrumentos.length ||
          body.instrumentos.some((inst) => {
            const previo = inst.idInstrumento == null ? undefined : porId.get(inst.idInstrumento);
            return previo != null && previo.INSTRUMENTO.trim() !== inst.instrumento.trim();
          });
        const otVinculada = actual.ID_ORDEN_TRABAJO_FK ? await tx.ordenes_trabajo.findUnique({
          where: { ID_ORDEN_TRABAJO: actual.ID_ORDEN_TRABAJO_FK },
          select: { estado: true },
        }) : null;
        if (otVinculada?.estado === 'Certificado_enviado' &&
            (idsRecibidos.length !== detallesActuales.length || idsRecibidos.length !== body.instrumentos.length)) {
          throw new AppError(409, 'Los certificados de esta OT ya fueron enviados. Puedes completar la salida de los equipos actuales.');
        }

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
        if (recepcionCambio) await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: id },
          data: {
            ...(recepcionCambio ? { CODIGO_RECEPCION: nuevoCodigoRec } : {}),
            SOLICITANTE: body.solicitante,
            NOMBRE_ENTREGA: body.nombreEntrega ?? null,
            SITIO_CALIBRACION: sitio,
            FECHA_RECEPCION: new Date(body.fechaRecepcion),
            FECHA_SALIDA: body.fechaSalida ? new Date(body.fechaSalida) : null,
            NOMBRE_RECIBE: actual.NOMBRE_RECIBE || nombreUsuarioActual(request) || body.nombreRecibe || null,
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
          const match = inst.idInstrumento == null ? undefined : porId.get(inst.idInstrumento);

          if (match) {
            usados.add(match.ID_INSTRUMENTO);
            const unidadOT = vincularUnidadRecepcion(match, otDetalles.filter((detalle) => detalle.activacion !== false));
            const instrumentoActualizado = { ...inst, idUnidad: match.ID_UNIDAD_FK ?? unidadOT?.ID_UNIDAD_FK ?? randomUUID() };
            instrumentosActualizados.push(instrumentoActualizado);
            if (recepcionCambio) await tx.recepcion_equipo_detalles.update({
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
          await registrarBitacora(tx, {
            action: 'SOFT_DELETE',
            tableName: 'recepcion_equipo_detalles',
            recordId: d.ID_INSTRUMENTO,
            userId: idUsuario,
            ip: request.ip,
            details: { idUnidad: d.ID_UNIDAD_FK, idRecepcion: id, codigoRecepcion: nuevoCodigoRec,
              motivo: 'Instrumento retirado al consolidar la recepción.' },
          });
        }

        // 4. Sincronizar campos compartidos hacia la OT homóloga + versionar OT
        if (actual.ID_ORDEN_TRABAJO_FK) {
          let otCambio = false;
          const idsOTConservados = new Set<number>();

          for (let i = 0; i < instrumentosActualizados.length; i++) {
            const inst = instrumentosActualizados[i];
            const item = i + 1;
            const detalleAnterior = inst.idInstrumento != null
              ? existentes.find((d) => d.ID_INSTRUMENTO === inst.idInstrumento)
              : null;
            const disponibles = otDetalles.filter((d) => !idsOTConservados.has(d.ID_DETALLE));
            const otDet = detalleAnterior
              ? vincularUnidadRecepcion({ ID_UNIDAD_FK: inst.idUnidad, ITEM: detalleAnterior.ITEM }, disponibles)
              : undefined;

            if (otDet) {
              const cambioServicio = inst.tipoServicio &&
                normalizarServicioCotizado(inst.tipoServicio) !== normalizarServicioCotizado(otDet.TIPO_SERVICIO);
              if (cambioServicio) requiereSyncComercial = true;
              if (!inst.tipoServicio) instrumentosActualizados[i] = {
                ...inst, tipoServicio: servicioPorUnidad.get(inst.idUnidad ?? '') ?? otDet.TIPO_SERVICIO,
              };
              // Retener por PK, no por el ID_UNIDAD_FK de la copia cargada
              // antes del UPDATE. Si ese ID era null, comparar la copia vieja
              // abajo podía retirar el mismo detalle que acabamos de reparar.
              idsOTConservados.add(otDet.ID_DETALLE);
              const marca = inst.marca ?? null;
              const modelo = inst.modelo ?? null;
              const serie = inst.serie ?? null;
              const codigoInventario = inst.codigoInventario ?? null;
              const resolucion = inst.resolucion ?? null;

              const cambio =
                otDet.ITEM !== item ||
                otDet.INSTRUMENTO !== inst.instrumento ||
                otDet.FABRICANTE !== marca ||
                otDet.MODELO !== modelo ||
                otDet.SERIE !== serie ||
                otDet.CODIGO_INVENTARIO !== codigoInventario ||
                otDet.RESOLUCION !== resolucion ||
                cambioServicio ||
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
                    RESOLUCION: resolucion,
                    ...(cambioServicio ? { TIPO_SERVICIO: inst.tipoServicio } : {}),
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
                  RESOLUCION: inst.resolucion ?? null,
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
          if (otCambio && otHija?.ID_OT_PADRE_FK) {
            generarMaestroDoc = await sincronizarOTMaestraDesdeRecepcion(tx, otHija.ID_OT_PADRE_FK);
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

        // Una edición de recepción también puede reparar una agrupación incorrecta anterior.
        if (actual.ID_COTIZACION_FK) {
          const idCotizacion = actual.ID_COTIZACION_FK;
          const unidades = await reunirUnidadesDelSitio(tx, idCotizacion, id, sitio, instrumentosActualizados);
          const desalineada = requiereSyncComercial ||
            await cotizacionDesalineadaConRecepcion(tx, idCotizacion, sitio, unidades);
          if (desalineada && await sincronizarCotizacionDesdeRecepcion(tx, idCotizacion, unidades, sitio)) {
            const cot = await tx.cotizaciones.findUniqueOrThrow({ where: { ID_COTIZACION: idCotizacion } });
            await tx.cotizaciones.update({
              where: { ID_COTIZACION: idCotizacion },
              data: { CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT', cot.CODIGO_COTIZACION) },
            });
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

        if (generarRecDoc) {
          await registrarGeneracionPendiente(tx, 'actualizacion_recepcion', {
          tipo: 3,
          id_registro: final!.ID_RECEPCION,
          codigo_actual: final!.CODIGO_RECEPCION,
          tipo_entry: 'prod',
          id_usuario: idUsuario,
          });
        }
        if (generarOtDoc && final!.ID_ORDEN_TRABAJO_FK) {
          await registrarGeneracionPendiente(tx, 'actualizacion_orden', {
            tipo: 2,
            id_registro: final!.ID_ORDEN_TRABAJO_FK,
            codigo_actual: final!.ordenes_trabajo?.CODIGO_OT,
            tipo_entry: 'prod',
            id_usuario: idUsuario,
          });
          const otActual = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: final!.ID_ORDEN_TRABAJO_FK },
            select: { ID_OT_PADRE_FK: true },
          });
          if (generarMaestroDoc && otActual?.ID_OT_PADRE_FK) {
            const otMaestra = await tx.ordenes_trabajo.findUnique({
              where: { ID_ORDEN_TRABAJO: otActual.ID_OT_PADRE_FK },
              select: { CODIGO_OT: true },
            });
            if (otMaestra) {

              await registrarGeneracionPendiente(tx, 'actualizacion_orden', {
                tipo: 2,
                id_registro: otActual.ID_OT_PADRE_FK,
                codigo_actual: otMaestra.CODIGO_OT,
                tipo_entry: 'prod',
                id_usuario: idUsuario,
              });
            }
          }
        }
        if (generarCotDoc && final!.ID_COTIZACION_FK) {
          await registrarGeneracionPendiente(tx, 'actualizacion_cotizacion', { tipo: 1, id_registro: final!.ID_COTIZACION_FK, codigo_actual: null, tipo_entry: 'prod', id_usuario: idUsuario });
        }

        return final!;
      });

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

      const grupoDesactivado = await fastify.prisma.$transaction(async (tx) => {
        const rec = await tx.recepciones_equipo.findUnique({
          where: { ID_RECEPCION: id },
          include: { recepcion_equipo_detalles: true },
        });
        if (!rec) throw new AppError(404, 'Recepción no encontrada');
        await validarRecepcionEditable(tx, rec);

        const detalle = rec.recepcion_equipo_detalles.find(
          (d) => d.ID_INSTRUMENTO === idInstrumento
        );
        if (!detalle) throw new AppError(404, 'Instrumento no encontrado en la recepción');
        await validarInstrumentoSinCertificado(tx, detalle.ID_INSTRUMENTO);

        const instrumentosActivos = rec.recepcion_equipo_detalles.filter((d) => d.activacion !== false);
        if (detalle.activacion === false) {
          throw new AppError(404, 'El instrumento ya está desactivado en la recepción');
        }
        if (instrumentosActivos.length === 1) {
          const hayOtroGrupo = rec.ID_COTIZACION_FK != null && await tx.recepciones_equipo.count({
            where: { ID_COTIZACION_FK: rec.ID_COTIZACION_FK, ID_RECEPCION: { not: id }, VIGENTE: true, activacion: true },
          }) > 0;
          if (!hayOtroGrupo) throw new AppError(409, 'La recepción debe conservar un instrumento si es el único grupo vigente.');
          await desactivarGrupo(tx, id, {
            idUsuario, ip, motivo: motivo ?? `Se retiró el último instrumento del grupo: ${detalle.INSTRUMENTO}.`,
            observaciones, aprobo,
          });
          return true;
        }

        // 1. Soft delete en Recepción
        await tx.recepcion_equipo_detalles.update({
          where: { ID_INSTRUMENTO: idInstrumento },
          data: { activacion: false },
        });

        // 2. Soft delete en OT
        if (rec.ID_ORDEN_TRABAJO_FK) {
          const otDetalles = await tx.orden_trabajo_detalles.findMany({
            where: { ID_ORDEN_TRABAJO_FK: rec.ID_ORDEN_TRABAJO_FK, OR: [{ activacion: true }, { activacion: null }] },
          });
          const otDet = vincularUnidadRecepcion(detalle, otDetalles);
          if (!otDet) throw new AppError(409, 'No se pudo identificar el instrumento en la OT para retirarlo.');
          await tx.orden_trabajo_detalles.update({
            where: { ID_DETALLE: otDet.ID_DETALLE },
            data: { activacion: false },
          });
          const otHija = await tx.ordenes_trabajo.findUnique({
            where: { ID_ORDEN_TRABAJO: rec.ID_ORDEN_TRABAJO_FK },
            select: { ID_OT_PADRE_FK: true },
          });
          if (otHija?.ID_OT_PADRE_FK && await sincronizarOTMaestraDesdeRecepcion(tx, otHija.ID_OT_PADRE_FK)) {
            idOTPadreFinal = otHija.ID_OT_PADRE_FK;
          }
        }

        const cotizacionId = rec.ID_COTIZACION_FK;
        const sitio = normalizarSitio(rec.SITIO_CALIBRACION);
        const restantes = instrumentosActivos.filter((equipo) => equipo.ID_INSTRUMENTO !== idInstrumento);
        if (cotizacionId && restantes.some((equipo) => !equipo.ID_UNIDAD_FK)) {
          throw new AppError(409, 'Guarda primero la recepción para sincronizar los identificadores de los equipos restantes.');
        }
        const cambioCotizacion = cotizacionId
          ? await sincronizarCotizacionDesdeRecepcion(tx, cotizacionId,
              await reunirUnidadesDelSitio(tx, cotizacionId, id, sitio, restantes.map((equipo) => ({
                instrumento: equipo.INSTRUMENTO, idUnidad: equipo.ID_UNIDAD_FK,
              }))),
              sitio,
            )
          : false;

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
        const estado = calcularEstadoRecepcion(
          restantes.map((equipo) => ({
            instrumento: equipo.INSTRUMENTO,
            marca: equipo.MARCA,
            modelo: equipo.MODELO,
            serie: equipo.SERIE,
            codigoInventario: equipo.CODIGO_INVENTARIO,
            resolucion: equipo.RESOLUCION,
            estadoIBC: equipo.ESTADO_IBC,
          })),
          {
            nombreEntrega: rec.NOMBRE_ENTREGA,
            fechaRecepcion: rec.FECHA_RECEPCION.toISOString(),
            fechaSalida: rec.FECHA_SALIDA?.toISOString(),
            nombreRecibe: rec.NOMBRE_RECIBE,
            nombreEmpaca: rec.NOMBRE_EMPACA,
            accesorios: rec.ACCESORIOS,
            nombreRecibeServicio: rec.NOMBRE_RECIBE_SERVICIO,
          },
          '',
        );
        await tx.recepciones_equipo.update({
          where: { ID_RECEPCION: id },
          data: { CODIGO_RECEPCION: codigoRecepcion, ESTADO: estado },
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
          if (cotActual && cambioCotizacion) {
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

        idCotizacionFinal = cambioCotizacion ? cotizacionId : null;
        idOrdenTrabajoFinal = rec.ID_ORDEN_TRABAJO_FK ?? null;
        if (idCotizacionFinal) {
          await registrarGeneracionPendiente(tx, 'actualizacion_cotizacion', {
            tipo: 1,
            id_registro: idCotizacionFinal,
            codigo_actual: null,
            tipo_entry: 'prod',
            id_usuario: idUsuario,
          });
        }
        if (idOrdenTrabajoFinal) {
          await registrarGeneracionPendiente(tx, 'actualizacion_orden', {
            tipo: 2,
            id_registro: idOrdenTrabajoFinal,
            codigo_actual: null,
            tipo_entry: 'prod',
            id_usuario: idUsuario,
          });
        }
        if (idOTPadreFinal) {
          const otMaestra = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: idOTPadreFinal }, select: { CODIGO_OT: true } });
          if (otMaestra) {

            await registrarGeneracionPendiente(tx, 'actualizacion_orden', {
              tipo: 2,
              id_registro: idOTPadreFinal,
              codigo_actual: otMaestra.CODIGO_OT,
              tipo_entry: 'prod',
              id_usuario: idUsuario,
            });
          }
        }

        await registrarGeneracionPendiente(tx, 'actualizacion_recepcion', {
          tipo: 3,
          id_registro: id,
          codigo_actual: codigoRecepcion,
          tipo_entry: 'prod',
          id_usuario: idUsuario,
        });

        return false;
      });

      return {
        ok: true as const,
        grupoDesactivado,
        message: grupoDesactivado ? 'El instrumento y su grupo se desactivaron.' : 'Instrumento desactivado en recepción, OT y cotización.',
      };
    }
  );

  // ==========================================================================
  // DELETE (soft) /api/v1/recepciones/:id — Soft delete de la Recepción completa
  // ==========================================================================
  async function desactivarGrupo(
    tx: Prisma.TransactionClient,
    idRecepcion: number,
    { idUsuario, ip, motivo, observaciones, aprobo }: {
      idUsuario: number; ip: string; motivo: string | null; observaciones: string | null; aprobo: string;
    },
  ) {
    const rec = await tx.recepciones_equipo.findUnique({
      where: { ID_RECEPCION: idRecepcion },
      include: { recepcion_equipo_detalles: true, ordenes_trabajo: true },
    });
    if (!rec) throw new AppError(404, 'Recepción no encontrada');

    await validarRecepcionEditable(tx, rec);
    const calibraciones = await tx.calibraciones.count({
      where: { recepcion_equipo_detalles: { ID_RECEPCION_FK: rec.ID_RECEPCION } },
    });
    const ot = rec.ordenes_trabajo;
    if (calibraciones || ot?.estado === 'Certificado_enviado') {
      throw new AppError(409, 'No se puede desactivar una recepción con calibración iniciada o certificados enviados.');
    }
    if (ot && await tx.recepciones_equipo.count({
      where: {
        ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
        ID_RECEPCION: { not: rec.ID_RECEPCION },
        VIGENTE: true,
        activacion: true,
      },
    })) {
      throw new AppError(409, 'La OT tiene más de una recepción vigente. Regulariza el grupo antes de desactivarlo.');
    }
    const activos = rec.recepcion_equipo_detalles.filter((equipo) => equipo.activacion !== false);
    if (rec.ID_COTIZACION_FK && activos.some((equipo) => !equipo.ID_UNIDAD_FK)) {
      throw new AppError(409, 'Guarda primero la recepción para sincronizar los identificadores de sus instrumentos.');
    }

    await tx.recepciones_equipo.update({
      where: { ID_RECEPCION: rec.ID_RECEPCION },
      data: { activacion: false, VIGENTE: false },
    });
    await tx.recepcion_equipo_detalles.updateMany({
      where: { ID_RECEPCION_FK: rec.ID_RECEPCION },
      data: { activacion: false },
    });
    let maestraActualizada: number | null = null;
    if (ot) {
      await tx.ordenes_trabajo.update({
        where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
        data: { VIGENTE: false },
      });
      await tx.orden_trabajo_detalles.updateMany({
        where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
        data: { activacion: false },
      });
      if (ot.ID_OT_PADRE_FK && await sincronizarOTMaestraDesdeRecepcion(tx, ot.ID_OT_PADRE_FK)) {
        maestraActualizada = ot.ID_OT_PADRE_FK;
      }
    }
    let cotizacionActualizada: number | null = null;
    if (rec.ID_COTIZACION_FK && await retirarUnidadesDeCotizacion(tx, rec.ID_COTIZACION_FK,
      activos.flatMap((equipo) => equipo.ID_UNIDAD_FK ? [equipo.ID_UNIDAD_FK] : []),
    )) {
      const cotizacion = await tx.cotizaciones.findUniqueOrThrow({ where: { ID_COTIZACION: rec.ID_COTIZACION_FK } });
      await tx.cotizaciones.update({
        where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
        data: { CODIGO_COTIZACION: await generarConsecutivo(tx, 'COT', cotizacion.CODIGO_COTIZACION) },
      });
      cotizacionActualizada = cotizacion.ID_COTIZACION;
    }

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
    const pendientes = [
      { tipo: 1, id: cotizacionActualizada },
      { tipo: 2, id: maestraActualizada },
    ];
    for (const { tipo, id } of pendientes) {
      if (!id) continue;

      await registrarGeneracionPendiente(tx, 'actualizar_documento_al_desactivar_grupo', {
        tipo, id_registro: id, tipo_entry: 'prod', id_usuario: idUsuario,
      });
    }
  }

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

      await fastify.prisma.$transaction((tx) => desactivarGrupo(tx, request.params.id, {
        idUsuario, ip, motivo, observaciones, aprobo,
      }));

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
