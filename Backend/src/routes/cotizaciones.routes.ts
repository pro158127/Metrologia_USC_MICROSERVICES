import { diasVigenciaCotizacion, inicioVigenciaCotizacion, fechaVencimientoCotizacion } from '../services/vigencia-cotizacion.service.js';
import { datosSitioOT, ordenPrincipalVigente, verificarGruposOperativos } from '../services/recepcion-ot-sync.service.js';
import { esPdfSelladoVigente, esPdfGenerado, nombreArchivoDocumento, type TipoDocumentoGenerado } from '../services/documento-generado.service.js';
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
import { generarOrdenesTrabajoAprobacion, reconciliarRecepcionesPendientes } from '../services/cotizacion-aprobacion.service.js';
import { ajustarIdsUnidades, crearIdsUnidades, obtenerIdsUnidadesEnCalibracion } from '../services/instrument-identity.service.js';
import { calcularMontoTotalCotizacion, calcularValorDetalle, normalizarDinero } from '../services/cotizacion-money.service.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import { cotizacionListaParaSeguimiento } from '../services/seguimiento-cierre.service.js';
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
import { correoValido, nuevoIdColaCorreo } from '../services/email-delivery.service.js';
import { registrarGeneracionPendiente } from '../services/generacion-pendiente.service.js';


async function validarCotizacionParaEnvio(
  tx: Prisma.TransactionClient, idCotizacion: number, idCliente: number | null,
) {
  const [cantidad, cliente] = await Promise.all([
    tx.cotizacion_detalles.count({ where: { ID_COTIZACION_FK: idCotizacion, CANTIDAD: { gt: 0 }, activacion: true } }),
    idCliente != null ? tx.clientes.findUnique({ where: { ID_CLIENTE: idCliente }, select: { CORREO: true } }) : null,
  ]);
  if (!cantidad) throw new AppError(409, 'Agrega al menos un instrumento antes de enviar la cotización.');
  if (!correoValido.safeParse(cliente?.CORREO).success) {
    throw new AppError(409, 'Actualiza el correo del cliente antes de enviar la cotización.');
  }
}

function snapshotCotizacion(detalles: Array<{
  idDetalle?: number;
  equipoDescripcion: string;
  tipoServicio: string;
  magnitud: string;
  normaTecnica?: string | null;
  cantidad: number;
  valorUnitario: number | string | Prisma.Decimal;
  sitio?: 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC' | null;
}>): string {
  return JSON.stringify(detalles.map((d) => ({
    id: d.idDetalle ?? null,
    equipo: d.equipoDescripcion.trim(),
    servicio: d.tipoServicio.trim(),
    magnitud: d.magnitud.trim(),
    norma: d.normaTecnica?.trim() || null,
    cantidad: d.cantidad,
    valorUnitario: new Prisma.Decimal(d.valorUnitario).toFixed(2),
    sitio: d.sitio ?? 'LABORATORIO',
  })).sort((a, b) => (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)));
}

