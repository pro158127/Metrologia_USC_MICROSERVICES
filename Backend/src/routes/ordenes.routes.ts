import { FastifyInstance } from 'fastify';
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
import {
  evaluarTransicionesOT,
  validarAsignacionPermitida,
} from '../services/ot-fsm.service.js';
export default async function ordenesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post(
    '/api/v1/ordenes/importar-ote',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: importarOtExcelBodySchema,
        response: { 200: importarOtExcelResponseSchema,500:importarOtExcelResponseSchema },
      },
    },
    async (request, reply) => {
      const { s3KeyTemp, tipoFlujo, idCotizacion } = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      try {
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
    async () => {
      const [ordenes, clientes, usuarios, roles, tarifas, version] = await Promise.all([
        fastify.prisma.ordenes_trabajo.findMany({
          include: {
            clientes: true,
            cotizaciones: { include: { clientes: true } },
            orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } },
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
      const { id } = request.params;
      const data = request.body;
      const idUsuario = Number(request.user?.sub ?? 0);

      try {
        let quoteJobId: string | undefined;
        let codigoOT: string | undefined;
        let estadoFinal: string | undefined;

        // 1. Transacción para garantizar integridad de BD
        await fastify.prisma.$transaction(async (tx) => {
          
          // A. Actualizar cabecera de la OT
          // NOTA: `estado` ya NO se escribe desde el cliente; lo gobierna la FSM.
          const otActualizada = await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: id },
            data: {
              RESPONSABLE: data.responsableUsc,
              FECHA_CALIBRACION_DILIGENCIAMENTO: data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null,
              REQUIERE_ANEXO: data.requiereAnexo === 'Si',
              OBSERVACIONES: data.observacionesGenerales,
            },
          });

          codigoOT = otActualizada.CODIGO_OT;

          // Recepción asociada a la misma cotización (si existe)
          const recepcionAsociada = otActualizada.ID_COTIZACION_FK
            ? await tx.recepciones_equipo.findFirst({
                where: { ID_COTIZACION_FK: otActualizada.ID_COTIZACION_FK },
              })
            : null;

          const existentes = await tx.orden_trabajo_detalles.findMany({
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
              // Guard Clause: bloquear cambio de técnico si la OT no está en recepción.
              const detalleActual = existentes.find((d) => d.ID_DETALLE === inst.idDetalle);
              const tecnicoCambia =
                detalleActual != null && asignadoFinal !== detalleActual.asignado;
              if (tecnicoCambia) {
                validarAsignacionPermitida(otActualizada.estado);
              }

              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: inst.idDetalle },
                data: campos,
              });
              usados.add(inst.idDetalle);
            } else {
              // Instrumento nuevo agregado en el formulario de la OT
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

          // 2. Registrar el tracker de generación documental (dentro de la tx)
          const quoteJob = await tx.quote.create({ data: { status: 'PENDING' } });
          quoteJobId = quoteJob.id;
        });

        // 3. Encolar el Worker de Generación R-CM05 (Tipo 2 = OT) DESPUÉS del commit.
        const excelQueue = getGenerationExcelQueue();
        await excelQueue.add('generar_ot_consolidada', {
          tipo: 2,
          id_registro: id,
          codigo_actual: codigoOT,
          tipo_entry: 'prod',
          id_job: quoteJobId,
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
