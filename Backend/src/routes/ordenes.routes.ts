import { FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors.js';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  clienteRawToDtoSchema,
  datosInicialesResponseSchema,
  documentoRawToDtoSchema,
  ordenTrabajoRawToDtoSchema,
  rolRawToDtoSchema,
  tarifaRawToDtoSchema,
  usuarioRawToDtoSchema,
  importarOtExcelBodySchema,importarOtExcelResponseSchema,
  consolidarOtBodySchema,
  consolidarOtParamsSchema
} from './ordenes.schemas.js';
import { getimportOT } from '../lib/queue/queue.js';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import {
  evaluarTransicionesOT,
  validarAsignacionPermitida,
} from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { assertPermission } from '../lib/permissions.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';

function parsearFechaHoraCalibracion(fecha?: string | null, hora?: string | null): Date | null {
  if (!fecha) return null;
  const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, anio, mes, dia] = match;
  const resultado = new Date(Number(anio), Number(mes) - 1, Number(dia));
  const horaMatch = hora?.match(/^(\d{2}):(\d{2})$/);
  if (horaMatch) resultado.setHours(Number(horaMatch[1]), Number(horaMatch[2]), 0, 0);
  return resultado;
}

export default async function ordenesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/ordenes/importar-ote',
    {
      preHandler: [
        fastify.authenticate,
        async (request) => {
          assertPermission(request, 'ordenesOt', 'acceso');
          await verificarPlantillasOperativas(fastify.prisma);
        },
      ],
      schema: {
        body: importarOtExcelBodySchema,
        response: { 200: importarOtExcelResponseSchema,500:importarOtExcelResponseSchema },
      },
    },
    async (request, reply) => {
      const { s3KeyTemp, tipoFlujo, idCotizacion } = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      try {
        // Barrido de jobs huérfanos: marca como FAILED los quotes que quedaron
        // PENDING/PROCESSING por un crash del worker (evita registros atascados).
        const UMBRAL_STALE_MS = 30 * 60 * 1000;
        await fastify.prisma.quote.updateMany({
          where: {
            status: { in: ['PENDING', 'PROCESSING'] },
            createdAt: { lt: new Date(Date.now() - UMBRAL_STALE_MS) },
          },
          data: {
            status: 'FAILED',
            data: { error: 'Stale job: superó el tiempo límite de procesamiento.' },
          },
        });

        // 1. Registrar en la tabla de tracking (Polling)
        const quoteJob = await fastify.prisma.quote.create({ 
          data: { status: 'PENDING' } 
        });

        // 2. Despachar al Worker de Ingeniería Inversa
        const mapping= await fastify.prisma.version_plantillas.findMany({where:{ID_PLANTILLA_FK:2},orderBy:{VERSION:'desc'}})
        const map=mapping[0].MAPPING_CONFIG
        const oteQueue = getimportOT();
        await oteQueue.add('importar_ote_job', {
          id_job: quoteJob.id,
          s3KeyTemp,
          mappingConfig: map, // Aquí puedes cargar el JSON de config maestro o pasarlo desde la DB
          id_cotizacion: idCotizacion, // Si es undefined, el Worker creará la cotización
          idUsuario,
          tipoFlujo
        });

        return reply.code(200).send({ 
          ok: true, 
          id_job: quoteJob.id 
        });

      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ ok: false, message: 'Error encolando la importación' });
      }
    }
  );

  app.get(
    '/api/v1/ordenes/datos-iniciales',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: datosInicialesResponseSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'ordenes_de_trabajo', 'ver_listado');
      const [ordenes, clientes, usuarios, roles, tarifas, version] = await Promise.all([
        fastify.prisma.ordenes_trabajo.findMany({
          include: {
            clientes: true,
            cotizaciones: { include: { clientes: true } },
            orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } },
            // El aviso de revisión de la OT se deriva de sus certificados activos,
            // no del ESTADO_REVISION heredado de la cabecera de la OT.
            recepciones_equipo: {
              where: { VIGENTE: true },
              include: {
                recepcion_equipo_detalles: {
                  where: { OR: [{ activacion: true }, { activacion: null }] },
                  include: { calibraciones: { include: { certificados: true } } },
                },
              },
            },
            _count: { select: { orden_trabajo_hijas: true } },
          },
          orderBy: { CREATED_AT: 'desc' },
        }),

        fastify.prisma.clientes.findMany(),

        fastify.prisma.usuarios.findMany({
          omit: { contrase_a: true },
          include: { roles: true },
          where: { elminado: false },
        }),

        fastify.prisma.roles.findMany(),

        fastify.prisma.tarifas.findMany({
          include: { historial_tarifas: true },
        }),

        fastify.prisma.documentos.findMany({
          include: { version_documentos: true },
        }),
      ]);

      return {
        ordenes: ordenes.map((o) => ordenTrabajoRawToDtoSchema.parse(o)),
        clientes: clientes.map((c) => clienteRawToDtoSchema.parse(c)),
        usuarios: usuarios.map((u) => usuarioRawToDtoSchema.parse(u)),
        roles: roles.map((r) => rolRawToDtoSchema.parse(r)),
        tarifas: tarifas.map((t) => tarifaRawToDtoSchema.parse(t)),
        version: version.map((d) => documentoRawToDtoSchema.parse(d)),
      };
    }
  );

  app.put(
    '/api/v1/ordenes/:id/consolidar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: consolidarOtParamsSchema,
        body: consolidarOtBodySchema,
      },
    },
    async (request, reply) => {
      assertPermission(request, 'ordenes_de_trabajo', 'crear_editar');
      const { id } = request.params;
      const data = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      try {
        let quoteJobId: string | undefined;
        let codigoOT: string | undefined;
        let estadoFinal: string | undefined;
        let huboCambioDocumento = false;

        // 1. Transacción para garantizar integridad de BD
        await fastify.prisma.$transaction(async (tx) => {
          const otBase = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: id } });
          if (!otBase) throw new AppError(404, 'Orden de trabajo no encontrada.');
          const existentes = await tx.orden_trabajo_detalles.findMany({
            where: { ID_ORDEN_TRABAJO_FK: id, OR: [{ activacion: true }, { activacion: null }] },
          });
          const activos = existentes.filter((detalle) => detalle.activacion !== false);
          const mismoValor = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
          const sinEdicionInstrumentos = data.instrumentos.length === activos.length && data.instrumentos.every((inst) => {
            if (inst.idDetalle == null) return false;
            const actual = activos.find((detalle) => detalle.ID_DETALLE === inst.idDetalle);
            if (!actual) return false;
            return actual.ITEM === inst.item && actual.TIPO_SERVICIO === inst.tipoServicio &&
              actual.INSTRUMENTO === inst.instrumento && actual.FABRICANTE === inst.fabricante &&
              actual.MODELO === inst.modelo && actual.SERIE === inst.serie &&
              actual.CODIGO_INVENTARIO === inst.codigoInventario && actual.UBICACION === inst.ubicacion &&
              mismoValor(actual.PUNTOS_CALIBRAR, inst.puntosCalibrar ?? []) &&
              actual.UNIDAD === (inst.unidad ?? null) && actual.INTERVALO_RANGO === (inst.intervaloRango ?? null) &&
              actual.RESOLUCION === (inst.resolucion ?? null) &&
              actual.DECLARACION_CONFORMIDAD === inst.declaracionConformidad &&
              actual.LIMITE_CONTROL_EMC === (inst.limiteControlEMC ?? null) &&
              actual.DOC_ESPECIFICACION === (inst.docEspecificacion ?? null) &&
              actual.REGLA_DECISION === (inst.reglaDecision ?? null);
          });
          if (!sinEdicionInstrumentos) {
            throw new AppError(409, 'Los instrumentos se administran desde Cotizaciones y Recepciones; no se pueden crear, eliminar ni editar desde OT.');
          }

          const responsableFinal = data.responsableUsc?.trim() ? data.responsableUsc.trim() : otBase.RESPONSABLE;
          const fechaDiligenciamientoFinal = data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null;
          const fechaCalibracionFinal = parsearFechaHoraCalibracion(data.fechaCalibracion);
          const horaFinal = parsearFechaHoraCalibracion(data.fechaCalibracion, data.horaCalibracion);
          const texto = (value: unknown) => String(value ?? '').trim();
          const fechaMs = (value: Date | null | undefined) => value?.getTime() ?? null;
          const cambioEscalar = texto(otBase.RESPONSABLE) !== texto(responsableFinal) ||
            fechaMs(otBase.FECHA_CALIBRACION_DILIGENCIAMENTO) !== fechaMs(fechaDiligenciamientoFinal) ||
            fechaMs(otBase.FECHA_CALIBRACION) !== fechaMs(fechaCalibracionFinal) ||
            fechaMs(otBase.hora) !== fechaMs(horaFinal) ||
            texto(otBase.PERSONA_CONTACTO) !== texto(data.personaContactar?.trim() || null) ||
            texto(otBase.TELEFONO_CONTACTO) !== texto(data.telefonoCalibracion?.trim() || null) ||
            Boolean(otBase.REQUIERE_ANEXO) !== (data.requiereAnexo === 'Si') ||
            texto(otBase.OBSERVACIONES) !== texto(data.observacionesGenerales);
          const cambioAsignacion = data.instrumentos.some((inst) => {
            const actual = activos.find((detalle) => detalle.ID_DETALLE === inst.idDetalle);
            const asignado = Number(inst.asignado) > 0 ? Number(inst.asignado) : null;
            return actual != null && asignado !== actual.asignado;
          });
          huboCambioDocumento = cambioEscalar || cambioAsignacion;
          
          // A. Actualizar cabecera de la OT
          // NOTA: `estado` ya NO se escribe desde el cliente; lo gobierna la FSM.
          const otActualizada = await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: id },
            data: {
              ...(data.responsableUsc?.trim() ? { RESPONSABLE: data.responsableUsc.trim() } : {}),
              FECHA_CALIBRACION_DILIGENCIAMENTO: data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null,
              FECHA_CALIBRACION: parsearFechaHoraCalibracion(data.fechaCalibracion),
              hora: parsearFechaHoraCalibracion(data.fechaCalibracion, data.horaCalibracion),
              PERSONA_CONTACTO: data.personaContactar?.trim() || null,
              TELEFONO_CONTACTO: data.telefonoCalibracion?.trim() || null,
              REQUIERE_ANEXO: data.requiereAnexo === 'Si',
              OBSERVACIONES: data.observacionesGenerales,
            },
          });

          codigoOT = otActualizada.CODIGO_OT;

          // Recepción asociada a esta OT (resuelta por la OT, ya que puede
          // existir más de una recepción por cotización: lab / sitio).
          const recepcionAsociada = await tx.recepciones_equipo.findFirst({
            where: { ID_ORDEN_TRABAJO_FK: id },
          });

          const usados = new Set<number>();

          // B. Procesar Instrumentos (crear / actualizar) y Sincronizar Recepción
          for (const inst of data.instrumentos) {
            const asignadoFinal = Number(inst.asignado) > 0 ? Number(inst.asignado) : null;

            const campos = {
              ITEM: inst.item,
              TIPO_SERVICIO: inst.tipoServicio,
              INSTRUMENTO: inst.instrumento,
              FABRICANTE: inst.fabricante,
              MODELO: inst.modelo,
              SERIE: inst.serie,
              CODIGO_INVENTARIO: inst.codigoInventario,
              UBICACION: inst.ubicacion,
              PUNTOS_CALIBRAR: inst.puntosCalibrar ?? [],
              UNIDAD: inst.unidad ?? null,
              INTERVALO_RANGO: inst.intervaloRango ?? null,
              RESOLUCION: inst.resolucion ?? null,
              DECLARACION_CONFORMIDAD: inst.declaracionConformidad,
              LIMITE_CONTROL_EMC: inst.limiteControlEMC ?? null,
              DOC_ESPECIFICACION: inst.docEspecificacion ?? null,
              REGLA_DECISION: inst.reglaDecision ?? null,
              asignado: asignadoFinal,
              activacion: true,
            };

            if (inst.idDetalle) {
              // Guard Clause: bloquear cambio de técnico si ya hay instrumentos calibrados.
              const detalleActual = existentes.find((d) => d.ID_DETALLE === inst.idDetalle);
              const tecnicoCambia =
                detalleActual != null && asignadoFinal !== detalleActual.asignado;
              if (tecnicoCambia) {
                assertPermission(request, 'ordenes_de_trabajo', 'asignar_tecnico');
                await validarAsignacionPermitida(tx, id);
              }

              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: inst.idDetalle },
                data: campos,
              });
              usados.add(inst.idDetalle);
            } else {
              // Instrumento nuevo agregado en el formulario de la OT
              if (asignadoFinal != null) {
                assertPermission(request, 'ordenes_de_trabajo', 'asignar_tecnico');
              }
              const nuevo = await tx.orden_trabajo_detalles.create({
                data: { ID_ORDEN_TRABAJO_FK: id, ...campos },
              });
              usados.add(nuevo.ID_DETALLE);
            }

            // C. Sincronización Espejo con Recepción (crear si no existe)
            if (recepcionAsociada) {
              const recDet = await tx.recepcion_equipo_detalles.findFirst({
                where: {
                  ID_RECEPCION_FK: recepcionAsociada.ID_RECEPCION,
                  OR: [
                    { ITEM: inst.item },
                    { ITEM: null, INSTRUMENTO: inst.instrumento },
                  ],
                },
              });

              const mirrorData = {
                ITEM: inst.item,
                INSTRUMENTO: inst.instrumento,
                MARCA: inst.fabricante,
                MODELO: inst.modelo,
                SERIE: inst.serie,
                CODIGO_INVENTARIO: inst.codigoInventario,
                RESOLUCION: inst.resolucion ?? null,
                activacion: true,
              };

              if (recDet) {
                await tx.recepcion_equipo_detalles.update({
                  where: { ID_INSTRUMENTO: recDet.ID_INSTRUMENTO },
                  data: mirrorData,
                });
              } else {
                await tx.recepcion_equipo_detalles.create({
                  data: { ID_RECEPCION_FK: recepcionAsociada.ID_RECEPCION, ...mirrorData },
                });
              }
            }
          }

          // D. Soft delete (activacion=false) de instrumentos removidos en la OT
          for (const d of existentes) {
            if (!usados.has(d.ID_DETALLE) && d.activacion !== false) {
              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: d.ID_DETALLE },
                data: { activacion: false },
              });
            }
          }

          // E. Recalcular el estado automático de la OT (FSM) tras aplicar los cambios.
          const fsm = await evaluarTransicionesOT(tx, id);
          estadoFinal = fsm.estadoNuevo;

          if (huboCambioDocumento) {
            await registrarBitacora(tx, {
              action: 'UPDATE',
              tableName: 'ordenes_trabajo',
              recordId: id,
              userId: idUsuario,
              ip: request.ip,
              details: {
                codigo: otActualizada.CODIGO_OT,
                estadoAnterior: otActualizada.estado,
                estadoNuevo: estadoFinal,
              },
            });
          }

          // 2. Registrar el tracker de generación documental (dentro de la tx)
          if (huboCambioDocumento) {
            const nuevoCodigo = await generarConsecutivo(tx, 'OT', otActualizada.CODIGO_OT);
            const versionada = await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: id },
              data: { CODIGO_OT: nuevoCodigo },
            });
            codigoOT = versionada.CODIGO_OT;
            const quoteJob = await tx.quote.create({ data: { status: 'PENDING' } });
            quoteJobId = quoteJob.id;
          }
        });

        if (!huboCambioDocumento || !quoteJobId) {
          return reply.code(200).send({ ok: true, message: 'No había cambios documentales; no se generó una nueva versión.', estado: estadoFinal });
        }

        // 3. Encolar el Worker de Generación R-CM05 (Tipo 2 = OT) DESPUÉS del commit.
        const excelQueue = getGenerationExcelQueue();
        await excelQueue.add('generar_ot_consolidada', {
          tipo: 2,
          id_registro: id,
          codigo_actual: codigoOT,
          tipo_entry: 'prod',
          id_job: quoteJobId,
          id_usuario: idUsuario,
        });

        return reply.code(200).send({ 
          ok: true, 
          message: 'Orden consolidada y encolada para generación documental',
          id_job: quoteJobId,
          estado: estadoFinal,
        });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ ok: false, message: 'Error consolidando la Orden de Trabajo' });
      }
    }
  );
}
