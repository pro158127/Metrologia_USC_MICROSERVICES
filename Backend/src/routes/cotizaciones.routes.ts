import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
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
import { generarConsecutivo } from '../services/consecutivo.service.js';
const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  ENVIADA: [Estados.APROBADA, Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};
import { getGenerationExcelQueue } from '../lib/queue/queue.js';
const excelquue = getGenerationExcelQueue();
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
          };
        });

        const viaticos = request.body.viaticos || 0;
        const descuentoPorcentaje = request.body.descuento || 0;
        const subtotalConViaticos = subtotalDetalles + viaticos;
        const montoTotal = subtotalConViaticos - subtotalConViaticos * (descuentoPorcentaje / 100);

        const estado = request.body.estado || Estados.BORRADOR;
        const consecutivo = await generarConsecutivo(fastify.prisma, "COT");
        
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
        
   
        const job = await excelquue.add('procesar_excel', {  
          tipo: 1,
          id_registro: nuevaCotizacion.ID_COTIZACION,
          codigo_actual: consecutivo,
          tipo_entry: 'prod',
          action: "cot_create",
          id_job: trabajo.id,
          id_usuario: idUsuario
        });

        return nuevaCotizacion;
      });

      // 3. Retorno validado sin errores de TypeScript
      return { 
        ok: true as const, 
        data: cotizacionRawToDtoSchema.parse(resultado), 
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
                  asignado: 1
                }
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesOTActuales.length) {
            const idsEliminar = detallesOTActuales.slice(instrumentosDesdoblados.length).map(d => d.ID_DETALLE);
            await tx.orden_trabajo_detalles.deleteMany({ where: { ID_DETALLE: { in: idsEliminar } } });
          }
         const consecutivo_ot=await generarConsecutivo(fastify.prisma, "OT",existente.ordenes_trabajo[0].CODIGO_OT);
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
                data: { INSTRUMENTO: nuevo.INSTRUMENTO }
              });
            } else {
              // Estampilla temporal para satisfacer el @unique de Prisma
        
              await tx.recepcion_equipo_detalles.create({
                data: {

                  ID_RECEPCION_FK: recep.ID_RECEPCION,
                  INSTRUMENTO: nuevo.INSTRUMENTO,
                }
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesRecepActuales.length) {
            const idsEliminar = detallesRecepActuales.slice(instrumentosDesdoblados.length).map(d => d.ID_INSTRUMENTO);
            await tx.recepcion_equipo_detalles.deleteMany({ where: { ID_INSTRUMENTO: { in: idsEliminar } } });
          }
              const consec=await generarConsecutivo(fastify.prisma,"REC",existente.recepciones_equipo[0].CODIGO_RECEPCION)
             const update_rec= await tx.recepciones_equipo.update({where:{CODIGO_RECEPCION:existente.recepciones_equipo[0].CODIGO_RECEPCION},data:{CODIGO_RECEPCION:consec}})
             codigo_actual_recep=update_rec.CODIGO_RECEPCION
             id_registro_recp=update_rec.ID_RECEPCION
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

        let dataOT = null;
        let dataRec = null;

        // 4. Interceptar APROBACIÓN
        if (nuevoEstado === 'APROBADA') {
          // 🔥 VERIFICACIÓN: Consultamos si ya existe
          let ot = await tx.ordenes_trabajo.findFirst({
            where: { ID_COTIZACION_FK: idCotizacion }
          });

          if (ot) {
            // ✅ YA EXISTE: Solo consultamos sus IDs para el worker
            const recepcion = await tx.recepciones_equipo.findFirst({
              where: { ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO }
            });
            dataOT = ot;
            dataRec = recepcion;
          } else {
            // ❌ NO EXISTE: Procedemos con el nacimiento de OT y Recepción
            const codigoOT = await generarConsecutivo(tx, "OT");
            const codigoRec = await generarConsecutivo(tx, "REC");

            const detallesOT = [];
            const detallesRec = [];
            let itemCounter = 1;

            for (const detalle of cotizacionActualizada.cotizacion_detalles) {
              for (let i = 0; i < (detalle.CANTIDAD || 1); i++) {
                detallesOT.push({
                  ITEM: itemCounter,
                  INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
                  TIPO_SERVICIO: detalle.TIPO_SERVICIO,
                  asignado: 1 
                });

                detallesRec.push({
                  INSTRUMENTO: detalle.EQUIPO_DESCRIPCION,
                  ESTAMPILLA: `TEMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`
                });

                itemCounter++;
              }
            }

            dataOT = await tx.ordenes_trabajo.create({
              data: {
                CODIGO_OT: codigoOT,
                ID_COTIZACION_FK: idCotizacion,
                ID_CLIENTE_FK: cotizacionActualizada.ID_CLIENTE_FK,
                Razon_social: cotizacionActualizada.clientes?.RAZON_SOCIAL,
                NIT: cotizacionActualizada.clientes?.NIT,
                dirrecion: cotizacionActualizada.clientes?.dirrecion,
                ciudad: cotizacionActualizada.clientes?.ciudad,
                estado: 'Creada',
                orden_trabajo_detalles: { create: detallesOT }
              }
            });

            dataRec = await tx.recepciones_equipo.create({
              data: {
                CODIGO_RECEPCION: codigoRec,
                ID_COTIZACION_FK: idCotizacion,
                ID_ORDEN_TRABAJO_FK: dataOT.ID_ORDEN_TRABAJO,
                ESTADO: 'BORRADOR',
                SOLICITANTE: cotizacionActualizada.clientes?.RAZON_SOCIAL??"sin solicitante",
                recepcion_equipo_detalles: { create: detallesRec }
              }
            });
          }
        }

        return { cotizacion: cotizacionActualizada, ot: dataOT, rec: dataRec };
      });

      // 5. DETONAR GENERACIÓN DE EXCEL (BULLMQ)
   const trackingJobs: Record<string, string> = {};

      // 🔥 1. DETONAR TIPO 1 (Siempre, para que el worker valide y envíe el correo)
      const quoteTrackerCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_estado_cot', {
        id_job: quoteTrackerCot.id, 
        tipo_entry: 'prod',
        id_registro: resultado.cotizacion.ID_COTIZACION,
        action: 'aprove', // Mantén la acción que use tu worker para notificar
        codigo_actual: resultado.cotizacion.CODIGO_COTIZACION,
        tipo: 1
      });
      trackingJobs.cot = quoteTrackerCot.id;

      // 2. DETONAR TIPO 2 (Orden de Trabajo)
      if (resultado.ot) {
        const quoteTrackerOT = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_ot_excel', {
          id_job: quoteTrackerOT.id, 
          tipo_entry: 'prod',
          id_registro: resultado.ot.ID_ORDEN_TRABAJO,
          action:"ot_create",
          codigo_actual: resultado.ot.CODIGO_OT,
          tipo: 2
        });
        trackingJobs.ot = quoteTrackerOT.id;
      }

      // 3. DETONAR TIPO 3 (Recepción)
      if (resultado.rec) {
        const quoteTrackerRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_recepcion_excel', {
          id_job: quoteTrackerRec.id, 
          tipo_entry: 'prod',
          id_registro: resultado.rec.ID_RECEPCION,
          codigo_actual: resultado.rec.CODIGO_RECEPCION,
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
}
