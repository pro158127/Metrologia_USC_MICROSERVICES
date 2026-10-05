import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Estados, Prisma } from '@prisma/client';
import { z } from 'zod';
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
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { evaluarTransicionesOT } from '../services/ot-fsm.service.js';
const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  ENVIADA: [Estados.APROBADA, Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
const excelquue = getGenerationExcelQueue();

// Esquemas de documentos categorizados por cotización
const documentoVersionItemSchema = z.object({
  idVersion: z.number(),
  version: z.number(),
  rutaUrl: z.string(),
  createdAt: z.coerce.date(),
  usuario: z.string().nullable(),
});
const documentoItemSchema = z.object({
  idDocumento: z.number(),
  nombre: z.string(),
  rutaUrl: z.string(),
  mimeType: z.string(),
  createdAt: z.coerce.date(),
  versionActual: z.number(),
  versiones: z.array(documentoVersionItemSchema),
});
const certificadoTrazaSchema = z.object({
  instrumento: z.string().nullable(),
  serie: z.string().nullable(),
  fechaCalibracion: z.coerce.date().nullable(),
  tecnico: z.string().nullable(),
  estadoRevision: z.string(),
  revisadoAt: z.coerce.date().nullable(),
  revisor: z.string().nullable(),
  motivoRechazo: z.string().nullable(),
  versiones: z.array(documentoVersionItemSchema),
  sellos: z.array(z.string()),
});
const documentoCertificadoItemSchema = z.object({
  idCertificado: z.number(),
  codigoCertificado: z.string(),
  idDocumento: z.number(),
  nombre: z.string(),
  rutaUrl: z.string().nullable(),
  mimeType: z.string(),
  createdAt: z.coerce.date(),
  versiones: z.array(documentoVersionItemSchema),
  trazabilidad: certificadoTrazaSchema,
});
const respuestaDocumentosCotizacionSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    idCotizacion: z.number(),
    codigo: z.string(),
    categorias: z.object({
      recepcion: z.array(documentoItemSchema),
      ordenTrabajo: z.array(documentoItemSchema),
      comprobantes: z.array(documentoItemSchema),
      certificados: z.array(documentoCertificadoItemSchema),
    }),
  }),
});

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
      
      // 1. CORRECCIÓN: Declarar como string en lugar de number
      let id_jobs: string | undefined; 
      
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
            sitio: d.sitio ?? 'LABORATORIO',
          };
        });

        const viaticos = request.body.viaticos || 0;
        const descuentoPorcentaje = request.body.descuento || 0;
        const subtotalConViaticos = subtotalDetalles + viaticos;
        const montoTotal = subtotalConViaticos - subtotalConViaticos * (descuentoPorcentaje / 100);

        const estado = request.body.estado || Estados.BORRADOR;
        const consecutivo = await generarConsecutivo(tx, "COT");
        
        const nuevaCotizacion = await tx.cotizaciones.create({
          data: {
            CODIGO_COTIZACION: consecutivo,
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
        
        const trabajo = await tx.quote.create({ data: { status: "PENDING" } });
        
        // 2. CORRECCIÓN: Convertir a String explícitamente para cumplir con Zod
        id_jobs = String(trabajo.id); 
        
        return { nuevaCotizacion, trabajo };
      });

      // 3. Encolar la generación documental DESPUÉS de confirmarse la transacción.
      await excelquue.add('procesar_excel', {
        tipo: 1,
        id_registro: resultado.nuevaCotizacion.ID_COTIZACION,
        codigo_actual: resultado.nuevaCotizacion.CODIGO_COTIZACION,
        tipo_entry: 'prod',
        action: "cot_create",
        id_job: resultado.trabajo.id,
        id_usuario: idUsuario
      });

      // 4. Retorno validado sin errores de TypeScript
      return { 
        ok: true as const, 
        data: cotizacionRawToDtoSchema.parse(resultado.nuevaCotizacion), 
        id_job: id_jobs 
      };
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
  async (request, reply) => {
    const idCotizacion = Number(request.params.id) || request.body.idCotizacion;
    const idUsuario = Number(request.user?.sub ?? 0);
    const { viaticos: reqViaticos, descuento: reqDescuento, estado: reqEstado, codigo, detalles, cambios } = request.body;
    let codigo_actual_ot=null
    let codigo_actual_recep=null
    let id_registro_recp=null
    let id_registro_ot=null
    const resultado = await fastify.prisma.$transaction(async (tx) => {
      // 1. CONSULTA MAESTRA: Traemos todo el árbol de relaciones de una vez
      const existente = await tx.cotizaciones.findUnique({
        where: { ID_COTIZACION: idCotizacion },
        include: { 
          cotizacion_detalles: true,
          ordenes_trabajo: { 
            include: { orden_trabajo_detalles: { orderBy: { ITEM: 'asc' } } } 
          },
          recepciones_equipo: { 
            include: { recepcion_equipo_detalles: true } 
          }
        },
      });
      if (!existente) throw new AppError(404, 'Cotización no encontrada');

      // 2. BLOQUEO DE SEGURIDAD (Validar estado de la OT)
      if (existente.ordenes_trabajo && existente.ordenes_trabajo.length > 0) {
        const ot = existente.ordenes_trabajo[0];
        const estadosBloqueados = ['Asignada', 'En_calibración', 'Certificado_en_revisión', 'Certificado_aprobado', 'Certificado_enviado'];
        
        if (ot.estado && estadosBloqueados.includes(ot.estado)) {
          throw new AppError(409, `Bloqueo de seguridad: La Orden de Trabajo ${ot.CODIGO_OT} se encuentra en estado '${ot.estado}'. No es posible modificar la cotización.`);
        }
      }

      let subtotal = 0;
      
      // 3. LÓGICA DIFERENCIAL (CRUD DE DETALLES COTIZACIÓN)
      if (detalles) {
        const detallesCrear = [];
        const detallesActualizar = [];
        const idsEntrantes = [];

        for (const d of detalles) {
          const valorTotal = d.cantidad * d.valorUnitario;
          subtotal += valorTotal;

          const esNuevo = !d.idDetalle || d.idDetalle > 1000000000000;

          if (esNuevo) {
            detallesCrear.push({
              ID_COTIZACION_FK: idCotizacion,
              EQUIPO_DESCRIPCION: d.equipoDescripcion,
              TIPO_SERVICIO: d.tipoServicio,
              MAGNITUD: d.magnitud,
              NORMA_TECNICA: d.normaTecnica ?? null,
              CANTIDAD: d.cantidad,
              VALOR_UNITARIO: d.valorUnitario,
              VALOR_TOTAL: valorTotal,
              sitio: d.sitio ?? 'LABORATORIO',
            });
          } else {
            if(d.idDetalle !== undefined) {
              idsEntrantes.push(d.idDetalle);

              detallesActualizar.push(
                
                tx.cotizacion_detalles.update({
                  where: { ID_DETALLE: d.idDetalle },
                  data: {
                    EQUIPO_DESCRIPCION: d.equipoDescripcion,
                    TIPO_SERVICIO: d.tipoServicio,
                    MAGNITUD: d.magnitud,
                    NORMA_TECNICA: d.normaTecnica ?? null,
                    CANTIDAD: d.cantidad,
                    VALOR_UNITARIO: d.valorUnitario,
                    VALOR_TOTAL: valorTotal,
                    ...(d.sitio ? { sitio: d.sitio } : {}),
                  }
                })
              );
            }
          }
        }

        // A. Eliminar
        await tx.cotizacion_detalles.deleteMany({
          where: { ID_COTIZACION_FK: idCotizacion, ID_DETALLE: { notIn: idsEntrantes } }
        });
        // B. Actualizar
        if (detallesActualizar.length > 0) await Promise.all(detallesActualizar);
        // C. Crear
        if (detallesCrear.length > 0) await tx.cotizacion_detalles.createMany({ data: detallesCrear });
        const consecutivo = await generarConsecutivo(fastify.prisma, "COT",existente.CODIGO_COTIZACION);
      const update_cot=  await tx.cotizaciones.update({
          where:{CODIGO_COTIZACION:existente.CODIGO_COTIZACION},
          data:{CODIGO_COTIZACION:consecutivo}
        })
        
        // ==========================================
        // 4. CASCADA: SINCRONIZAR OT Y RECEPCIÓN 
        // (Se ejecuta solo si se enviaron detalles nuevos/modificados)
        // ==========================================
        const instrumentosDesdoblados: any[] = [];
        let itemCounter = 1;
        for (const d of detalles) {
          for (let i = 0; i < d.cantidad; i++) {
            instrumentosDesdoblados.push({
              ITEM: itemCounter++,
              INSTRUMENTO: d.equipoDescripcion,
              TIPO_SERVICIO: d.tipoServicio
            });
          }
        }

        // 4.1 Sincronizar OT
        if (existente.ordenes_trabajo.length > 0) {
          const ot = existente.ordenes_trabajo[0];
          const detallesOTActuales = ot.orden_trabajo_detalles;

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            if (i < detallesOTActuales.length) {
              
              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: detallesOTActuales[i].ID_DETALLE },
                data: { INSTRUMENTO: nuevo.INSTRUMENTO, TIPO_SERVICIO: nuevo.TIPO_SERVICIO }
              });
            } else {
              await tx.orden_trabajo_detalles.create({
                data: {
                  ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
                  ITEM: nuevo.ITEM,
                  INSTRUMENTO: nuevo.INSTRUMENTO,
                  TIPO_SERVICIO: nuevo.TIPO_SERVICIO,
                  asignado: null
                }
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesOTActuales.length) {
            const idsEliminar = detallesOTActuales.slice(instrumentosDesdoblados.length).map(d => d.ID_DETALLE);
            await tx.orden_trabajo_detalles.deleteMany({ where: { ID_DETALLE: { in: idsEliminar } } });
          }
         const consecutivo_ot=await generarConsecutivo(tx, "OT",existente.ordenes_trabajo[0].CODIGO_OT);
          const update_ot=await tx.ordenes_trabajo.update({where:{ID_ORDEN_TRABAJO:existente.ordenes_trabajo[0].ID_ORDEN_TRABAJO},data:{CODIGO_OT:consecutivo_ot}})
          codigo_actual_ot=update_ot.CODIGO_OT
          id_registro_ot=update_ot.ID_ORDEN_TRABAJO
        }

        // 4.2 Sincronizar Recepción
        if (existente.recepciones_equipo.length > 0) {
          const recep = existente.recepciones_equipo[0];
          const detallesRecepActuales = recep.recepcion_equipo_detalles;

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            if (i < detallesRecepActuales.length) {
              await tx.recepcion_equipo_detalles.update({
                where: { ID_INSTRUMENTO: detallesRecepActuales[i].ID_INSTRUMENTO },
                data: { INSTRUMENTO: nuevo.INSTRUMENTO, ITEM: nuevo.ITEM }
              });
            } else {
              // Estampilla temporal para satisfacer el @unique de Prisma
        
              await tx.recepcion_equipo_detalles.create({
                data: {

                  ID_RECEPCION_FK: recep.ID_RECEPCION,
                  ITEM: nuevo.ITEM,
                  INSTRUMENTO: nuevo.INSTRUMENTO,
                }
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesRecepActuales.length) {
            const idsEliminar = detallesRecepActuales.slice(instrumentosDesdoblados.length).map(d => d.ID_INSTRUMENTO);
            await tx.recepcion_equipo_detalles.deleteMany({ where: { ID_INSTRUMENTO: { in: idsEliminar } } });
          }
              const consec=await generarConsecutivo(tx,"REC",existente.recepciones_equipo[0].CODIGO_RECEPCION)
             const update_rec= await tx.recepciones_equipo.update({where:{CODIGO_RECEPCION:existente.recepciones_equipo[0].CODIGO_RECEPCION},data:{CODIGO_RECEPCION:consec}})
             codigo_actual_recep=update_rec.CODIGO_RECEPCION
             id_registro_recp=update_rec.ID_RECEPCION
        }

        // 4.3 Recalcular el estado automático de la OT (FSM) tras sincronizar.
        if (existente.ordenes_trabajo.length > 0) {
          await evaluarTransicionesOT(tx, existente.ordenes_trabajo[0].ID_ORDEN_TRABAJO);
        }
      } else {
        subtotal = existente.cotizacion_detalles.reduce(
          (acc, d) => acc + d.CANTIDAD * Number(d.VALOR_UNITARIO), 0
        );
      }

      // 5. ACTUALIZACIÓN FINANCIERA Y MAESTRA
      const viaticos = reqViaticos !== undefined ? reqViaticos : Number(existente.viaticos || 0);
      const descuento = reqDescuento !== undefined ? reqDescuento : Number(existente.descuento || 0);
      const subtotalConViaticos = subtotal + viaticos;
      const montoTotal = subtotalConViaticos - subtotalConViaticos * (descuento / 100);

      if (reqEstado && reqEstado !== existente.ESTADO) {
        const permitidos = transicionesValidas[existente.ESTADO] || [];
        if (!permitidos.includes(reqEstado)) {
          throw new AppError(409, `Transición no permitida de ${existente.ESTADO} a ${reqEstado}`);
        }
        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: idCotizacion,
            ESTADO_ANTERIOR: existente.ESTADO,
            ESTADO_NUEVO: reqEstado,
            ID_USUARIO_FK: idUsuario,
          },
        });
      }

      const cotizacionActualizada = await tx.cotizaciones.update({
        where: { ID_COTIZACION: idCotizacion },
        data: {
          ...(codigo && { CODIGO_COTIZACION: codigo }),
          ...(request.body.idCliente && { ID_CLIENTE_FK: request.body.idCliente }),
          ...(reqEstado && { ESTADO: reqEstado }),
          viaticos,
          descuento,
          MONTO_TOTAL: montoTotal,
        },
        include: { clientes: true, cotizacion_detalles: true },
      });

      // 6. REGISTRO DE AUDITORÍA (VERSIONAMIENTO)
      if (cambios) {
        const ultimaVersion = await tx.historial_cambios.findFirst({
          where: { id_cotizacion: idCotizacion },
          orderBy: { created_at: 'desc' }
        });
        
        let siguienteNum = 1;
        if (ultimaVersion && ultimaVersion.numero_version) {
          const match = ultimaVersion.numero_version.match(/V(\d+)/);
          if (match) siguienteNum = parseInt(match[1]) + 1;
        }

        await tx.historial_cambios.create({
          data: {
            id: crypto.randomUUID(),
            numero_version: `V${siguienteNum}`,
            fecha_cambio: new Date(),
            descripcion: cambios.descripcion,
            observaciones: cambios.observaciones,
            aprobo: cambios.aprobo,
            id_cotizacion: idCotizacion,
            updated_at: new Date()
          }
        });
      }

      return cotizacionActualizada;
    });

