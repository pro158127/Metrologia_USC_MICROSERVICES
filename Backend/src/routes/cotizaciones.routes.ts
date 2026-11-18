import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Estados, Prisma } from '@prisma/client';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { assertPermission } from '../lib/permissions.js';
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
import { registrarBitacora } from '../services/bitacora.service.js';
import {
  resolverUsuarioCreadorCotizacion,
  notificarUsuario,
} from '../services/notificacion.service.js';
import { generarOrdenesTrabajoAprobacion } from '../services/cotizacion-aprobacion.service.js';
import { validarOTEditableAntesDeCalibrar } from '../services/ot-edit-lock.service.js';
import { calcularMontoTotalCotizacion, calcularValorDetalle, normalizarDinero } from '../services/cotizacion-money.service.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import { firmarTokenAprobacion, verificarTokenAprobacion } from '../lib/approval-token.js';
const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  // La aprobación ya no está disponible desde la interfaz: se realiza
  // exclusivamente mediante el enlace externo enviado por correo.
  ENVIADA: [Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};
import { getEmailQueue, getGenerationExcelQueue } from '../lib/queue/queue.js';
import { EmailJobData } from '../lib/queue/queue.js';
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
      cotizacion: z.array(documentoItemSchema),
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

  app.get(
    '/api/v1/cotizaciones/:id/envios-correo',
    { preHandler: [fastify.authenticate], schema: { params: idParamSchema } },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'consultar');
      const idCotizacion = request.params.id;
      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: idCotizacion },
        select: { ID_COTIZACION: true },
      });
      if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');

      const envios = await fastify.prisma.correo_envios.findMany({
        where: { ID_COTIZACION_FK: idCotizacion },
        orderBy: { CREATED_AT: 'desc' },
      });
      return {
        ok: true as const,
        data: envios.map((envio) => ({
          id: envio.ID_ENVIO_CORREO,
          tipo: envio.TIPO,
          destinatario: envio.DESTINATARIO,
          asunto: envio.ASUNTO,
          estado: envio.ESTADO,
          ultimoError: envio.ULTIMO_ERROR,
          intentos: envio.INTENTOS,
          creadoAt: envio.CREATED_AT,
          enviadoAt: envio.ENVIADO_AT,
        })),
      };
    }
  );

  app.post(
    '/api/v1/cotizaciones/:id/envios-correo/:idEnvio/reintentar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: z.object({ id: z.coerce.number(), idEnvio: z.coerce.number() }),
        body: z.object({ correo: z.email().optional() }),
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'crear_editar');
      const idCotizacion = request.params.id;
      const idEnvio = request.params.idEnvio;
      const correoNuevo = request.body.correo?.trim().toLowerCase();
      const idUsuario = Number(request.user?.sub ?? 0) || null;

      const envio = await fastify.prisma.correo_envios.findFirst({
        where: { ID_ENVIO_CORREO: idEnvio, ID_COTIZACION_FK: idCotizacion },
      });
      if (!envio) throw new AppError(404, 'No se encontró el envío de correo solicitado.');
      if (envio.ESTADO !== 'FALLIDO') {
        throw new AppError(409, `Solo se pueden reintentar correos fallidos. Estado actual: ${envio.ESTADO}.`);
      }

      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: idCotizacion },
        select: { ID_CLIENTE_FK: true, clientes: { select: { CORREO: true } } },
      });
      if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');
      if (correoNuevo && cotizacion.ID_CLIENTE_FK) {
        const correoAnterior = cotizacion.clientes?.CORREO ?? null;
        if (correoAnterior !== correoNuevo) {
          await fastify.prisma.clientes.update({
            where: { ID_CLIENTE: cotizacion.ID_CLIENTE_FK },
            data: { CORREO: correoNuevo },
          });
          await registrarBitacora(fastify.prisma, {
            action: 'ACTUALIZAR_CORREO_PARA_REENVIO',
            tableName: 'clientes',
            recordId: cotizacion.ID_CLIENTE_FK,
            userId: idUsuario,
            ip: request.ip,
            details: { idCotizacion, correoAnterior, correoNuevo },
          });
        }
      }
      const destinatario = correoNuevo ?? cotizacion.clientes?.CORREO ?? envio.DESTINATARIO;
      if (!destinatario) throw new AppError(409, 'El cliente no tiene un correo configurado. Ingrese una dirección válida para reintentar.');

      const reservado = await fastify.prisma.correo_envios.updateMany({
        where: { ID_ENVIO_CORREO: idEnvio, ID_COTIZACION_FK: idCotizacion, ESTADO: 'FALLIDO' },
        data: {
          ESTADO: 'PENDIENTE',
          DESTINATARIO: destinatario,
          ULTIMO_ERROR: null,
          SOLICITADO_POR: idUsuario,
          ENVIADO_AT: null,
        },
      });
      if (reservado.count !== 1) throw new AppError(409, 'Este correo ya fue tomado por otro reintento. Actualice la vista.');

      const minioLinks = Array.isArray(envio.MINIO_LINKS)
        ? envio.MINIO_LINKS.filter((link): link is string => typeof link === 'string')
        : [];
      const contextData = (envio.CONTEXTO ?? {}) as Record<string, unknown>;
      const jobData: EmailJobData = {
        to: destinatario,
        subject: envio.ASUNTO,
        template_type: envio.TEMPLATE_TYPE as EmailJobData['template_type'],
        context_data: contextData,
        minio_links: minioLinks,
        id_registro: envio.ID_REGISTRO,
        id_cotizacion: idCotizacion,
        id_envio_correo: idEnvio,
        notificar_usuario_id: idUsuario ?? envio.SOLICITADO_POR,
        modulo_origen: envio.MODULO,
        tabla_origen: envio.MODULO,
        tipo_entry: 'prod',
      };

      try {
        const job = await getEmailQueue().add(envio.TEMPLATE_TYPE, jobData);
        await fastify.prisma.correo_envios.update({
          where: { ID_ENVIO_CORREO: idEnvio },
          data: { ID_JOB: String(job.id) },
        });
        await registrarBitacora(fastify.prisma, {
          action: 'REINTENTO_CORREO',
          tableName: 'correo_envios',
          recordId: idEnvio,
          userId: idUsuario,
          ip: request.ip,
          details: { idCotizacion, destinatario, jobId: String(job.id), tipo: envio.TIPO },
        });
        return { ok: true as const, data: { idEnvio, idJob: String(job.id), destinatario } };
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        await fastify.prisma.correo_envios.update({
          where: { ID_ENVIO_CORREO: idEnvio },
          data: { ESTADO: 'FALLIDO', ULTIMO_ERROR: motivo },
        });
        throw new AppError(503, `No se pudo programar el reenvío: ${motivo}`);
      }
    }
  );

  app.post(
    '/api/v1/cotizaciones',
    {
      preHandler: [
        fastify.authenticate,
        async () => {
          await verificarPlantillasOperativas(fastify.prisma);
        },
      ],
      schema: {
        body: crearCotizacionBodySchema,
        response: { 200: respuestaCotizacionSchema },
      },
    },
    async (request) => {
      assertPermission(request, 'cotizaciones', 'crear_editar');
      if ((request.body.estado ?? Estados.BORRADOR) === Estados.ENVIADA) {
        assertPermission(request, 'cotizaciones', 'enviar_al_cliente');
      }
      const idUsuario = Number(request.user?.sub ?? 0);

      // Validación de tupla única (instrumento + tipoServicio + sitio)
      const tuplasVistas = new Set<string>();
      for (const d of request.body.detalles) {
        const sitio = d.sitio ?? 'LABORATORIO';
        const clave = `${d.equipoDescripcion.trim().toLowerCase()}|${d.tipoServicio.trim().toLowerCase()}|${sitio}`;
        if (tuplasVistas.has(clave)) {
          throw new AppError(
            400,
            `El instrumento "${d.equipoDescripcion}" con servicio "${d.tipoServicio}" en "${sitio}" ya está agregado. Aumente la cantidad en la fila existente en lugar de duplicarla.`
          );
        }
        tuplasVistas.add(clave);
      }
      
      // 1. CORRECCIÓN: Declarar como string en lugar de number
      let id_jobs: string | undefined; 
      
      const resultado = await fastify.prisma.$transaction(async (tx) => {
        let subtotalDetalles = new Prisma.Decimal(0);
        const detallesMapeados = request.body.detalles.map((d) => {
          const valorTotal = calcularValorDetalle(d.cantidad, d.valorUnitario);
          subtotalDetalles = subtotalDetalles.plus(valorTotal);
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

        const viaticos = normalizarDinero(request.body.viaticos ?? 0);
        const descuentoPorcentaje = request.body.descuento || 0;
        const montoTotal = calcularMontoTotalCotizacion(subtotalDetalles, viaticos, descuentoPorcentaje);

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

        await registrarBitacora(tx, {
          action: 'CREATE',
          tableName: 'cotizaciones',
          recordId: nuevaCotizacion.ID_COTIZACION,
          userId: idUsuario,
          ip: request.ip,
          details: {
            codigo: nuevaCotizacion.CODIGO_COTIZACION,
            estado: nuevaCotizacion.ESTADO,
            montoTotal: Number(nuevaCotizacion.MONTO_TOTAL ?? 0),
          },
        });

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
    assertPermission(request, 'cotizaciones', 'crear_editar');
    const idCotizacion = Number(request.params.id) || request.body.idCotizacion;
    const idUsuario = Number(request.user?.sub ?? 0);
    const { viaticos: reqViaticos, descuento: reqDescuento, estado: reqEstado, codigo, detalles, cambios } = request.body;
    if (reqEstado === Estados.ENVIADA) {
      assertPermission(request, 'cotizaciones', 'enviar_al_cliente');
    }
    const otsParaRegenerar: Array<{ id: number; codigo: string }> = [];
    const recepcionesParaRegenerar: Array<{ id: number; codigo: string }> = [];
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

      const estadosCotizacionEditables = new Set(['BORRADOR', 'ENVIADA', 'APROBADA']);
      if (!estadosCotizacionEditables.has(existente.ESTADO)) {
        throw new AppError(
          409,
          `No se puede modificar la cotización ${existente.CODIGO_COTIZACION} mientras esté en estado '${existente.ESTADO}'. Solo se permiten cambios en borrador, enviada o aprobada.`,
        );
      }

      // 2. Bloquear cambios comerciales desde el inicio de la calibración.
      // Borrador, enviada, aprobada y OT asignada siguen siendo editables.
      if (existente.ordenes_trabajo && existente.ordenes_trabajo.length > 0) {
        for (const ot of existente.ordenes_trabajo) {
          await validarOTEditableAntesDeCalibrar(tx, ot.ID_ORDEN_TRABAJO, 'cotización');
        }
      }

      let subtotal = new Prisma.Decimal(0);
      
      // 3. LÓGICA DIFERENCIAL (CRUD DE DETALLES COTIZACIÓN)
      if (detalles) {
        // Validación de tupla única (instrumento + tipoServicio + sitio)
        const tuplasVistas = new Set<string>();
        for (const d of detalles) {
          const sitio = d.sitio ?? 'LABORATORIO';
          const clave = `${d.equipoDescripcion.trim().toLowerCase()}|${d.tipoServicio.trim().toLowerCase()}|${sitio}`;
          if (tuplasVistas.has(clave)) {
            throw new AppError(
              400,
              `El instrumento "${d.equipoDescripcion}" con servicio "${d.tipoServicio}" en "${sitio}" ya está agregado. Aumente la cantidad en la fila existente en lugar de duplicarla.`
            );
          }
          tuplasVistas.add(clave);
        }

        const detallesCrear = [];
        const detallesActualizar = [];
        const idsEntrantes = [];

        for (const d of detalles) {
          const valorTotal = calcularValorDetalle(d.cantidad, d.valorUnitario);
          subtotal = subtotal.plus(valorTotal);

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
        // 4. CASCADA: sincronizar TODAS las OTs y recepciones según su sitio.
        // ==========================================
        const desdoblarDetalles = (dets: typeof detalles) => {
          const out: any[] = [];
          let item = 1;
          for (const d of dets) {
            for (let i = 0; i < d.cantidad; i++) {
              out.push({
                ITEM: item++,
                INSTRUMENTO: d.equipoDescripcion,
                TIPO_SERVICIO: d.tipoServicio,
              });
            }
          }
          return out;
        };

        const detallesPorSitio = new Map<'LABORATORIO' | 'CLIENTE', typeof detalles>();
        for (const d of detalles) {
          const sitio = d.sitio === 'CLIENTE' ? 'CLIENTE' : 'LABORATORIO';
          const lista = detallesPorSitio.get(sitio) ?? [];
          lista.push(d);
          detallesPorSitio.set(sitio, lista);
        }

        // 4.1 Sincronizar cada OT (Master con todos; hijas con su sitio).
        for (const ot of existente.ordenes_trabajo) {
          const esMaster = ot.SITIO_CALIBRACION == null;
          const dets = esMaster
            ? detalles
            : (detallesPorSitio.get((ot.SITIO_CALIBRACION ?? 'LABORATORIO') as 'LABORATORIO' | 'CLIENTE') ?? []);
          const instrumentosDesdoblados = desdoblarDetalles(dets);
          const detallesOTActuales = ot.orden_trabajo_detalles;

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            if (i < detallesOTActuales.length) {
              await tx.orden_trabajo_detalles.update({
                where: { ID_DETALLE: detallesOTActuales[i].ID_DETALLE },
                data: { INSTRUMENTO: nuevo.INSTRUMENTO, TIPO_SERVICIO: nuevo.TIPO_SERVICIO },
              });
            } else {
              await tx.orden_trabajo_detalles.create({
                data: {
                  ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
                  ITEM: nuevo.ITEM,
                  INSTRUMENTO: nuevo.INSTRUMENTO,
                  TIPO_SERVICIO: nuevo.TIPO_SERVICIO,
                  asignado: null,
                },
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesOTActuales.length) {
            const idsEliminar = detallesOTActuales
              .slice(instrumentosDesdoblados.length)
              .map((d) => d.ID_DETALLE);
            await tx.orden_trabajo_detalles.updateMany({
              where: { ID_DETALLE: { in: idsEliminar } },
              data: { activacion: false },
            });
          }

          const consecutivo_ot = await generarConsecutivo(tx, 'OT', ot.CODIGO_OT);
          const update_ot = await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
            data: { CODIGO_OT: consecutivo_ot },
          });

          otsParaRegenerar.push({ id: update_ot.ID_ORDEN_TRABAJO, codigo: update_ot.CODIGO_OT });

          await evaluarTransicionesOT(tx, ot.ID_ORDEN_TRABAJO);
        }

        // 4.2 Sincronizar cada Recepción según su sitio.
        for (const recep of existente.recepciones_equipo) {
          const sitioRec = (recep.SITIO_CALIBRACION ?? 'LABORATORIO') as 'LABORATORIO' | 'CLIENTE';
          const dets = detallesPorSitio.get(sitioRec) ?? [];
          const instrumentosDesdoblados = desdoblarDetalles(dets);
          const detallesRecepActuales = recep.recepcion_equipo_detalles;

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            if (i < detallesRecepActuales.length) {
              await tx.recepcion_equipo_detalles.update({
                where: { ID_INSTRUMENTO: detallesRecepActuales[i].ID_INSTRUMENTO },
                data: { INSTRUMENTO: nuevo.INSTRUMENTO, ITEM: nuevo.ITEM },
              });
            } else {
              await tx.recepcion_equipo_detalles.create({
                data: {
                  ID_RECEPCION_FK: recep.ID_RECEPCION,
                  ITEM: nuevo.ITEM,
                  INSTRUMENTO: nuevo.INSTRUMENTO,
                },
              });
            }
          }
          if (instrumentosDesdoblados.length < detallesRecepActuales.length) {
            const idsEliminar = detallesRecepActuales
              .slice(instrumentosDesdoblados.length)
              .map((d) => d.ID_INSTRUMENTO);
            await tx.recepcion_equipo_detalles.updateMany({
              where: { ID_INSTRUMENTO: { in: idsEliminar } },
              data: { activacion: false },
            });
          }

          const consec = await generarConsecutivo(tx, 'REC', recep.CODIGO_RECEPCION);
          const update_rec = await tx.recepciones_equipo.update({
            where: { CODIGO_RECEPCION: recep.CODIGO_RECEPCION },
            data: { CODIGO_RECEPCION: consec },
          });
          recepcionesParaRegenerar.push({ id: update_rec.ID_RECEPCION, codigo: update_rec.CODIGO_RECEPCION });
        }
      } else {
        subtotal = existente.cotizacion_detalles
          .filter((d) => d.activacion !== false)
          .reduce(
            (acc, d) => acc.plus(calcularValorDetalle(d.CANTIDAD, d.VALOR_UNITARIO)),
            new Prisma.Decimal(0),
          );
      }

      // 5. ACTUALIZACIÓN FINANCIERA Y MAESTRA
      const viaticos = reqViaticos !== undefined
        ? normalizarDinero(reqViaticos)
        : existente.viaticos ?? new Prisma.Decimal(0);
      const descuento = reqDescuento !== undefined ? reqDescuento : Number(existente.descuento || 0);
      const montoTotal = calcularMontoTotalCotizacion(subtotal, viaticos, descuento);

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
          UPDATED_AT: new Date(),
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

      await registrarBitacora(tx, {
        action: 'UPDATE',
        tableName: 'cotizaciones',
        recordId: idCotizacion,
        userId: idUsuario,
        ip: request.ip,
        details: {
          codigo: cotizacionActualizada.CODIGO_COTIZACION,
          estado: cotizacionActualizada.ESTADO,
          montoTotal: Number(cotizacionActualizada.MONTO_TOTAL ?? 0),
          ...(cambios ? { motivo: cambios.descripcion } : {}),
        },
      });

      return cotizacionActualizada;
    });

const trackingJobs: Record<string, string[]> = {};

    // 7.1. SIEMPRE generamos el Excel de la Cotización actualizada
    const quoteTracker_Cot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
    await excelquue.add('actualizacion_cotizacion', {
      id_job: quoteTracker_Cot.id, 
      tipo_entry: 'prod', 
      id_registro: resultado.ID_COTIZACION,
      action: 'cot_update',
      codigo_actual: resultado.CODIGO_COTIZACION,
      tipo: 1,
      id_usuario: idUsuario,
      id_cotizacion: resultado.ID_COTIZACION,
      force_regenerate: true,
    });
    trackingJobs.cot = [quoteTracker_Cot.id];

    // 7.2. SOLO generamos el Excel de OT si realmente existe una OT vinculada
    for (const otActualizada of otsParaRegenerar) {
      const ordeneo_tracke = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_ordenes_ot', {
        id_job: ordeneo_tracke.id, 
        tipo_entry: 'prod', 
        id_registro: otActualizada.id,
        codigo_actual: otActualizada.codigo,
        action: 'ot_actualizar',
        tipo: 2,
        id_usuario: idUsuario,
        id_cotizacion: resultado.ID_COTIZACION,
        force_regenerate: true,
      });
      (trackingJobs.ot ??= []).push(ordeneo_tracke.id);
    }

    // 7.3. SOLO generamos el Excel de Recepción si realmente existe una Recepción vinculada
    for (const recepcionActualizada of recepcionesParaRegenerar) {
      const receprtracker = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
      await excelquue.add('actualizacion_recepciones', {
        id_job: receprtracker.id, 
        tipo_entry: 'prod', 
        id_registro: recepcionActualizada.id,
        codigo_actual: recepcionActualizada.codigo,
        tipo: 3,
        id_usuario: idUsuario,
        id_cotizacion: resultado.ID_COTIZACION,
        force_regenerate: true,
      });
      (trackingJobs.rec ??= []).push(receprtracker.id);
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
    const { nuevoEstado, motivoRechazo } = request.body as {
      nuevoEstado: Estados;
      motivoRechazo?: string | null;
    };
    const idUsuario = Number(request.user?.sub ?? 0);

    if (nuevoEstado === Estados.RECHAZADA || nuevoEstado === Estados.APROBADA) {
      assertPermission(request, 'cotizaciones', 'aprobar_rechazar');
    } else if (nuevoEstado === Estados.EN_SEGUIMIENTO) {
      assertPermission(request, 'cotizaciones', 'crear_editar');
    } else {
      throw new AppError(403, 'Este cambio de estado solo puede hacerse desde el flujo de aprobación del cliente.');
    }

    if (nuevoEstado === Estados.RECHAZADA && !motivoRechazo?.trim()) {
      throw new AppError(400, 'Debe indicar el motivo del rechazo.');
    }

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
          data: {
            ESTADO: nuevoEstado,
            MOTIVO_RECHAZO: nuevoEstado === Estados.RECHAZADA ? motivoRechazo?.trim() ?? null : null,
          },
          include: { clientes: true, cotizacion_detalles: true }
        });

        // 3. Registrar en el historial de estados
        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: idCotizacion,
            ESTADO_ANTERIOR: actual.ESTADO,
            ESTADO_NUEVO: nuevoEstado,
            ID_USUARIO_FK: idUsuario,
            MOTIVO: nuevoEstado === Estados.RECHAZADA ? motivoRechazo?.trim() ?? null : null,
          }
        });

        const dataOTs: any[] = [];
        const dataRecs: any[] = [];

        // 4. Interceptar APROBACIÓN: generar OT(s) + recepción(es) según homogeneidad de sitio.
        if (nuevoEstado === 'APROBADA') {
          const generacion = await generarOrdenesTrabajoAprobacion(
            tx,
            cotizacionActualizada as any,
          );
          dataOTs.push(...generacion.ots);
          dataRecs.push(...generacion.recs);
        }

        await registrarBitacora(tx, {
          action: 'CAMBIO_ESTADO',
          tableName: 'cotizaciones',
          recordId: idCotizacion,
          userId: idUsuario,
          ip: request.ip,
          details: {
            codigo: cotizacionActualizada.CODIGO_COTIZACION,
            estadoAnterior: actual.ESTADO,
            estadoNuevo: nuevoEstado,
            ...(nuevoEstado === Estados.RECHAZADA ? { motivoRechazo: motivoRechazo?.trim() } : {}),
          },
        });

        // Notificar al usuario creador/dueño de la cotización.
        const creador = await resolverUsuarioCreadorCotizacion(tx, idCotizacion);
        if (nuevoEstado === Estados.RECHAZADA) {
          await notificarUsuario(tx, {
            idUsuario: creador,
            mensaje: `La cotización ${cotizacionActualizada.CODIGO_COTIZACION} fue rechazada${motivoRechazo?.trim() ? `: ${motivoRechazo.trim()}` : ''}.`,
            modulo: 'COTIZACIONES',
            nivelPrioridad: 'ALTA',
          });
        } else if (nuevoEstado === Estados.EN_SEGUIMIENTO) {
          await notificarUsuario(tx, {
            idUsuario: creador,
            mensaje: `La cotización ${cotizacionActualizada.CODIGO_COTIZACION} pasó a seguimiento comercial.`,
            modulo: 'COTIZACIONES',
            nivelPrioridad: 'NORMAL',
          });
        }

        return { cotizacion: cotizacionActualizada, ots: dataOTs, recs: dataRecs };
      });

      // 5. DETONAR GENERACIÓN DE EXCEL (BULLMQ)
   const trackingJobs: Record<string, string[]> = {};

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
        tipo: 1,
        id_usuario: idUsuario,
        id_cotizacion: resultado.cotizacion.ID_COTIZACION,
      });
      trackingJobs.cot = [quoteTrackerCot.id];

      // 2. DETONAR TIPO 2 (Orden de Trabajo) — una por cada OT generada/reutilizada
      const hayMasterResultado = resultado.ots.some((o: any) => o.SITIO_CALIBRACION == null);
      for (const ot of resultado.ots) {
        const esMaster = ot.SITIO_CALIBRACION == null;
        const quoteTrackerOT = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_ot_excel', {
          id_job: quoteTrackerOT.id, 
          tipo_entry: 'prod',
          id_registro: ot.ID_ORDEN_TRABAJO,
          action: esMaster || !hayMasterResultado ? "ot_create" : "ot_update",
          codigo_actual: ot.CODIGO_OT,
          tipo: 2,
          id_usuario: idUsuario,
          id_cotizacion: resultado.cotizacion.ID_COTIZACION,
        });
        (trackingJobs.ot ??= []).push(quoteTrackerOT.id);
      }

      // 3. DETONAR TIPO 3 (Recepción) — una por cada Recepción generada/reutilizada
      for (const rec of resultado.recs) {
        const quoteTrackerRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('generar_recepcion_excel', {
          id_job: quoteTrackerRec.id, 
          tipo_entry: 'prod',
          id_registro: rec.ID_RECEPCION,
          codigo_actual: rec.CODIGO_RECEPCION,
          tipo: 3,
          id_usuario: idUsuario,
          id_cotizacion: resultado.cotizacion.ID_COTIZACION,
        });
        (trackingJobs.rec ??= []).push(quoteTrackerRec.id);
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

  // ==========================================================================
  // GET /api/v1/cotizaciones/aprobar/:token  (PÚBLICO)
  // Aprobación de cotización mediante enlace externo enviado por correo.
  // No requiere autenticación: la seguridad reside en el token firmado.
  // ==========================================================================
  const renderHtmlAprobacion = (
    titulo: string,
    mensaje: string,
    exito: boolean
  ): string => `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titulo}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 40px 20px; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,0.08); }
    .header { padding: 28px 24px; text-align: center; color: #ffffff; background-color: ${exito ? '#15803D' : '#B91C1C'}; }
    .header h2 { margin: 0; font-size: 20px; }
    .content { padding: 28px 24px; color: #333; line-height: 1.6; }
    .footer { background: #eeeeee; text-align: center; padding: 16px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header"><h2>${titulo}</h2></div>
    <div class="content"><p>${mensaje}</p></div>
    <div class="footer"><strong>Laboratorio de Calibración y Ensayo - USC</strong><br/>Mensaje automático del sistema MetroSoft.</div>
  </div>
</body>
</html>`;

  app.get(
    '/api/v1/cotizaciones/aprobar',
    {
      schema: { querystring:z.object({ token: z.string() }) },
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };

      const verificado = verificarTokenAprobacion(token);
      if (!verificado) {
        return reply
          .type('text/html')
          .code(200)
          .send(renderHtmlAprobacion('Enlace inválido', 'El enlace de aprobación no es válido o ha expirado. Por favor contacte al laboratorio.', false));
      }

      const cotizacion = await fastify.prisma.cotizaciones.findUnique({
        where: { ID_COTIZACION: verificado.cotizacionId },
        include: { clientes: true, cotizacion_detalles: true },
      });

      if (!cotizacion) {
        return reply
          .type('text/html')
          .code(200)
          .send(renderHtmlAprobacion('Cotización no encontrada', 'No se encontró la cotización solicitada.', false));
      }

      if (cotizacion.ESTADO !== Estados.ENVIADA) {
        const estados: Record<string, string> = {
          APROBADA: 'ya fue aprobada',
          RECHAZADA: 'fue rechazada',
          EN_SEGUIMIENTO: 'se encuentra en seguimiento comercial',
          BORRADOR: 'aún no ha sido enviada',
        };
        return reply
          .type('text/html')
          .code(200)
          .send(
            renderHtmlAprobacion(
              'Cotización ya procesada',
              `La cotización ${cotizacion.CODIGO_COTIZACION} ${estados[cotizacion.ESTADO] ?? `se encuentra en estado ${cotizacion.ESTADO}`}.`,
              false
            )
          );
      }

      let ots: any[] = [];
      let recs: any[] = [];

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        // Reclamo condicional para que dos clics simultáneos en el link no
        // generen dos juegos de OT/recepciones.
        const reclamo = await tx.cotizaciones.updateMany({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION, ESTADO: Estados.ENVIADA },
          data: { ESTADO: Estados.APROBADA, MOTIVO_RECHAZO: null },
        });
        if (reclamo.count !== 1) return { aprobadaAhora: false as const, cotizacion: null, creador: null };

        const actualizada = await tx.cotizaciones.findUniqueOrThrow({
          where: { ID_COTIZACION: cotizacion.ID_COTIZACION },
          include: { clientes: true, cotizacion_detalles: true },
        });

        await tx.historial_estado_cotizacion.create({
          data: {
            ID_COTIZACION_FK: actualizada.ID_COTIZACION,
            ESTADO_ANTERIOR: Estados.ENVIADA,
            ESTADO_NUEVO: Estados.APROBADA,
            ID_USUARIO_FK:1,
            MOTIVO: "aprobación por enlace de correo",
          },
        });

        const generacion = await generarOrdenesTrabajoAprobacion(tx, actualizada);
        ots = generacion.ots;
        recs = generacion.recs;

        await registrarBitacora(tx, {
          action: 'APROBACION_ENLACE',
          tableName: 'cotizaciones',
          recordId: actualizada.ID_COTIZACION,
          userId: null,
          ip: request.ip,
          details: {
            codigo: actualizada.CODIGO_COTIZACION,
            estadoAnterior: Estados.ENVIADA,
            estadoNuevo: Estados.APROBADA,
            sistema: true,
            origen: 'enlace_correo_cliente',
          },
        });

        const creador = await resolverUsuarioCreadorCotizacion(tx, actualizada.ID_COTIZACION);
        await notificarUsuario(tx, {
          idUsuario: creador,
          mensaje: `El cliente aprobó la cotización ${actualizada.CODIGO_COTIZACION} mediante el enlace enviado por correo.`,
          modulo: 'COTIZACIONES',
          nivelPrioridad: 'ALTA',
        });

        return { aprobadaAhora: true as const, cotizacion: actualizada, creador };
      });

      if (!resultado.aprobadaAhora || !resultado.cotizacion) {
        return reply
          .type('text/html')
          .code(200)
          .send(renderHtmlAprobacion('Cotización ya procesada', `La cotización ${cotizacion.CODIGO_COTIZACION} ya fue aprobada. No es necesario aprobarla otra vez.`, false));
      }
      const cotizacionAprobada = resultado.cotizacion;

      // Detonar generación de Excel/PDF y correo de confirmación (mismo flujo que la aprobación interna).
      try {
        const quoteTrackerCot = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
        await excelquue.add('actualizacion_estado_cot', {
          id_job: quoteTrackerCot.id,
          tipo_entry: 'prod',
          id_registro: cotizacionAprobada.ID_COTIZACION,
          action: 'aprove',
          codigo_actual: cotizacionAprobada.CODIGO_COTIZACION,
          tipo: 1,
          id_usuario: resultado.creador ?? undefined,
          id_cotizacion: cotizacionAprobada.ID_COTIZACION,
        });

        const hayMasterOts = ots.some((o: any) => o.SITIO_CALIBRACION == null);
        for (const ot of ots) {
          const esMaster = ot.SITIO_CALIBRACION == null;
          const quoteTrackerOT = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
          await excelquue.add('generar_ot_excel', {
            id_job: quoteTrackerOT.id,
            tipo_entry: 'prod',
            id_registro: ot.ID_ORDEN_TRABAJO,
            action: esMaster || !hayMasterOts ? 'ot_create' : 'ot_update',
            codigo_actual: ot.CODIGO_OT,
            tipo: 2,
            id_usuario: resultado.creador ?? undefined,
            id_cotizacion: cotizacionAprobada.ID_COTIZACION,
          });
        }

        for (const rec of recs) {
          const quoteTrackerRec = await fastify.prisma.quote.create({ data: { status: 'PENDING' } });
          await excelquue.add('generar_recepcion_excel', {
            id_job: quoteTrackerRec.id,
            tipo_entry: 'prod',
            id_registro: rec.ID_RECEPCION,
            action: 'rec_create',
            codigo_actual: rec.CODIGO_RECEPCION,
            tipo: 3,
            id_usuario: resultado.creador ?? undefined,
            id_cotizacion: cotizacionAprobada.ID_COTIZACION,
          });
        }
      } catch (error) {
        fastify.log.error(error, 'Error encolando generación documental tras aprobación por enlace');
      }

      return reply
        .type('text/html')
        .code(200)
        .send(
          renderHtmlAprobacion(
            'Cotización aprobada',
            `La cotización ${cotizacionAprobada.CODIGO_COTIZACION} ha sido aprobada correctamente. Nuestro equipo continuará con la recepción de sus equipos y la ejecución del servicio.`,
            true
          )
        );
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
        cotizacion: [] as ReturnType<typeof toItem>[],
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
          categorias.cotizacion.push(item);
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
