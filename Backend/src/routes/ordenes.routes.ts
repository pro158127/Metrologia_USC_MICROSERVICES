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
import { EstadoOT } from '@prisma/client';
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
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
            orden_trabajo_detalles: true,
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
        // 1. Transacción para garantizar integridad de BD
        await fastify.prisma.$transaction(async (tx) => {
          
          // A. Actualizar cabecera de la OT
          const otActualizada = await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: id },
            data: {
              RESPONSABLE: data.responsableUsc,
              FECHA_CALIBRACION_DILIGENCIAMENTO: data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null,
              REQUIERE_ANEXO: data.requiereAnexo === 'Si',
              OBSERVACIONES: data.observacionesGenerales,
              estado: data.estadoOrden as EstadoOT,
            
            },
          });

          // B. Procesar Instrumentos (Upsert) y Sincronizar Recepciones
          for (const inst of data.instrumentos) {
            // Actualizamos el detalle de la OT
            if (inst.idDetalle) {
              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: inst.idDetalle },
                data: {
                  INSTRUMENTO: inst.instrumento,
                  FABRICANTE: inst.fabricante,
                  MODELO: inst.modelo,
                  SERIE: inst.serie,
                  CODIGO_INVENTARIO: inst.codigoInventario,
                  asignado: inst.asignado,
                  PUNTOS_CALIBRAR: inst.puntosCalibrar ?? [],
                },
              });
            }

            // C. Sincronización Espejo con Recepciones (Homologación de campos)
            // Buscamos la recepción asociada a la misma cotización de esta OT
            if (otActualizada.ID_COTIZACION_FK) {
              const recepcionAsociada = await tx.recepciones_equipo.findFirst({
                where: { ID_COTIZACION_FK: otActualizada.ID_COTIZACION_FK }
              });

              if (recepcionAsociada) {
                // Actualizamos el instrumento en la recepción basándonos en el ITEM (posición)
                await tx.recepcion_equipo_detalles.updateMany({
                  where: {
                    ID_RECEPCION_FK: recepcionAsociada.ID_RECEPCION,
                    ITEM: inst.item
                  },
                  data: {
                    INSTRUMENTO: inst.instrumento,
                    MARCA: inst.fabricante, // Homologación: Fabricante (OT) -> Marca (Recepción)
                    MODELO: inst.modelo,
                    SERIE: inst.serie,
                    CODIGO_INVENTARIO: inst.codigoInventario
                  }
                });
              }
            }
          }

          // 2. Disparar Worker de Generación R-CM05 (Tipo 2 = OT)
          // Usamos la cola que ya tienes configurada en queue.ts
          const quoteJob = await tx.quote.create({ data: { status: 'PENDING' } });
          const excelQueue = getGenerationExcelQueue();
          
          await excelQueue.add('generar_ot_consolidada', {
            tipo: 2,
            id_registro: id,
            codigo_actual: otActualizada.CODIGO_OT,
            tipo_entry: 'prod',
            id_job: quoteJob.id,
        
          });

          return reply.code(200).send({ 
            ok: true, 
            message: 'Orden consolidada y encolada para generación documental',
            id_job: quoteJob.id 
          });
        });

      } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ ok: false, message: 'Error consolidando la Orden de Trabajo' });
      }
    }
  );
}