const trackingJobs: Record<string, string> = {};

    // 7.1. SIEMPRE generamos el Excel de la Cotización actualizada
    const quoteTracker_Cot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
    await excelquue.add('actualizacion_cotizacion', {
      id_job: quoteTracker_Cot.id, 
      tipo_entry: 'prod', 
      id_registro: resultado.ID_COTIZACION,
      action: 'cot_update',
      codigo_actual: resultado.CODIGO_COTIZACION,
      tipo: 1
    });
    trackingJobs.cot = quoteTracker_Cot.id;

    // 7.2. SOLO generamos el Excel de OT si realmente existe una OT vinculada
    if (id_registro_ot && codigo_actual_ot) {
      const ordeneo_tracke = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_ordenes_ot', {
        id_job: ordeneo_tracke.id, 
        tipo_entry: 'prod', 
        id_registro: id_registro_ot,
        codigo_actual: codigo_actual_ot,
        tipo: 2
      });
      trackingJobs.ot = ordeneo_tracke.id;
    }

    // 7.3. SOLO generamos el Excel de Recepción si realmente existe una Recepción vinculada
    if (id_registro_recp && codigo_actual_recep) {
      const receprtracker = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_recepciones', {
        id_job: receprtracker.id, 
        tipo_entry: 'prod', 
        id_registro: id_registro_recp,
        codigo_actual: codigo_actual_recep,
        tipo: 3
      });
      trackingJobs.rec = receprtracker.id;
    }

    // Retornamos un JSON dinámico solo con los jobs que sí se ejecutaron
    return { 
      ok: true as const, 
      data: cotizacionRawToDtoSchema.parse(resultado), 
      id_job: JSON.stringify(trackingJobs) 
    };
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
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const idCotizacion = Number(id);
    const { nuevoEstado } = request.body as { nuevoEstado: Estados }; // Usa tu type 'Estados'
    const idUsuario = Number(request.user?.sub ?? 0);

    try {
      const resultado = await fastify.prisma.$transaction(async (tx) => {
        // 1. Obtener estado actual
        const actual = await tx.cotizaciones.findUnique({ where: { ID_COTIZACION: idCotizacion } });
        if (!actual) throw new AppError(404, 'Cotización no encontrada');

        // 1.1 Validar la transición permitida (FSM) — mismo criterio que el PUT.
        const permitidos = transicionesValidas[actual.ESTADO] || [];
        if (!permitidos.includes(nuevoEstado)) {
          throw new AppError(
            409,
            `Transición no permitida de ${actual.ESTADO} a ${nuevoEstado}`
          );
        }

        // 2. Actualizar estado
        const cotizacionActualizada = await tx.cotizaciones.update({
          where: { ID_COTIZACION: idCotizacion },
          data: { ESTADO:nuevoEstado },
          include: { clientes: true, cotizacion_detalles: true }
        });

        // 3. Registrar en el historial de estados
        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: idCotizacion,
            ESTADO_ANTERIOR: actual.ESTADO,
            ESTADO_NUEVO: nuevoEstado,
            ID_USUARIO_FK: idUsuario,
          }
        });

        const dataOTs: any[] = [];
        const dataRecs: any[] = [];

        // 4. Interceptar APROBACIÓN: split por sitio (Laboratorio / Cliente)
        if (nuevoEstado === 'APROBADA') {
          const detalles = cotizacionActualizada.cotizacion_detalles.filter(
            (d) => d.activacion !== false
          );

          const grupos = new Map<'LABORATORIO' | 'CLIENTE', typeof detalles>();
          for (const detalle of detalles) {
            const sitio = detalle.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
            const lista = grupos.get(sitio) ?? [];
            lista.push(detalle);
            grupos.set(sitio, lista);
          }

          for (const [sitio, detallesGrupo] of grupos.entries()) {
            const esSitio = sitio === 'CLIENTE';

            // Desdoblar ítems de la cotización en instrumentos (OT/Recepción).
            const detallesOT = [];
            const detallesRec = [];
            let itemCounter = 1;

            for (const detalle of detallesGrupo) {
              for (let i = 0; i < (detalle.CANTIDAD || 1); i++) {
                detallesOT.push({
                  ITEM: itemCounter,
                  INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
                  TIPO_SERVICIO: detalle.TIPO_SERVICIO,
                  asignado: null,
                });

                detallesRec.push({
                  INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
                  ESTAMPILLA: `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                });

                itemCounter++;
              }
            }

            // Resolver/reutilizar la OT para este sitio.
            const otExistente = await tx.ordenes_trabajo.findFirst({
              where: { ID_COTIZACION_FK: idCotizacion, SITIO_CALIBRACION: sitio },
            });

            let ot: any;
            if (otExistente) {
              ot = await tx.ordenes_trabajo.update({
                where: { ID_ORDEN_TRABAJO: otExistente.ID_ORDEN_TRABAJO },
                data: {
                  SITIO_CALIBRACION: sitio,
                  ES_EN_SITIO: esSitio,
                  ES_LAB_PERMANENTE: !esSitio,
                  ID_CLIENTE_FK: cotizacionActualizada.ID_CLIENTE_FK,
                },
              });

              // Solo resincronizamos instrumentos si la OT aún no avanzó en su FSM
              // (evita borrar asignaciones/datos técnicos ya capturados).
              const estadoOT = otExistente.estado ?? 'Creada';
              if (estadoOT === 'Creada' || estadoOT === 'En_recepción') {
                await tx.orden_trabajo_detalles.deleteMany({
                  where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
                });
                await tx.orden_trabajo_detalles.createMany({
                  data: detallesOT.map((d) => ({
                    ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
                    ...d,
                  })),
                });
              }
            } else {
              const codigoOT = await generarConsecutivo(tx, 'OT');
              ot = await tx.ordenes_trabajo.create({
                data: {
                  CODIGO_OT: codigoOT,
                  ID_COTIZACION_FK: idCotizacion,
                  ID_CLIENTE_FK: cotizacionActualizada.ID_CLIENTE_FK,
                  Razon_social: cotizacionActualizada.clientes?.RAZON_SOCIAL,
                  NIT: cotizacionActualizada.clientes?.NIT,
                  dirrecion: cotizacionActualizada.clientes?.dirrecion,
                  ciudad: cotizacionActualizada.clientes?.ciudad,
                  estado: 'Creada',
                  SITIO_CALIBRACION: sitio,
                  ES_EN_SITIO: esSitio,
                  ES_LAB_PERMANENTE: !esSitio,
                  ES_INTERNO_USC: false,
                  orden_trabajo_detalles: { create: detallesOT },
                },
              });
            }

            // Resolver/reutilizar la Recepción para esta OT.
            const recExistente = await tx.recepciones_equipo.findFirst({
              where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
            });

            let rec: any;
            if (recExistente) {
              rec = await tx.recepciones_equipo.update({
                where: { ID_RECEPCION: recExistente.ID_RECEPCION },
                data: {
                  SITIO_CALIBRACION: sitio,
                  SOLICITANTE: cotizacionActualizada.clientes?.RAZON_SOCIAL ?? 'sin solicitante',
                },
              });

              await tx.recepcion_equipo_detalles.deleteMany({
                where: { ID_RECEPCION_FK: rec.ID_RECEPCION },
              });
              await tx.recepcion_equipo_detalles.createMany({
                data: detallesRec.map((d) => ({
                  ID_RECEPCION_FK: rec.ID_RECEPCION,
                  ...d,
                })),
              });
            } else {
              const codigoRec = await generarConsecutivo(tx, 'REC');
              rec = await tx.recepciones_equipo.create({
                data: {
                  CODIGO_RECEPCION: codigoRec,
                  ID_COTIZACION_FK: idCotizacion,
                  ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
                  SITIO_CALIBRACION: sitio,
                  ESTADO: 'BORRADOR',
                  SOLICITANTE: cotizacionActualizada.clientes?.RAZON_SOCIAL ?? 'sin solicitante',
                  recepcion_equipo_detalles: { create: detallesRec },
                },
              });
            }

            dataOTs.push(ot);
            dataRecs.push(rec);
          }
        }

        return { cotizacion: cotizacionActualizada, ots: dataOTs, recs: dataRecs };
      });

      // 5. DETONAR GENERACIÓN DE EXCEL (BULLMQ)
   const trackingJobs: Record<string, string> = {};

      // 🔥 1. DETONAR TIPO 1 (Siempre). El correo de aprobación SOLO se envía
      // cuando el nuevo estado es APROBADA; otros estados usan una acción neutra
      // para que el worker regenere el documento sin notificar aprobación.
      const quoteTrackerCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_estado_cot', {
        id_job: quoteTrackerCot.id, 
        tipo_entry: 'prod',
        id_registro: resultado.cotizacion.ID_COTIZACION,
        action: resultado.cotizacion.ESTADO === 'APROBADA' ? 'aprove' : 'estado_cambio',
        codigo_actual: resultado.cotizacion.CODIGO_COTIZACION,
        tipo: 1
      });
      trackingJobs.cot = quoteTrackerCot.id;

      // 2. DETONAR TIPO 2 (Orden de Trabajo) — una por cada OT generada/reutilizada
      for (const ot of resultado.ots) {
        const quoteTrackerOT = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_ot_excel', {
          id_job: quoteTrackerOT.id, 
          tipo_entry: 'prod',
          id_registro: ot.ID_ORDEN_TRABAJO,
          action:"ot_create",
          codigo_actual: ot.CODIGO_OT,
          tipo: 2
        });
        trackingJobs.ot = quoteTrackerOT.id;
      }

      // 3. DETONAR TIPO 3 (Recepción) — una por cada Recepción generada/reutilizada
      for (const rec of resultado.recs) {
        const quoteTrackerRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_recepcion_excel', {
          id_job: quoteTrackerRec.id, 
          tipo_entry: 'prod',
          id_registro: rec.ID_RECEPCION,
          codigo_actual: rec.CODIGO_RECEPCION,
          tipo: 3
        });
        trackingJobs.rec = quoteTrackerRec.id;
      }

      return reply.code(200).send({ 
        ok: true, 
        data: cotizacionRawToDtoSchema.parse(resultado.cotizacion),
        id_job: Object.keys(trackingJobs).length > 0 ? JSON.stringify(trackingJobs) : undefined
      });

    } catch (error: any) {
      fastify.log.error(error);
      if (error.statusCode) {
        return reply.code(error.statusCode).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Error interno en el servidor' });
    }
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

  // ==========================================================================
  // GET /api/v1/cotizaciones/:id/documentos
  // Documentos categorizados en 4 folders: Recepciones, Órdenes OT,
  // Certificados y Comprobantes de pago.
  // - Certificados: se cruza con version_documentos (NO se usa el link
  //   principal de documentos) y se lista el ciclo de vida completo + trazabilidad.
  // ==========================================================================
  app.get(
    '/api/v1/cotizaciones/:id/documentos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaDocumentosCotizacionSchema },
      },
    },
    async (request) => {
      const idCotizacion = request.params.id;

      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: idCotizacion },
      });
      if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');

      const ordenes = await fastify.prisma.ordenes_trabajo.findMany({
        where: { ID_COTIZACION_FK: idCotizacion },
        select: { ID_ORDEN_TRABAJO: true },
      });
      const otIds = ordenes.map((o) => o.ID_ORDEN_TRABAJO);

      const recepciones = await fastify.prisma.recepciones_equipo.findMany({
        where: {
          OR: [
            { ID_COTIZACION_FK: idCotizacion },
            ...(otIds.length ? [{ ID_ORDEN_TRABAJO_FK: { in: otIds } }] : []),
          ],
        },
        select: { ID_RECEPCION: true },
      });
      const recIds = recepciones.map((r) => r.ID_RECEPCION);

      // Documentos de Recepciones, Órdenes OT y Comprobantes de pago
      // (facturas/cotizaciones). Los certificados se consultan por separado.
      const documentos = await fastify.prisma.documentos.findMany({
        where: {
          OR: [
            { ID_COTIZACION_FK: idCotizacion },
            ...(otIds.length
              ? [
                  { ID_ORDEN_TRABAJO_FK: { in: otIds } },
                  { ordenPagoId: { in: otIds } },
                ]
              : []),
            ...(recIds.length ? [{ ID_RECEPCION_FK: { in: recIds } }] : []),
          ],
        },
        include: {
          version_documentos: {
            include: {
              usuarios: {
                select: {
                  ID_USUARIO_AUTO_INCREMENT: true,
                  NOMBRE_COMPLETO: true,
                },
              },
            },
            orderBy: { VERSION: 'desc' },
          },
        },
        orderBy: { CREATED_AT: 'desc' },
      });

      // ============ CERTIFICADOS (REGLA ESPECIAL) ============
      // No se usa documentos.RUTA_URL; se cruza con version_documentos para
      // listar todas las versiones y armar la trazabilidad completa.
      const certificados = await fastify.prisma.certificados.findMany({
        where: recIds.length
          ? {
              calibraciones: {
                recepcion_equipo_detalles: {
                  ID_RECEPCION_FK: { in: recIds },
                },
              },
            }
          : { ID_CERTIFICADO: -1 },
        include: {
          documentos: {
            include: {
              version_documentos: {
                include: {
                  usuarios: {
                    select: {
                      ID_USUARIO_AUTO_INCREMENT: true,
                      NOMBRE_COMPLETO: true,
                    },
                  },
                },
                orderBy: { VERSION: 'desc' },
              },
            },
          },
          calibraciones: {
            include: {
              usuarios: { select: { NOMBRE_COMPLETO: true } },
              recepcion_equipo_detalles: {
                select: { INSTRUMENTO: true, SERIE: true },
              },
            },
          },
          certificado_sellos: {
            include: { sellos: { select: { NOMBRE: true } } },
          },
        },
        orderBy: { ID_CERTIFICADO: 'desc' },
      });

      const revisorIds = [
        ...new Set(
          certificados
            .map((c) => c.ID_REVISOR_FK)
            .filter((id): id is number => id != null)
        ),
      ];
      const revisores = revisorIds.length
        ? await fastify.prisma.usuarios.findMany({
            where: { ID_USUARIO_AUTO_INCREMENT: { in: revisorIds } },
            select: { ID_USUARIO_AUTO_INCREMENT: true, NOMBRE_COMPLETO: true },
          })
        : [];
      const revisorMap = new Map(
        revisores.map((u) => [u.ID_USUARIO_AUTO_INCREMENT, u.NOMBRE_COMPLETO])
      );

      const toVersion = (v: {
        ID_VERSION: number;
        VERSION: number;
        RUTA_URL: string;
        CREATED_AT: Date;
        usuarios?: { NOMBRE_COMPLETO: string } | null;
      }) => ({
        idVersion: v.ID_VERSION,
        version: v.VERSION,
        rutaUrl: v.RUTA_URL,
        createdAt: v.CREATED_AT,
        usuario: v.usuarios?.NOMBRE_COMPLETO ?? null,
      });

      const toItem = (doc: (typeof documentos)[number]) => ({
        idDocumento: doc.ID_DOCUMENTO,
        nombre: doc.NOMBRE,
        rutaUrl: doc.RUTA_URL,
        mimeType: doc.MIME_TYPE,
        createdAt: doc.CREATED_AT,
        versionActual: doc.version_documentos[0]?.VERSION ?? 1,
        versiones: doc.version_documentos.map(toVersion),
      });

      const categorias = {
        recepcion: [] as ReturnType<typeof toItem>[],
        ordenTrabajo: [] as ReturnType<typeof toItem>[],
        comprobantes: [] as ReturnType<typeof toItem>[],
        certificados: [] as z.infer<typeof documentoCertificadoItemSchema>[],
      };

      for (const doc of documentos) {
        const item = toItem(doc);
        if (doc.ordenPagoId != null && otIds.includes(doc.ordenPagoId)) {
          categorias.comprobantes.push(item);
        } else if (doc.ID_RECEPCION_FK != null && recIds.includes(doc.ID_RECEPCION_FK)) {
          categorias.recepcion.push(item);
        } else if (doc.ID_COTIZACION_FK === idCotizacion) {
          categorias.comprobantes.push(item);
        } else {
          categorias.ordenTrabajo.push(item);
        }
      }

      for (const cert of certificados) {
        const versiones = cert.documentos?.version_documentos ?? [];
        const calibracion = cert.calibraciones;
        const detalle = calibracion?.recepcion_equipo_detalles ?? null;

        categorias.certificados.push({
          idCertificado: cert.ID_CERTIFICADO,
          codigoCertificado: cert.CODIGO_CERTIFICADO,
          idDocumento: cert.ID_DOCUMENTO_FK,
          nombre: cert.documentos?.NOMBRE ?? cert.CODIGO_CERTIFICADO,
          rutaUrl: versiones[0]?.RUTA_URL ?? null,
          mimeType: cert.documentos?.MIME_TYPE ?? 'application/pdf',
          createdAt: cert.documentos?.CREATED_AT ?? calibracion?.CREATED_AT ?? new Date(),
          versiones: versiones.map(toVersion),
          trazabilidad: {
            instrumento: detalle?.INSTRUMENTO ?? null,
            serie: detalle?.SERIE ?? null,
            fechaCalibracion: calibracion?.CREATED_AT ?? null,
            tecnico: calibracion?.usuarios?.NOMBRE_COMPLETO ?? null,
            estadoRevision: cert.ESTADO_REVISION,
            revisadoAt: cert.REVISADO_AT ?? null,
            revisor: cert.ID_REVISOR_FK != null ? revisorMap.get(cert.ID_REVISOR_FK) ?? null : null,
            motivoRechazo: cert.MOTIVO_RECHAZO ?? null,
            versiones: versiones.map(toVersion),
            sellos: cert.certificado_sellos.map((cs) => cs.sellos.NOMBRE),
          },
        });
      }

      return {
        ok: true as const,
        data: {
          idCotizacion,
          codigo: cotizacion.CODIGO_COTIZACION,
          categorias,
        },
      };
    }
  );
}