// Esquemas de documentos categorizados por cotización
const documentoVersionItemSchema = z.object({
  idVersion: z.number(),
  version: z.number(),
  rutaUrl: z.string(),
  createdAt: z.coerce.date(),
  usuario: z.string().nullable(),
  nombre: z.string().optional(),
});
const documentoItemSchema = z.object({
  idDocumento: z.number(),
  idVersionActual: z.number().optional(),
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
    archivados: z.object({ cotizacion: z.array(documentoItemSchema), ordenTrabajo: z.array(documentoItemSchema),
      recepcion: z.array(documentoItemSchema), certificados: z.array(documentoCertificadoItemSchema) }),
    pendientes: z.object({ cotizacion: z.array(z.string()), ordenTrabajo: z.array(z.string()), recepcion: z.array(z.string()), certificados: z.array(z.string()) }),
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
        where: { ID_COTIZACION_FK: idCotizacion, MODULO: { in: ['cotizaciones', 'ordenes_trabajo'] } },
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

      return fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${idCotizacion} FOR UPDATE`;
        const envio = await tx.correo_envios.findFirst({
          where: { ID_ENVIO_CORREO: idEnvio, ID_COTIZACION_FK: idCotizacion,
            MODULO: { in: ['cotizaciones', 'ordenes_trabajo'] } },
        });
        if (!envio) throw new AppError(404, 'El envío documental no existe.');
        if (envio.ESTADO !== 'FALLIDO') throw new AppError(409, 'Solo se pueden reintentar los correos fallidos.');

        const cotizacion = await tx.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacion },
          select: { ID_COTIZACION: true, ID_CLIENTE_FK: true, CODIGO_COTIZACION: true, ESTADO: true, CREATED_AT: true, UPDATED_AT: true,
            clientes: { select: { CORREO: true } } },
        });
        if (!cotizacion) throw new AppError(404, 'Cotización no encontrada');
        const destinatario = correoNuevo ?? cotizacion.clientes?.CORREO ?? envio.DESTINATARIO;
        if (!correoValido.safeParse(destinatario).success) {
          throw new AppError(409, 'Ingrese una dirección válida para reintentar.');
        }
        const contextData: Record<string, string> = { ...(envio.CONTEXTO as Record<string, string> | null), emailDestino: destinatario };
        if (envio.TEMPLATE_TYPE === 'crear_cotizacion') {
          const fecha = fechaVencimientoCotizacion(await inicioVigenciaCotizacion(tx, cotizacion), await diasVigenciaCotizacion(tx));
          const segundos = Math.ceil((fecha.getTime() - Date.now()) / 1000);
          if (cotizacion.ESTADO !== Estados.ENVIADA || segundos <= 0 || !contextData.linkAprobacion ||
              contextData.numeroCotizacion !== cotizacion.CODIGO_COTIZACION) {
            throw new AppError(409, 'La cotización ya no admite aprobación mediante ese enlace. Consulte su estado vigente.');
          }
          const link = new URL(contextData.linkAprobacion);
          link.searchParams.set('token', firmarTokenAprobacion(idCotizacion, segundos, cotizacion.CODIGO_COTIZACION));
          contextData.linkAprobacion = link.toString();
          contextData.fechaVencimiento = fecha.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
        }

        const idJob = nuevoIdColaCorreo();
        const reservado = await tx.correo_envios.updateMany({
          where: { ID_ENVIO_CORREO: idEnvio, ESTADO: 'FALLIDO' },
          data: { ESTADO: 'PENDIENTE', DESTINATARIO: destinatario, CONTEXTO: contextData,
            ID_JOB: idJob, ULTIMO_ERROR: null, SOLICITADO_POR: idUsuario ?? envio.SOLICITADO_POR, ENVIADO_AT: null },
        });
        if (!reservado.count) throw new AppError(409, 'Este correo ya fue tomado por otro reintento.');
        if (correoNuevo && cotizacion.ID_CLIENTE_FK && cotizacion.clientes?.CORREO !== correoNuevo) {
          await tx.clientes.update({ where: { ID_CLIENTE: cotizacion.ID_CLIENTE_FK }, data: { CORREO: correoNuevo } });
          await registrarBitacora(tx, {
            action: 'ACTUALIZAR_CORREO_PARA_REENVIO', tableName: 'clientes', recordId: cotizacion.ID_CLIENTE_FK,
            userId: idUsuario, ip: request.ip, details: { idCotizacion, correoAnterior: cotizacion.clientes?.CORREO, correoNuevo },
          });
        }
        await registrarBitacora(tx, {
          action: 'REINTENTO_CORREO', tableName: 'correo_envios', recordId: idEnvio, userId: idUsuario, ip: request.ip,
          details: { idCotizacion, destinatario, jobId: idJob, tipo: envio.TIPO },
        });
        return { ok: true as const, data: { idEnvio, idJob, destinatario } };
      });
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
            ID_UNIDADES: crearIdsUnidades(d.cantidad),
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
        
        const trabajo = await registrarGeneracionPendiente(tx, 'procesar_excel', {
          tipo: 1, id_registro: nuevaCotizacion.ID_COTIZACION, tipo_entry: 'prod',
          action: 'cot_create', id_usuario: idUsuario,
        });
        
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

      const data = cotizacionRawToDtoSchema.parse(cotizacion);
      if (cotizacion.ESTADO === Estados.ENVIADA) {
        const [inicio, dias] = await Promise.all([
          inicioVigenciaCotizacion(fastify.prisma, cotizacion), diasVigenciaCotizacion(fastify.prisma),
        ]);
        data.fechaVencimiento = fechaVencimientoCotizacion(inicio, dias);
      }
      return { ok: true as const, data };
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
    const { viaticos: reqViaticos, descuento: reqDescuento, estado: reqEstado, detalles, cambios } = request.body;
    if (reqEstado === Estados.ENVIADA) {
      assertPermission(request, 'cotizaciones', 'enviar_al_cliente');
    }
    const otsParaRegenerar: Array<{ id: number; codigo: string }> = [];
    const recepcionesParaRegenerar: Array<{ id: number; codigo: string }> = [];
    let regenerarCotizacionDoc = false;
    const resultado = await fastify.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${idCotizacion} FOR UPDATE`;
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
      if (request.body.codigo && request.body.codigo !== existente.CODIGO_COTIZACION) {
        throw new AppError(409, 'La cotización cambió desde que abriste el formulario. Ciérralo y vuelve a abrirlo.');
      }

      const estadosCotizacionEditables = new Set(['BORRADOR', 'ENVIADA', 'APROBADA']);
      if (!estadosCotizacionEditables.has(existente.ESTADO)) {
        throw new AppError(
          409,
          `No se puede modificar la cotización ${existente.CODIGO_COTIZACION} mientras esté en estado '${existente.ESTADO}'. Solo se permiten cambios en borrador, enviada o aprobada.`,
        );
      }

      if (existente.ESTADO === Estados.APROBADA && await cotizacionListaParaSeguimiento(tx, idCotizacion)) {
        throw new AppError(409, 'La cotización está cerrada porque ya se enviaron los certificados y finalizó la recepción.');
      }

      const detallesActivosActuales = existente.cotizacion_detalles
        .filter((d) => d.activacion !== false)
        .map((d) => ({
          idDetalle: d.ID_DETALLE,
          equipoDescripcion: d.EQUIPO_DESCRIPCION,
          tipoServicio: d.TIPO_SERVICIO,
          magnitud: d.MAGNITUD,
          normaTecnica: d.NORMA_TECNICA,
          cantidad: d.CANTIDAD,
          valorUnitario: d.VALOR_UNITARIO,
          sitio: d.sitio ?? 'LABORATORIO' as const,
        }));
      const detallesCambiaron = detalles !== undefined &&
        snapshotCotizacion(detalles) !== snapshotCotizacion(detallesActivosActuales);
      const cambiosEscalares =
        (request.body.idCliente !== undefined && request.body.idCliente !== existente.ID_CLIENTE_FK) ||
        (reqViaticos !== undefined && !new Prisma.Decimal(reqViaticos).eq(existente.viaticos ?? 0)) ||
        (reqDescuento !== undefined && reqDescuento !== Number(existente.descuento ?? 0));
      regenerarCotizacionDoc = detallesCambiaron || Boolean(cambiosEscalares);

      let subtotal = new Prisma.Decimal(0);
      
      // 3. LÓGICA DIFERENCIAL (CRUD DE DETALLES COTIZACIÓN)
      if (detalles) {
        const idsCertificados = await obtenerIdsUnidadesEnCalibracion(tx, idCotizacion);
        const detalleActualPorId = new Map(existente.cotizacion_detalles.map((detalle) => [detalle.ID_DETALLE, detalle]));
        const idsCotizados = new Set(existente.cotizacion_detalles.flatMap((detalle) => detalle.ID_UNIDADES ?? []));
        const certificadoSinVinculo = [...idsCertificados].find((id) => !idsCotizados.has(id));
        if (certificadoSinVinculo) {
          throw new AppError(409, 'Hay un certificado histórico cuyo instrumento no tiene identidad vinculada con la cotización. No se aplicaron cambios para proteger la trazabilidad.');
        }
        const idsEntrantesSet = new Set(detalles.map((detalle) => detalle.idDetalle).filter((id): id is number => Boolean(id && id <= 1_000_000_000_000)));

        for (const actual of existente.cotizacion_detalles.filter((detalle) => detalle.activacion)) {
          const idsProtegidos = (actual.ID_UNIDADES ?? []).filter((id) => idsCertificados.has(id));
          if (idsProtegidos.length && !idsEntrantesSet.has(actual.ID_DETALLE)) {
            throw new AppError(409, `No se puede eliminar "${actual.EQUIPO_DESCRIPCION}": tiene unidades con certificado creado.`);
          }
        }

        for (const entrada of detalles) {
          const actual = entrada.idDetalle ? detalleActualPorId.get(entrada.idDetalle) : undefined;
          if (!actual) continue;
          const idsProtegidos = (actual.ID_UNIDADES ?? []).filter((id) => idsCertificados.has(id));
          if (!idsProtegidos.length) continue;
          const cambioIdentidad = actual.EQUIPO_DESCRIPCION !== entrada.equipoDescripcion ||
            actual.TIPO_SERVICIO !== entrada.tipoServicio ||
            actual.MAGNITUD !== entrada.magnitud ||
            (actual.NORMA_TECNICA ?? '') !== (entrada.normaTecnica ?? '') ||
            (actual.sitio ?? 'LABORATORIO') !== (entrada.sitio ?? 'LABORATORIO');
          if (cambioIdentidad) {
            throw new AppError(409, `No se pueden cambiar las características de "${actual.EQUIPO_DESCRIPCION}": tiene unidades con certificado creado.`);
          }
          if (entrada.cantidad < idsProtegidos.length) {
            throw new AppError(409, `La cantidad no puede ser menor a ${idsProtegidos.length}; esas unidades tienen certificado creado.`);
          }
        }

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
              ID_UNIDADES: crearIdsUnidades(d.cantidad),
              VALOR_UNITARIO: d.valorUnitario,
              VALOR_TOTAL: valorTotal,
              sitio: d.sitio ?? 'LABORATORIO',
            });
          } else {
            if(d.idDetalle !== undefined) {
              idsEntrantes.push(d.idDetalle);
              const actual = detalleActualPorId.get(d.idDetalle);
              if (!actual?.activacion) throw new AppError(404, 'Una de las líneas de cotización ya no existe. Actualice la pantalla e intente de nuevo.');
              const idsUnidades = ajustarIdsUnidades(actual.ID_UNIDADES ?? [], d.cantidad, idsCertificados);

              detallesActualizar.push(
                
                tx.cotizacion_detalles.update({
                  where: { ID_DETALLE: d.idDetalle },
                  data: {
                    EQUIPO_DESCRIPCION: d.equipoDescripcion,
                    TIPO_SERVICIO: d.tipoServicio,
                    MAGNITUD: d.magnitud,
                    NORMA_TECNICA: d.normaTecnica ?? null,
                    CANTIDAD: d.cantidad,
                    ID_UNIDADES: idsUnidades,
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
        await tx.cotizacion_detalles.updateMany({
          where: { ID_COTIZACION_FK: idCotizacion, activacion: true, ID_DETALLE: { notIn: idsEntrantes } },
          data: { activacion: false },
        });
        // B. Actualizar
        if (detallesActualizar.length > 0) await Promise.all(detallesActualizar);
        // C. Crear
        if (detallesCrear.length > 0) await tx.cotizacion_detalles.createMany({ data: detallesCrear });
        const detallesConIdentidad = (await tx.cotizacion_detalles.findMany({
          where: { ID_COTIZACION_FK: idCotizacion, activacion: true },
        })).map((detalle) => ({
          equipoDescripcion: detalle.EQUIPO_DESCRIPCION,
          tipoServicio: detalle.TIPO_SERVICIO,
          cantidad: detalle.CANTIDAD,
          sitio: detalle.sitio,
          ID_UNIDADES: detalle.ID_UNIDADES,
        }));
        if (detallesCambiaron) {
          const consecutivo = await generarConsecutivo(tx, 'COT', existente.CODIGO_COTIZACION);
          await tx.cotizaciones.update({
            where: { ID_COTIZACION: idCotizacion },
            data: { CODIGO_COTIZACION: consecutivo },
          });
        }
        
        // ==========================================
        // 4. CASCADA: sincronizar TODAS las OTs y recepciones según su sitio.
        // ==========================================
        const desdoblarDetalles = (dets: typeof detallesConIdentidad) => {
          const out: { ITEM: number; INSTRUMENTO: string; TIPO_SERVICIO: string; ID_UNIDAD_FK: string; sitio_calibracion: 'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC' }[] = [];
          let item = 1;
          for (const d of dets) {
            for (let i = 0; i < d.cantidad; i++) {
              out.push({
                ITEM: item++,
                INSTRUMENTO: d.equipoDescripcion,
                TIPO_SERVICIO: d.tipoServicio,
                ID_UNIDAD_FK: d.ID_UNIDADES[i],
                sitio_calibracion: d.sitio ?? 'LABORATORIO',
              });
            }
          }
          return out;
        };

        const detallesPorSitio = new Map<'LABORATORIO' | 'CLIENTE' | 'INTERNO_USC', typeof detallesConIdentidad>();
        for (const d of detallesConIdentidad) {
          const sitio = d.sitio ?? 'LABORATORIO';
          const lista = detallesPorSitio.get(sitio) ?? [];
          lista.push(d);
          detallesPorSitio.set(sitio, lista);
        }

        const familiaActiva = existente.ordenes_trabajo.filter((orden) => orden.VIGENTE !== false);
        const idsMaestras = new Set(familiaActiva.flatMap((orden) => orden.ID_OT_PADRE_FK == null ? [] : [orden.ID_OT_PADRE_FK]));
        const hijosActivos = familiaActiva.filter((orden) => !idsMaestras.has(orden.ID_ORDEN_TRABAJO));
        const recepcionesActivas = existente.recepciones_equipo.filter((rec) => rec.VIGENTE && rec.activacion !== false);
        const sitioOT = (orden: typeof familiaActiva[number]) => orden.SITIO_CALIBRACION ??
          recepcionesActivas.find((rec) => rec.ID_ORDEN_TRABAJO_FK === orden.ID_ORDEN_TRABAJO)?.SITIO_CALIBRACION ??
          (orden.ES_EN_SITIO ? 'CLIENTE' : orden.ES_INTERNO_USC ? 'INTERNO_USC' : 'LABORATORIO');
        const equiposRecepcionPorUnidad = new Map(recepcionesActivas.flatMap((rec) =>
          rec.recepcion_equipo_detalles.flatMap((equipo) =>
            equipo.activacion !== false && equipo.ID_UNIDAD_FK ? [[equipo.ID_UNIDAD_FK, equipo] as const] : [])));
        const equiposOTPorUnidad = new Map(hijosActivos.flatMap((orden) =>
          orden.orden_trabajo_detalles.flatMap((equipo) =>
            equipo.activacion !== false && equipo.ID_UNIDAD_FK ? [[equipo.ID_UNIDAD_FK, equipo] as const] : [])));

        // 4.1 Sincronizar cada OT (Master con todos; hijas con su sitio).
        for (const ot of detallesCambiaron ? existente.ordenes_trabajo.filter((orden) => orden.VIGENTE !== false) : []) {
          const esMaster = idsMaestras.has(ot.ID_ORDEN_TRABAJO);
          const dets = esMaster
            ? detallesConIdentidad
            : (detallesPorSitio.get(sitioOT(ot)) ?? []);
          const instrumentosDesdoblados = desdoblarDetalles(dets);
          const detallesOTActuales = ot.orden_trabajo_detalles.filter((detalle) => detalle.activacion !== false);
          const idsUnidadesPresentes = new Set<string>();
          let otCambio = !esMaster && ot.SITIO_CALIBRACION == null;
          if (otCambio) {
            await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
              data: datosSitioOT(sitioOT(ot)),
            });
          }

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            const existentePorUnidad = detallesOTActuales.find((detalle) => detalle.ID_UNIDAD_FK === nuevo.ID_UNIDAD_FK);
            if (existentePorUnidad) {
              idsUnidadesPresentes.add(nuevo.ID_UNIDAD_FK);
              if (existentePorUnidad.ITEM !== nuevo.ITEM || existentePorUnidad.INSTRUMENTO !== nuevo.INSTRUMENTO || existentePorUnidad.TIPO_SERVICIO !== nuevo.TIPO_SERVICIO || existentePorUnidad.sitio_calibracion !== nuevo.sitio_calibracion) {
                otCambio = true;
                await tx.orden_trabajo_detalles.update({
                  where: { ID_DETALLE: existentePorUnidad.ID_DETALLE },
                  data: { ITEM: nuevo.ITEM, INSTRUMENTO: nuevo.INSTRUMENTO, TIPO_SERVICIO: nuevo.TIPO_SERVICIO, sitio_calibracion: nuevo.sitio_calibracion, activacion: true },
                });
              }
            } else {
              otCambio = true;
              const anterior = esMaster ? null : equiposOTPorUnidad.get(nuevo.ID_UNIDAD_FK);
              const data = {
                ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO,
                ITEM: nuevo.ITEM, INSTRUMENTO: nuevo.INSTRUMENTO, TIPO_SERVICIO: nuevo.TIPO_SERVICIO,
                sitio_calibracion: nuevo.sitio_calibracion, activacion: true,
              };
              if (anterior) {
                await tx.orden_trabajo_detalles.update({ where: { ID_DETALLE: anterior.ID_DETALLE }, data });
              } else {
                await tx.orden_trabajo_detalles.create({ data: { ...data, ID_UNIDAD_FK: nuevo.ID_UNIDAD_FK } });
              }
              idsUnidadesPresentes.add(nuevo.ID_UNIDAD_FK);
            }
          }
          const idsEliminar = detallesOTActuales
            .filter((detalle) => !detalle.ID_UNIDAD_FK || !idsUnidadesPresentes.has(detalle.ID_UNIDAD_FK))
            .map((detalle) => detalle.ID_DETALLE);
          if (idsEliminar.length) {
            otCambio = true;
            await tx.orden_trabajo_detalles.updateMany({
              where: { ID_DETALLE: { in: idsEliminar }, ID_ORDEN_TRABAJO_FK: ot.ID_ORDEN_TRABAJO },
              data: { activacion: false },
            });
          }

          const grupoDesaparece = !esMaster && instrumentosDesdoblados.length === 0;
          const masterYaNoSeRequiere = esMaster && detallesPorSitio.size <= 1;
          if (grupoDesaparece || masterYaNoSeRequiere) {
            await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
              data: { VIGENTE: false },
            });
            if (masterYaNoSeRequiere) await tx.ordenes_trabajo.updateMany({
              where: { ID_OT_PADRE_FK: ot.ID_ORDEN_TRABAJO, VIGENTE: true },
              data: { ID_OT_PADRE_FK: null },
            });
            const recepcionGrupo = existente.recepciones_equipo.find((rec) => rec.VIGENTE && rec.ID_ORDEN_TRABAJO_FK === ot.ID_ORDEN_TRABAJO);
            if (recepcionGrupo) {
              await tx.recepciones_equipo.update({
                where: { ID_RECEPCION: recepcionGrupo.ID_RECEPCION },
                data: { VIGENTE: false, activacion: false },
              });
            }
            continue;
          }

          if (otCambio) {
            const consecutivo_ot = await generarConsecutivo(tx, 'OT', ot.CODIGO_OT);
            const update_ot = await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: ot.ID_ORDEN_TRABAJO },
              data: { CODIGO_OT: consecutivo_ot },
            });
            otsParaRegenerar.push({ id: update_ot.ID_ORDEN_TRABAJO, codigo: update_ot.CODIGO_OT });
          }
        }

        // 4.2 Sincronizar cada Recepción según su sitio.
        for (const recep of detallesCambiaron && hijosActivos.length ? recepcionesActivas : []) {
          const otRecepcion = hijosActivos.find((orden) => orden.ID_ORDEN_TRABAJO === recep.ID_ORDEN_TRABAJO_FK);
          const sitioRec = otRecepcion ? sitioOT(otRecepcion) : recep.SITIO_CALIBRACION ?? 'LABORATORIO';
          const dets = detallesPorSitio.get(sitioRec);
          if (!dets || (recep.ID_ORDEN_TRABAJO_FK != null && !otRecepcion)) continue;
          const instrumentosDesdoblados = desdoblarDetalles(dets);
          const detallesRecepActuales = recep.recepcion_equipo_detalles.filter((detalle) => detalle.activacion !== false);
          const idsUnidadesPresentes = new Set<string>();
          let recepcionGrupoCambio = recep.SITIO_CALIBRACION !== sitioRec;
          if (recepcionGrupoCambio) {
            await tx.recepciones_equipo.update({ where: { ID_RECEPCION: recep.ID_RECEPCION }, data: { SITIO_CALIBRACION: sitioRec } });
          }

          for (let i = 0; i < instrumentosDesdoblados.length; i++) {
            const nuevo = instrumentosDesdoblados[i];
            const existentePorUnidad = detallesRecepActuales.find((detalle) => detalle.ID_UNIDAD_FK === nuevo.ID_UNIDAD_FK);
            if (existentePorUnidad) {
              idsUnidadesPresentes.add(nuevo.ID_UNIDAD_FK);
              if (existentePorUnidad.INSTRUMENTO !== nuevo.INSTRUMENTO || existentePorUnidad.ITEM !== nuevo.ITEM || existentePorUnidad.activacion === false) {
                recepcionGrupoCambio = true;
                await tx.recepcion_equipo_detalles.update({
                  where: { ID_INSTRUMENTO: existentePorUnidad.ID_INSTRUMENTO },
                  data: { INSTRUMENTO: nuevo.INSTRUMENTO, ITEM: nuevo.ITEM, activacion: true },
                });
              }
            } else {
              recepcionGrupoCambio = true;
              const anterior = equiposRecepcionPorUnidad.get(nuevo.ID_UNIDAD_FK);
              const data = { ID_RECEPCION_FK: recep.ID_RECEPCION, ITEM: nuevo.ITEM, INSTRUMENTO: nuevo.INSTRUMENTO, activacion: true };
              if (anterior) {
                await tx.recepcion_equipo_detalles.update({ where: { ID_INSTRUMENTO: anterior.ID_INSTRUMENTO }, data });
              } else {
                await tx.recepcion_equipo_detalles.create({ data: { ...data, ID_UNIDAD_FK: nuevo.ID_UNIDAD_FK } });
              }
              idsUnidadesPresentes.add(nuevo.ID_UNIDAD_FK);
            }
          }
          const idsEliminar = detallesRecepActuales
            .filter((detalle) => !detalle.ID_UNIDAD_FK || !idsUnidadesPresentes.has(detalle.ID_UNIDAD_FK))
            .map((detalle) => detalle.ID_INSTRUMENTO);
          if (idsEliminar.length) {
            recepcionGrupoCambio = true;
            await tx.recepcion_equipo_detalles.updateMany({
              where: { ID_INSTRUMENTO: { in: idsEliminar }, ID_RECEPCION_FK: recep.ID_RECEPCION },
              data: { activacion: false },
            });
          }

          if (recepcionGrupoCambio) {
            const consec = await generarConsecutivo(tx, 'REC', recep.CODIGO_RECEPCION);
            const update_rec = await tx.recepciones_equipo.update({
              where: { CODIGO_RECEPCION: recep.CODIGO_RECEPCION },
              data: { CODIGO_RECEPCION: consec },
            });
            recepcionesParaRegenerar.push({ id: update_rec.ID_RECEPCION, codigo: update_rec.CODIGO_RECEPCION });
          }
        }

        // Reconciliar sitios nuevos después de sincronizar los grupos que ya
        // existían. Cada sitio físico recibe una OT operativa y una recepción.
        if (detallesCambiaron && hijosActivos.length > 0) {
          const baseOT = familiaActiva.find((orden) => idsMaestras.has(orden.ID_ORDEN_TRABAJO)) ?? hijosActivos[0];
          const detallePorUnidad = detallesConIdentidad.flatMap((d) => d.ID_UNIDADES.slice(0, d.cantidad).map((idUnidad, index) => ({
            ITEM: 0,
            INSTRUMENTO: d.equipoDescripcion,
            TIPO_SERVICIO: d.tipoServicio,
            ID_UNIDAD_FK: idUnidad,
            SITIO: d.sitio ?? 'LABORATORIO' as const,
            ORDEN: index,
          }))).sort((a, b) => a.SITIO.localeCompare(b.SITIO) || a.ID_UNIDAD_FK.localeCompare(b.ID_UNIDAD_FK));
          detallePorUnidad.forEach((detalle, index) => { detalle.ITEM = index + 1; });

          let idMaster = familiaActiva.find((orden) => idsMaestras.has(orden.ID_ORDEN_TRABAJO))?.ID_ORDEN_TRABAJO ?? null;
          if (detallesPorSitio.size > 1 && idMaster == null) {
            const codigoMaster = await generarConsecutivo(tx, 'OT');
            const master = await tx.ordenes_trabajo.create({
              data: {
                CODIGO_OT: codigoMaster,
                ID_COTIZACION_FK: idCotizacion,
                ID_CLIENTE_FK: existente.ID_CLIENTE_FK,
                ID_OT_RAIZ: baseOT.ID_OT_RAIZ ?? baseOT.ID_ORDEN_TRABAJO,
                VERSION: Math.max(1, ...familiaActiva.map((orden) => orden.VERSION ?? 1)) + 1,
                VIGENTE: true,
                estado: 'Creada',
                SITIO_CALIBRACION: null,
                ES_EN_SITIO: false,
                ES_LAB_PERMANENTE: false,
                ES_INTERNO_USC: false,
                Razon_social: baseOT.Razon_social,
                NIT: baseOT.NIT,
                dirrecion: baseOT.dirrecion,
                ciudad: baseOT.ciudad,
                CORREO_CERTIFICADO: baseOT.CORREO_CERTIFICADO,
                CORREO_FACTURA: baseOT.CORREO_FACTURA,
                razon_social_solicitante: baseOT.razon_social_solicitante,
                NIT_solicitante: baseOT.NIT_solicitante,
                dirrecion_solcitante: baseOT.dirrecion_solcitante,
                ciudad_solcitante: baseOT.ciudad_solcitante,
                orden_trabajo_detalles: { create: detallePorUnidad.map((d) => ({
                  ITEM: d.ITEM,
                  INSTRUMENTO: d.INSTRUMENTO,
                  TIPO_SERVICIO: d.TIPO_SERVICIO,
                  ID_UNIDAD_FK: d.ID_UNIDAD_FK,
                  sitio_calibracion: d.SITIO,
                  PUNTOS_CALIBRAR: [],
                  activacion: true,
                })) },
              },
            });
            idMaster = master.ID_ORDEN_TRABAJO;
            otsParaRegenerar.push({ id: master.ID_ORDEN_TRABAJO, codigo: master.CODIGO_OT });
            await tx.ordenes_trabajo.updateMany({
              where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true, ID_ORDEN_TRABAJO: { in: hijosActivos.map((orden) => orden.ID_ORDEN_TRABAJO) } },
              data: { ID_OT_PADRE_FK: idMaster, ID_OT_RAIZ: baseOT.ID_OT_RAIZ ?? baseOT.ID_ORDEN_TRABAJO },
            });
          }

          for (const sitio of detallesPorSitio.keys()) {
            const ordenExistente = hijosActivos.find((orden) => sitioOT(orden) === sitio);
            if (ordenExistente && recepcionesActivas.some((rec) => rec.ID_ORDEN_TRABAJO_FK === ordenExistente.ID_ORDEN_TRABAJO)) continue;
            const detalleSitio = detallePorUnidad.filter((d) => d.SITIO === sitio);
            const otAnterior = existente.ordenes_trabajo
              .filter((orden) => orden.VIGENTE === false && orden.SITIO_CALIBRACION === sitio)
              .sort((a, b) => (b.VERSION ?? 1) - (a.VERSION ?? 1))[0];
            let nuevaOT: Pick<typeof baseOT, 'ID_ORDEN_TRABAJO' | 'CODIGO_OT'> | undefined = ordenExistente;
            if (!nuevaOT) {
              const codigoOTNuevo = otAnterior
                ? await generarConsecutivo(tx, 'OT', otAnterior.CODIGO_OT)
                : await generarConsecutivo(tx, 'OT');
              nuevaOT = await tx.ordenes_trabajo.create({
                data: {
                  CODIGO_OT: codigoOTNuevo,
                  ID_COTIZACION_FK: idCotizacion,
                  ID_CLIENTE_FK: existente.ID_CLIENTE_FK,
                  ID_OT_PADRE_FK: detallesPorSitio.size > 1 ? idMaster : null,
                  ID_OT_RAIZ: otAnterior?.ID_OT_RAIZ ?? baseOT.ID_OT_RAIZ ?? baseOT.ID_ORDEN_TRABAJO,
                  VERSION: (otAnterior?.VERSION ?? 0) + 1,
                  VIGENTE: true,
                  estado: 'Creada',
                  SITIO_CALIBRACION: sitio,
                  ES_EN_SITIO: sitio === 'CLIENTE',
                  ES_LAB_PERMANENTE: sitio === 'LABORATORIO',
                  ES_INTERNO_USC: sitio === 'INTERNO_USC',
                  Razon_social: baseOT.Razon_social,
                  NIT: baseOT.NIT,
                  dirrecion: baseOT.dirrecion,
                  ciudad: baseOT.ciudad,
                  CORREO_CERTIFICADO: baseOT.CORREO_CERTIFICADO,
                  CORREO_FACTURA: baseOT.CORREO_FACTURA,
                  razon_social_solicitante: baseOT.razon_social_solicitante,
                  NIT_solicitante: baseOT.NIT_solicitante,
                  dirrecion_solcitante: baseOT.dirrecion_solcitante,
                  ciudad_solcitante: baseOT.ciudad_solcitante,
                  orden_trabajo_detalles: { create: detalleSitio.flatMap((d, index) => equiposOTPorUnidad.has(d.ID_UNIDAD_FK) ? [] : [{
                    ITEM: index + 1,
                    INSTRUMENTO: d.INSTRUMENTO,
                    TIPO_SERVICIO: d.TIPO_SERVICIO,
                    ID_UNIDAD_FK: d.ID_UNIDAD_FK,
                    sitio_calibracion: sitio,
                    PUNTOS_CALIBRAR: [],
                    activacion: true,
                  }]) },
                },
              });
              for (const [indice, unidad] of detalleSitio.entries()) {
                const anterior = equiposOTPorUnidad.get(unidad.ID_UNIDAD_FK);
                if (anterior) await tx.orden_trabajo_detalles.update({
                  where: { ID_DETALLE: anterior.ID_DETALLE },
                  data: { ID_ORDEN_TRABAJO_FK: nuevaOT.ID_ORDEN_TRABAJO, ITEM: indice + 1, INSTRUMENTO: unidad.INSTRUMENTO, TIPO_SERVICIO: unidad.TIPO_SERVICIO, sitio_calibracion: sitio, activacion: true },
                });
              }
              otsParaRegenerar.push({ id: nuevaOT.ID_ORDEN_TRABAJO, codigo: nuevaOT.CODIGO_OT });
            }

            const recepcionAnterior = otAnterior
              ? existente.recepciones_equipo.find((rec) => rec.ID_ORDEN_TRABAJO_FK === otAnterior.ID_ORDEN_TRABAJO)
              : undefined;
            const codigoRec = recepcionAnterior
              ? await generarConsecutivo(tx, 'REC', recepcionAnterior.CODIGO_RECEPCION)
              : await generarConsecutivo(tx, 'REC');
            const nuevaRecepcion = await tx.recepciones_equipo.create({
              data: {
                CODIGO_RECEPCION: codigoRec,
                ID_COTIZACION_FK: idCotizacion,
                ID_ORDEN_TRABAJO_FK: nuevaOT.ID_ORDEN_TRABAJO,
                ID_RECEPCION_RAIZ: recepcionAnterior?.ID_RECEPCION_RAIZ ?? recepcionAnterior?.ID_RECEPCION,
                VERSION: (recepcionAnterior?.VERSION ?? 0) + 1,
                VIGENTE: true,
                SOLICITANTE: baseOT.razon_social_solicitante ?? baseOT.Razon_social ?? '',
                SITIO_CALIBRACION: sitio,
                ESTADO: 'BORRADOR',
                activacion: true,
                recepcion_equipo_detalles: { create: detalleSitio.flatMap((d, index) => equiposRecepcionPorUnidad.has(d.ID_UNIDAD_FK) ? [] : [{
                  ITEM: index + 1,
                  INSTRUMENTO: d.INSTRUMENTO,
                  ID_UNIDAD_FK: d.ID_UNIDAD_FK,
                  activacion: true,
                }]) },
              },
            });
            for (const [indice, unidad] of detalleSitio.entries()) {
              const anterior = equiposRecepcionPorUnidad.get(unidad.ID_UNIDAD_FK);
              if (anterior) await tx.recepcion_equipo_detalles.update({
                where: { ID_INSTRUMENTO: anterior.ID_INSTRUMENTO },
                data: { ID_RECEPCION_FK: nuevaRecepcion.ID_RECEPCION, ITEM: indice + 1, INSTRUMENTO: unidad.INSTRUMENTO, activacion: true },
              });
            }
            recepcionesParaRegenerar.push({ id: nuevaRecepcion.ID_RECEPCION, codigo: nuevaRecepcion.CODIGO_RECEPCION });
          }
          await verificarGruposOperativos(tx, idCotizacion, new Map(
            [...detallesPorSitio].map(([sitio, lineas]) => [sitio, desdoblarDetalles(lineas).map((unidad) => unidad.ID_UNIDAD_FK)]),
          ));
        }
      } else {
        subtotal = existente.cotizacion_detalles
          .filter((d) => d.activacion !== false)
          .reduce(
            (acc, d) => acc.plus(calcularValorDetalle(d.CANTIDAD, d.VALOR_UNITARIO)),
            new Prisma.Decimal(0),
          );
      }

      if (detallesCambiaron) {
        for (const { id } of otsParaRegenerar) await evaluarTransicionesOT(tx, id);
      }

      // 5. ACTUALIZACIÓN FINANCIERA Y MAESTRA
      const viaticos = reqViaticos !== undefined
        ? normalizarDinero(reqViaticos)
        : existente.viaticos ?? new Prisma.Decimal(0);
      const descuento = reqDescuento !== undefined ? reqDescuento : Number(existente.descuento || 0);
      const montoTotal = calcularMontoTotalCotizacion(subtotal, viaticos, descuento);

      // Una modificación real en campos comerciales también versiona la
      // cotización; las modificaciones de líneas ya se versionaron en la cascada.
      if (regenerarCotizacionDoc && !detallesCambiaron) {
        const nuevoCodigo = await generarConsecutivo(tx, 'COT', existente.CODIGO_COTIZACION);
        await tx.cotizaciones.update({
          where: { ID_COTIZACION: idCotizacion },
          data: { CODIGO_COTIZACION: nuevoCodigo },
        });
      }

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
          ...(request.body.idCliente && { ID_CLIENTE_FK: request.body.idCliente }),
          ...(reqEstado && { ESTADO: reqEstado }),
          ...(regenerarCotizacionDoc ? { UPDATED_AT: new Date() } : {}),
          viaticos,
          descuento,
          MONTO_TOTAL: montoTotal,
        },
        include: { clientes: true, cotizacion_detalles: true },
      });

      const primerEnvio = reqEstado === Estados.ENVIADA && existente.ESTADO === Estados.BORRADOR;
      if (primerEnvio) await validarCotizacionParaEnvio(tx, idCotizacion, cotizacionActualizada.ID_CLIENTE_FK);

      if (detallesCambiaron && !existente.ordenes_trabajo.some((orden) => orden.VIGENTE) &&
          existente.recepciones_equipo.some((rec) => rec.VIGENTE && rec.activacion && rec.ID_ORDEN_TRABAJO_FK == null)) {
        const recepciones = await reconciliarRecepcionesPendientes(tx, cotizacionActualizada);
        for (const rec of recepciones) {
          recepcionesParaRegenerar.push({ id: rec.ID_RECEPCION, codigo: rec.CODIGO_RECEPCION });
        }
      }

      // 6. REGISTRO DE AUDITORÍA (VERSIONAMIENTO)
      if (cambios && regenerarCotizacionDoc) {
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

      const actualizacionAprobada = cotizacionActualizada.ESTADO === Estados.APROBADA;
      let idOTParaCorreo: number | undefined;
      if (actualizacionAprobada && regenerarCotizacionDoc) {
        const ordenesVigentes = await tx.ordenes_trabajo.findMany({
          where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true },
          select: { ID_ORDEN_TRABAJO: true, ID_OT_PADRE_FK: true, CODIGO_OT: true, ID_CLIENTE_FK: true },
        });
        const principal = ordenPrincipalVigente(ordenesVigentes);
        if (principal && principal.ID_CLIENTE_FK === cotizacionActualizada.ID_CLIENTE_FK) {
          idOTParaCorreo = principal.ID_ORDEN_TRABAJO;
          if (!otsParaRegenerar.some((orden) => orden.id === principal.ID_ORDEN_TRABAJO)) {
            // El formato de OT incluye la referencia al código de la nueva versión de la cotización.
            const codigo = await generarConsecutivo(tx, 'OT', principal.CODIGO_OT);
            await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: principal.ID_ORDEN_TRABAJO },
              data: { CODIGO_OT: codigo },
            });
            otsParaRegenerar.push({ id: principal.ID_ORDEN_TRABAJO, codigo });
          }
        } else {
          request.log.warn({ idCotizacion, idOT: principal?.ID_ORDEN_TRABAJO },
            'Correo de actualización omitido: falta una OT principal vigente del cliente de la cotización');
        }
      }

      const trackingJobs: Record<string, string[]> = {};

      if (regenerarCotizacionDoc || primerEnvio) {
        const quoteTracker = await registrarGeneracionPendiente(tx, 'actualizacion_cotizacion', {

          tipo_entry: 'prod',
          id_registro: cotizacionActualizada.ID_COTIZACION,
          action: actualizacionAprobada ? undefined
            : cotizacionActualizada.ESTADO === Estados.ENVIADA ? 'cot_create' : 'cot_update',
          codigo_actual: cotizacionActualizada.CODIGO_COTIZACION,
          tipo: 1,
          id_usuario: idUsuario,
          id_cotizacion: cotizacionActualizada.ID_COTIZACION,
          force_regenerate: regenerarCotizacionDoc,
        });
        trackingJobs.cot = [quoteTracker.id];
      }

      // Los formatos de todas las OT modificadas se conservan para consulta interna.
      const ordenesParaGenerar = new Map(otsParaRegenerar.map((orden) => [orden.id, orden]));
      for (const otActualizada of ordenesParaGenerar.values()) {
        const ordeneo_tracke = await registrarGeneracionPendiente(tx, 'actualizacion_ordenes_ot', {

          tipo_entry: 'prod',
          id_registro: otActualizada.id,
          codigo_actual: otActualizada.codigo,
          action: !actualizacionAprobada || otActualizada.id === idOTParaCorreo ? 'ot_actualizar' : undefined,
          tipo: 2,
          id_usuario: idUsuario,
          id_cotizacion: cotizacionActualizada.ID_COTIZACION,
          force_regenerate: true,
        });
        (trackingJobs.ot ??= []).push(ordeneo_tracke.id);
      }

      // 7.3. SOLO generamos el Excel de Recepción si realmente existe una Recepción vinculada
      for (const recepcionActualizada of recepcionesParaRegenerar) {
        const receprtracker = await registrarGeneracionPendiente(tx, 'actualizacion_recepciones', {

          tipo_entry: 'prod',
          id_registro: recepcionActualizada.id,
          codigo_actual: recepcionActualizada.codigo,
          tipo: 3,
          id_usuario: idUsuario,
          id_cotizacion: cotizacionActualizada.ID_COTIZACION,
          force_regenerate: true,
        });
        (trackingJobs.rec ??= []).push(receprtracker.id);
      }
      return { cotizacion: cotizacionActualizada, trackingJobs };
    });

    // Retornamos un JSON dinámico solo con los jobs que sí se ejecutaron
    return { 
      ok: true as const, 
      data: cotizacionRawToDtoSchema.parse(resultado.cotizacion),
      id_job: JSON.stringify(resultado.trackingJobs)
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
    const { nuevoEstado, motivoRechazo, codigo } = request.body as {
      nuevoEstado: Estados;
      codigo?: string;
      motivoRechazo?: string | null;
    };
    const idUsuario = Number(request.user?.sub ?? 0);

    if (nuevoEstado === Estados.RECHAZADA || nuevoEstado === Estados.APROBADA) {
      assertPermission(request, 'cotizaciones', 'aprobar_rechazar');
    } else if (nuevoEstado === Estados.ENVIADA) {
      assertPermission(request, 'cotizaciones', 'enviar_al_cliente');
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
        await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${idCotizacion} FOR UPDATE`;
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

        if (nuevoEstado === Estados.EN_SEGUIMIENTO && actual.ESTADO === Estados.APROBADA &&
            !(await cotizacionListaParaSeguimiento(tx, idCotizacion))) {
          throw new AppError(409, 'La cotización solo pasa a seguimiento cuando todas las OT están pagadas, los certificados enviados y las recepciones entregadas.');
        }

        if (nuevoEstado === Estados.ENVIADA) {
          if (codigo && codigo !== actual.CODIGO_COTIZACION) {
            throw new AppError(409, 'La cotización tiene una versión más reciente. Revísala antes de enviarla.');
          }
          await validarCotizacionParaEnvio(tx, idCotizacion, actual.ID_CLIENTE_FK);
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

        if (nuevoEstado === Estados.EN_SEGUIMIENTO && actual.ESTADO === Estados.APROBADA) {
          await tx.seguimientos_comerciales.create({
            data: {
              ID_COTIZACION_FK: idCotizacion,
              TIPO: 'OTRO',
              DESCRIPCION: `Cierre de entrega completado para la cotización ${cotizacionActualizada.CODIGO_COTIZACION}.`,
              RESULTADO: 'ENTREGA_COMPLETA',
              ID_USUARIO_FK: idUsuario || null,
            },
          });
        }

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

        const trackingJobs: Record<string, string[]> = {};

        // 🔥 1. DETONAR TIPO 1 (Siempre). El correo de aprobación SOLO se envía
        // cuando el nuevo estado es APROBADA; otros estados usan una acción neutra
        // para que el worker regenere el documento sin notificar aprobación.
        const quoteTrackerCot = await registrarGeneracionPendiente(tx, 'actualizacion_estado_cot', {

          tipo_entry: 'prod',
          id_registro: cotizacionActualizada.ID_COTIZACION,
          action: nuevoEstado === Estados.ENVIADA ? 'cot_create' : nuevoEstado === Estados.APROBADA ? 'aprove' : 'estado_cambio',
          codigo_actual: cotizacionActualizada.CODIGO_COTIZACION,
          tipo: 1,
          id_usuario: idUsuario,
          id_cotizacion: cotizacionActualizada.ID_COTIZACION,
        });
        trackingJobs.cot = [quoteTrackerCot.id];

        // 2. DETONAR TIPO 2 (Orden de Trabajo) — una por cada OT generada/reutilizada
        const hayMasterResultado = dataOTs.some((o: any) => o.SITIO_CALIBRACION == null);
        for (const ot of dataOTs) {
          const esMaster = ot.SITIO_CALIBRACION == null;
          const quoteTrackerOT = await registrarGeneracionPendiente(tx, 'generar_ot_excel', {

            tipo_entry: 'prod',
            id_registro: ot.ID_ORDEN_TRABAJO,
            action: esMaster || !hayMasterResultado ? "ot_create" : "ot_update",
            codigo_actual: ot.CODIGO_OT,
            tipo: 2,
            id_usuario: idUsuario,
            id_cotizacion: cotizacionActualizada.ID_COTIZACION,
          });
          (trackingJobs.ot ??= []).push(quoteTrackerOT.id);
        }

        // 3. DETONAR TIPO 3 (Recepción) — una por cada Recepción generada/reutilizada
        for (const rec of dataRecs) {
          const quoteTrackerRec = await registrarGeneracionPendiente(tx, 'generar_recepcion_excel', {

            tipo_entry: 'prod',
            id_registro: rec.ID_RECEPCION,
            codigo_actual: rec.CODIGO_RECEPCION,
            tipo: 3,
            id_usuario: idUsuario,
            id_cotizacion: cotizacionActualizada.ID_COTIZACION,
          });
          (trackingJobs.rec ??= []).push(quoteTrackerRec.id);
        }
        return { cotizacion: cotizacionActualizada, trackingJobs };
      });

      return reply.code(200).send({ 
        ok: true, 
        data: cotizacionRawToDtoSchema.parse(resultado.cotizacion),
        id_job: Object.keys(resultado.trackingJobs).length > 0 ? JSON.stringify(resultado.trackingJobs) : undefined
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

      const resultado = await fastify.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${cotizacion.ID_COTIZACION} FOR UPDATE`;
        const vigente = await tx.cotizaciones.findUniqueOrThrow({ where: { ID_COTIZACION: cotizacion.ID_COTIZACION } });
        if (vigente.ESTADO !== Estados.ENVIADA) {
          return { aprobadaAhora: false as const, estadoVigente: vigente.ESTADO, cotizacion: null, creador: null };
        }
        const [inicio, dias] = await Promise.all([inicioVigenciaCotizacion(tx, vigente), diasVigenciaCotizacion(tx)]);
        // Los enlaces anteriores al versionado siguen válidos si la cotización no cambió desde su envío.
        const coincideVersion = verificado.codigo != null ? verificado.codigo === vigente.CODIGO_COTIZACION
          : (vigente.UPDATED_AT ?? vigente.CREATED_AT).getTime() <= (verificado.iat + 1) * 1000 &&
            Math.floor(inicio.getTime() / 1000) <= verificado.iat;
        if (!coincideVersion) {
          return { aprobadaAhora: false as const, desactualizada: true, cotizacion: null, creador: null };
        }
        if (fechaVencimientoCotizacion(inicio, dias).getTime() <= Date.now()) {
          return { aprobadaAhora: false as const, vencida: true, cotizacion: null, creador: null };
        }

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
            ID_USUARIO_FK: null,
            MOTIVO: "aprobación por enlace de correo",
          },
        });

        const { ots, recs } = await generarOrdenesTrabajoAprobacion(tx, actualizada);

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

        await registrarGeneracionPendiente(tx, 'actualizacion_estado_cot', {

          tipo_entry: 'prod',
          id_registro: actualizada.ID_COTIZACION,
          action: 'aprove',
          codigo_actual: actualizada.CODIGO_COTIZACION,
          tipo: 1,
          id_usuario: creador ?? undefined,
          id_cotizacion: actualizada.ID_COTIZACION,
        });

        const hayMasterOts = ots.some((o: any) => o.SITIO_CALIBRACION == null);
        for (const ot of ots) {
          const esMaster = ot.SITIO_CALIBRACION == null;
          await registrarGeneracionPendiente(tx, 'generar_ot_excel', {

            tipo_entry: 'prod',
            id_registro: ot.ID_ORDEN_TRABAJO,
            action: esMaster || !hayMasterOts ? 'ot_create' : 'ot_update',
            codigo_actual: ot.CODIGO_OT,
            tipo: 2,
            id_usuario: creador ?? undefined,
            id_cotizacion: actualizada.ID_COTIZACION,
          });
        }

        for (const rec of recs) {
          await registrarGeneracionPendiente(tx, 'generar_recepcion_excel', {

            tipo_entry: 'prod',
            id_registro: rec.ID_RECEPCION,
            action: 'rec_create',
            codigo_actual: rec.CODIGO_RECEPCION,
            tipo: 3,
            id_usuario: creador ?? undefined,
            id_cotizacion: actualizada.ID_COTIZACION,
          });
        }

        return { aprobadaAhora: true as const, cotizacion: actualizada, creador };
      }).catch((error: unknown) => {
        if (error instanceof AppError && error.statusCode === 409) {
          request.log.warn({ idCotizacion: cotizacion.ID_COTIZACION, motivo: error.message }, 'Aprobación pendiente de revisión');
          return { aprobadaAhora: false as const, conflicto: error.message, cotizacion: null, creador: null };
        }
        throw error;
      });

      if ('vencida' in resultado && resultado.vencida) {
        return reply.type('text/html').code(200)
          .send(renderHtmlAprobacion('Cotización vencida', 'El plazo de aprobación terminó. Por favor contacte al laboratorio.', false));
      }

      if ('conflicto' in resultado && resultado.conflicto) {
        return reply.type('text/html').code(409).send(renderHtmlAprobacion('Aprobación pendiente',
          'Contacta al laboratorio para revisar los instrumentos de la cotización.', false));
      }

      if ('desactualizada' in resultado && resultado.desactualizada) {
        return reply.type('text/html').code(409).send(renderHtmlAprobacion('Cotización actualizada',
          'Usa el enlace del correo de la versión vigente o solicita al laboratorio que lo reenvíe.', false));
      }

      if ('estadoVigente' in resultado && resultado.estadoVigente !== Estados.APROBADA) {
        return reply.type('text/html').code(409).send(renderHtmlAprobacion('Cotización ya procesada',
          'La cotización dejó de estar disponible para aprobación. Contacta al laboratorio.', false));
      }

      if (!resultado.aprobadaAhora || !resultado.cotizacion) {
        return reply
          .type('text/html')
          .code(200)
          .send(renderHtmlAprobacion('Cotización ya procesada', `La cotización ${cotizacion.CODIGO_COTIZACION} ya fue aprobada. No es necesario aprobarla otra vez.`, false));
      }
      const cotizacionAprobada = resultado.cotizacion;

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

  app.get('/api/v1/cotizaciones/en-seguimiento', { preHandler: [fastify.authenticate] }, async () => {
    const cotizaciones = await fastify.prisma.cotizaciones.findMany({
      where: { ESTADO: Estados.EN_SEGUIMIENTO },
      orderBy: [{ UPDATED_AT: 'desc' }, { ID_COTIZACION: 'desc' }],
      include: { clientes: true, historial_estado_cotizacion: true },
    });
    return { ok: true as const, data: cotizaciones.map((c) => cotizacionRawToDtoSchema.parse(c)) };
  });

  app.get('/api/v1/cotizaciones/metricas-dashboard', { preHandler: [fastify.authenticate] }, async () => {
    const cotizaciones = await fastify.prisma.cotizaciones.findMany({
      select: {
        ESTADO: true,
        CREATED_AT: true,
        historial_estado_cotizacion: {
          where: { ESTADO_NUEVO: { in: [Estados.ENVIADA, Estados.APROBADA] } },
          orderBy: { CREATED_AT: 'asc' },
          select: { ESTADO_NUEVO: true, CREATED_AT: true },
        },
      },
    });
    return cotizaciones.map((c) => ({
      estado: c.ESTADO,
      emitidaAt: c.historial_estado_cotizacion.find((h) => h.ESTADO_NUEVO === Estados.ENVIADA)?.CREATED_AT ?? (c.ESTADO !== Estados.BORRADOR ? c.CREATED_AT : null),
      aprobadaAt: c.historial_estado_cotizacion.find((h) => h.ESTADO_NUEVO === Estados.APROBADA)?.CREATED_AT ?? null,
    }));
  });

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

      const dias = await diasVigenciaCotizacion(fastify.prisma);
      return {
        ok: true as const,
        data: cotizaciones.map((c) => {
          const data = cotizacionRawToDtoSchema.parse(c);
          if (c.ESTADO === Estados.ENVIADA) {
            const envio = c.historial_estado_cotizacion.reduce<Date | undefined>((ultimo, historial) =>
              historial.ESTADO_NUEVO === Estados.ENVIADA && historial.CREATED_AT &&
              (!ultimo || historial.CREATED_AT > ultimo) ? historial.CREATED_AT : ultimo, undefined);
            data.fechaVencimiento = fechaVencimientoCotizacion(envio ?? c.UPDATED_AT ?? c.CREATED_AT, dias);
          }
          return data;
        }),
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
        select: {
          ID_ORDEN_TRABAJO: true,
          CODIGO_OT: true,
          ID_OT_RAIZ: true,
          ID_OT_PADRE_FK: true,
          VERSION: true,
          VIGENTE: true,
          SITIO_CALIBRACION: true,
          ES_EN_SITIO: true,
          ES_INTERNO_USC: true,
          CREATED_AT: true,
        },
      });
      const otIds = ordenes.map((o) => o.ID_ORDEN_TRABAJO);

      const recepciones = await fastify.prisma.recepciones_equipo.findMany({
        where: {
          OR: [
            { ID_COTIZACION_FK: idCotizacion },
            ...(otIds.length ? [{ ID_ORDEN_TRABAJO_FK: { in: otIds } }] : []),
          ],
        },
        select: {
          ID_RECEPCION: true,
          CODIGO_RECEPCION: true,
          ID_ORDEN_TRABAJO_FK: true,
          ID_RECEPCION_RAIZ: true,
          VERSION: true,
          VIGENTE: true,
          activacion: true,
          CREATED_AT: true,
        },
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
            orderBy: [{ VERSION: 'desc' }, { ID_VERSION: 'desc' }],
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
                orderBy: [{ VERSION: 'desc' }, { ID_VERSION: 'desc' }],
              },
            },
          },
          calibraciones: {
            include: {
              usuarios: { select: { NOMBRE_COMPLETO: true } },
              recepcion_equipo_detalles: {
                select: { INSTRUMENTO: true, SERIE: true, ID_RECEPCION_FK: true, activacion: true },
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

      // Los documentos de certificados se clasifican por certificados.ID_DOCUMENTO_FK,
      // nunca por las FK directas de OT o recepción.
      const idsDocumentoCertificado = new Set(
        certificados.map((cert) => cert.ID_DOCUMENTO_FK)
      );
      const documentosSinCertificados = documentos.filter(
        (doc) => !idsDocumentoCertificado.has(doc.ID_DOCUMENTO)
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
        nombre: nombreArchivoDocumento(v.RUTA_URL),
        createdAt: v.CREATED_AT,
        usuario: v.usuarios?.NOMBRE_COMPLETO ?? null,
      });

      const toItem = (doc: (typeof documentos)[number]): z.infer<typeof documentoItemSchema> => ({
        idDocumento: doc.ID_DOCUMENTO,
        idVersionActual: doc.version_documentos[0]?.ID_VERSION,
        nombre: doc.NOMBRE,
        // La versión vigente se ordena primero; la ruta del registro base puede
        // haber quedado apuntando a una versión anterior.
        rutaUrl: doc.version_documentos[0]?.RUTA_URL ?? doc.RUTA_URL,
        mimeType: doc.MIME_TYPE,
        createdAt: doc.CREATED_AT,
        versionActual: doc.version_documentos[0]?.VERSION ?? 1,
        versiones: doc.version_documentos.map(toVersion),
      });

      const compararVigencia = (a: { VERSION: number | null; CREATED_AT: Date | null }, b: typeof a) =>
        (b.VERSION ?? 1) - (a.VERSION ?? 1) || (b.CREATED_AT?.getTime() ?? 0) - (a.CREATED_AT?.getTime() ?? 0);

      const seleccionarFormato = (
        docs: typeof documentos,
        tipo: TipoDocumentoGenerado,
        codigo: string,
        perteneceAlVigente: (doc: (typeof documentos)[number]) => boolean,
      ) => {
        const archivos = docs.flatMap((doc) => {
          const candidatos = doc.version_documentos.map(toVersion);
          if (!candidatos.some((v) => v.rutaUrl === doc.RUTA_URL)) candidatos.push({
            idVersion: -doc.ID_DOCUMENTO, version: 1, rutaUrl: doc.RUTA_URL,
            nombre: nombreArchivoDocumento(doc.RUTA_URL), createdAt: doc.CREATED_AT, usuario: null,
          });
          return candidatos.filter((v) => esPdfGenerado(v.rutaUrl, tipo, codigo)).map((version) => ({ doc, version }));
        }).sort((a, b) => b.version.createdAt.getTime() - a.version.createdAt.getTime() || b.version.idVersion - a.version.idVersion);
        const vigente = archivos.find(({ doc, version }) => perteneceAlVigente(doc) &&
          version.nombre.toUpperCase() === `${codigo.toUpperCase()}.PDF`);
        const rutas = new Set(vigente ? [vigente.version.rutaUrl] : []);
        const anteriores = archivos.flatMap(({ version }) => {
          if (rutas.has(version.rutaUrl)) return [];
          rutas.add(version.rutaUrl);
          return [version];
        });
        const proyectar = ({doc, version}: (typeof archivos)[number]) => ({
          ...toItem(doc), nombre: version.nombre, rutaUrl: version.rutaUrl, mimeType: 'application/pdf',
          createdAt: version.createdAt, versionActual: version.version, idVersionActual: version.idVersion, versiones: anteriores,
        });
        return {
          vigente: vigente ? { ...proyectar(vigente), nombre: `${codigo}.pdf` } : null,
          archivado: !vigente && archivos[0] ? { ...proyectar(archivos[0]), idVersionActual: undefined } : null,
        };
      };

      const categorias = {
        recepcion: [] as ReturnType<typeof toItem>[],
        cotizacion: [] as ReturnType<typeof toItem>[],
        ordenTrabajo: [] as ReturnType<typeof toItem>[],
        comprobantes: [] as ReturnType<typeof toItem>[],
        certificados: [] as z.infer<typeof documentoCertificadoItemSchema>[],
      };

      const archivados = { cotizacion: [] as ReturnType<typeof toItem>[], ordenTrabajo: [] as ReturnType<typeof toItem>[],
        recepcion: [] as ReturnType<typeof toItem>[], certificados: [] as z.infer<typeof documentoCertificadoItemSchema>[] };
      const pendientes = { cotizacion: [] as string[], ordenTrabajo: [] as string[], recepcion: [] as string[], certificados: [] as string[] };
      const formatos = documentosSinCertificados.filter((doc) => doc.ordenPagoId == null);
      categorias.comprobantes = documentosSinCertificados
        .filter((doc) => doc.ordenPagoId != null && otIds.includes(doc.ordenPagoId))
        .map((doc) => {
          const item = toItem(doc);
          return { ...item, nombre: nombreArchivoDocumento(item.rutaUrl) };
        });

      const guardarFormato = (
        categoria: Exclude<keyof typeof pendientes, 'certificados'>, tipo: TipoDocumentoGenerado, codigo: string,
        docs: typeof documentos, perteneceAlVigente?: (doc: (typeof documentos)[number]) => boolean,
      ) => {
        const { vigente, archivado } = seleccionarFormato(docs, tipo, codigo, perteneceAlVigente ?? (() => false));
        if (vigente) categorias[categoria].push(vigente);
        else if (perteneceAlVigente) pendientes[categoria].push(codigo);
        if (archivado) archivados[categoria].push(archivado);
      };
      guardarFormato('cotizacion', 1, cotizacion.CODIGO_COTIZACION,
        formatos.filter((doc) => doc.ID_COTIZACION_FK === idCotizacion && doc.ID_ORDEN_TRABAJO_FK == null && doc.ID_RECEPCION_FK == null),
        () => true,
      );

      const padres = new Set(ordenes.flatMap((orden) => orden.ID_OT_PADRE_FK == null ? [] : [orden.ID_OT_PADRE_FK]));
      const otVigentePorSitio = new Map<string, typeof ordenes[number]>();
      for (const orden of [...ordenes].sort((a, b) => compararVigencia(a, b) || b.ID_ORDEN_TRABAJO - a.ID_ORDEN_TRABAJO)) {
        if (!orden.VIGENTE || padres.has(orden.ID_ORDEN_TRABAJO)) continue;
        const sitio = orden.SITIO_CALIBRACION ?? (orden.ES_INTERNO_USC ? 'INTERNO_USC' : orden.ES_EN_SITIO ? 'CLIENTE' : 'LABORATORIO');
        if (!otVigentePorSitio.has(sitio)) otVigentePorSitio.set(sitio, orden);
      }
      const idsOtVigentes = new Set([...otVigentePorSitio.values()].map((orden) => orden.ID_ORDEN_TRABAJO));
      for (const orden of ordenes) {
        const vigente = idsOtVigentes.has(orden.ID_ORDEN_TRABAJO);
        const docs = formatos.filter((doc) => doc.ID_ORDEN_TRABAJO_FK === orden.ID_ORDEN_TRABAJO && doc.ID_RECEPCION_FK == null);
        guardarFormato('ordenTrabajo', 2, orden.CODIGO_OT, docs, vigente ? () => true : undefined);
      }

      const recVigentePorGrupo = new Map<string, typeof recepciones[number]>();
      for (const recepcion of [...recepciones].sort((a, b) => compararVigencia(a, b) || b.ID_RECEPCION - a.ID_RECEPCION)) {
        if (!recepcion.VIGENTE || recepcion.activacion === false ||
            (recepcion.ID_ORDEN_TRABAJO_FK != null && !idsOtVigentes.has(recepcion.ID_ORDEN_TRABAJO_FK))) continue;
        const grupo = recepcion.ID_ORDEN_TRABAJO_FK != null ? `ot:${recepcion.ID_ORDEN_TRABAJO_FK}`
          : `rec:${recepcion.ID_RECEPCION_RAIZ ?? recepcion.ID_RECEPCION}`;
        if (!recVigentePorGrupo.has(grupo)) recVigentePorGrupo.set(grupo, recepcion);
      }
      const idsRecVigentes = new Set([...recVigentePorGrupo.values()].map((recepcion) => recepcion.ID_RECEPCION));
      for (const recepcion of recepciones) {
        const docs = formatos.filter((doc) => doc.ID_RECEPCION_FK === recepcion.ID_RECEPCION);
        guardarFormato('recepcion', 3, recepcion.CODIGO_RECEPCION, docs,
          idsRecVigentes.has(recepcion.ID_RECEPCION) ? () => true : undefined);
      }

      for (const cert of certificados) {
        const versiones = (cert.documentos?.version_documentos ?? []).map(toVersion);
        if (!versiones.length && cert.documentos?.RUTA_URL) {
          versiones.push({
            idVersion: -cert.ID_DOCUMENTO_FK, version: 1, rutaUrl: cert.documentos.RUTA_URL,
            nombre: nombreArchivoDocumento(cert.documentos.RUTA_URL), createdAt: cert.documentos.CREATED_AT,
            usuario: null,
          });
        }
        const calibracion = cert.calibraciones;
        const detalle = calibracion?.recepcion_equipo_detalles ?? null;

        const esVigente = cert.ESTADO_REVISION === 'APROBADO' && detalle?.activacion !== false &&
          detalle != null && idsRecVigentes.has(detalle.ID_RECEPCION_FK);
        const codigoArchivo = `${cert.CODIGO_CERTIFICADO}.pdf`;
        const archivoFinal = versiones.find((version) => esPdfSelladoVigente({
          rutaUrl: version.rutaUrl, createdAt: version.idVersion < 0 ? null : version.createdAt,
        }, cert.CODIGO_CERTIFICADO, cert.REVISADO_AT));
        if (esVigente && !archivoFinal) pendientes.certificados.push(cert.CODIGO_CERTIFICADO);
        (esVigente && archivoFinal ? categorias.certificados : archivados.certificados).push({
          idCertificado: cert.ID_CERTIFICADO,
          codigoCertificado: cert.CODIGO_CERTIFICADO,
          idDocumento: cert.ID_DOCUMENTO_FK,
          nombre: codigoArchivo,
          rutaUrl: archivoFinal?.rutaUrl ?? versiones[0]?.rutaUrl ?? null,
          mimeType: cert.documentos?.MIME_TYPE ?? 'application/pdf',
          createdAt: cert.documentos?.CREATED_AT ?? calibracion?.CREATED_AT ?? new Date(),
          versiones,
          trazabilidad: {
            instrumento: detalle?.INSTRUMENTO ?? null,
            serie: detalle?.SERIE ?? null,
            fechaCalibracion: calibracion?.CREATED_AT ?? null,
            tecnico: calibracion?.usuarios?.NOMBRE_COMPLETO ?? null,
            estadoRevision: cert.ESTADO_REVISION,
            revisadoAt: cert.REVISADO_AT ?? null,
            revisor: cert.ID_REVISOR_FK != null ? revisorMap.get(cert.ID_REVISOR_FK) ?? null : null,
            motivoRechazo: cert.MOTIVO_RECHAZO ?? null,
            versiones,
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
          archivados,
          pendientes,
        },
      };
    }
  );
}
