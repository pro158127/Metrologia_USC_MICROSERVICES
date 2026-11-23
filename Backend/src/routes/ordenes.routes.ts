import { createHash } from 'node:crypto';
import { resolverPlantillaOperativa } from '../services/plantillas-readiness.service.js';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  clienteRawToDtoSchema,
  datosInicialesResponseSchema,
  documentoRawToDtoSchema,
  ordenTrabajoRawToDtoSchema,
  ordenTrabajoDtoSchema,
  rolRawToDtoSchema,
  tarifaRawToDtoSchema,
  usuarioRawToDtoSchema,
  importarOtExcelBodySchema,importarOtExcelResponseSchema,
  consolidarOtBodySchema,
  consolidarOtParamsSchema
} from './ordenes.schemas.js';
import { getimportOT } from '../lib/queue/queue.js';
import { registrarGeneracionPendiente } from '../services/generacion-pendiente.service.js';
import { verificarPlantillasOperativas } from '../services/plantillas-readiness.service.js';
import {
  evaluarTransicionesOT,
  validarAsignacionPermitida,
} from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { assertAnyPermission, assertPermission } from '../lib/permissions.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { siguienteVersionOT } from '../services/versionado-ot.service.js';

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

      if (idCotizacion !== undefined) {
        const cotizacion = await fastify.prisma.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacion },
          select: { ID_COTIZACION: true, ESTADO: true },
        });
        if (!cotizacion) throw new AppError(404, 'La cotización seleccionada no existe.');
        if (!['APROBADA', 'ENVIADA'].includes(cotizacion.ESTADO)) {
          throw new AppError(409, `No se puede importar una OT para una cotización en estado ${cotizacion.ESTADO}.`);
        }
      }

      try {
        const plantilla = await resolverPlantillaOperativa(fastify.prisma, 2);
        const huella = createHash('sha256').update(JSON.stringify([
          s3KeyTemp, tipoFlujo, idCotizacion ?? null, idUsuario,
        ])).digest('hex');
        const idTrabajo = `import-ote-${huella}`;
        // Una doble solicitud del mismo archivo temporal comparte seguimiento y trabajo.
        const quoteJob = await fastify.prisma.quote.upsert({
          where: { id: idTrabajo },
          create: { id: idTrabajo, status: 'PENDING' },
          update: { id: idTrabajo },
        });
        if (quoteJob.status === 'COMPLETED') return { ok: true as const, id_job: idTrabajo };

        // 2. Despachar al Worker de Ingeniería Inversa
        const map = plantilla.MAPPING_CONFIG;
        const oteQueue = getimportOT();
        await oteQueue.add('importar_ote_job', {
          id_job: quoteJob.id,
          s3KeyTemp,
          mappingConfig: map, // Aquí puedes cargar el JSON de config maestro o pasarlo desde la DB
          id_cotizacion: idCotizacion, // Si es undefined, el Worker creará la cotización
          idUsuario,
          tipoFlujo
        }, { jobId: idTrabajo });

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

  const consultarOrdenes = () => fastify.prisma.ordenes_trabajo.findMany({
    include: {
      clientes: true,
      cotizaciones: { include: { clientes: true } },
      orden_trabajo_detalles: { where: { OR: [{ activacion: true }, { activacion: null }] } },
      // El aviso de revisión de la OT se deriva de sus certificados activos,
      // no del ESTADO_REVISION heredado de la cabecera de la OT.
      recepciones_equipo: {
        where: { VIGENTE: true, activacion: true },
        orderBy: [{ VERSION: 'desc' }, { ID_RECEPCION: 'desc' }],
        take: 1,
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
  });

  app.get('/api/v1/ordenes/tecnicos', {
    preHandler: [fastify.authenticate],
    schema: { response: { 200: z.array(z.object({
      idUsuario: z.number(),
      nombreCompleto: z.string(),
    })) } },
  }, async (request) => {
    assertPermission(request, 'ordenes_de_trabajo', 'ver_listado');
    const usuarios = await fastify.prisma.usuarios.findMany({
      where: {
        ESTADO: true,
        elminado: false,
        roles: { NOMBRE_ROL: { in: ['Técnico', 'Coordinadora', 'Director Técnico'] } },
      },
      select: { ID_USUARIO_AUTO_INCREMENT: true, NOMBRE_COMPLETO: true },
      orderBy: { NOMBRE_COMPLETO: 'asc' },
    });
    return usuarios.map((usuario) => ({
      idUsuario: usuario.ID_USUARIO_AUTO_INCREMENT,
      nombreCompleto: usuario.NOMBRE_COMPLETO,
    }));
  });

  app.get('/api/v1/ordenes/listado', {
    preHandler: [fastify.authenticate],
    schema: { response: { 200: z.array(ordenTrabajoDtoSchema) } },
  }, async (request) => {
    assertPermission(request, 'ordenes_de_trabajo', 'ver_listado');
    return (await consultarOrdenes()).map((orden) => ordenTrabajoRawToDtoSchema.parse(orden));
  });

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
        consultarOrdenes(),

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
      assertAnyPermission(request, [
        ['ordenes_de_trabajo', 'crear_editar'],
        ['ordenes_de_trabajo', 'asignar_tecnico'],
      ]);
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
          const referencia = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: id }, select: { ID_COTIZACION_FK: true } });
          if (referencia?.ID_COTIZACION_FK != null) {
            await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${referencia.ID_COTIZACION_FK} FOR UPDATE`;
          }
          await tx.$queryRaw`SELECT "ID_ORDEN_TRABAJO" FROM ordenes_trabajo WHERE "ID_ORDEN_TRABAJO" = ${id} FOR UPDATE`;
          const otBase = await tx.ordenes_trabajo.findUnique({ where: { ID_ORDEN_TRABAJO: id } });
          if (!otBase) throw new AppError(404, 'Orden de trabajo no encontrada.');
          if (!otBase.VIGENTE) throw new AppError(409, 'Solo se puede modificar la versión vigente de la orden.');
          const existentes = await tx.orden_trabajo_detalles.findMany({
            where: { ID_ORDEN_TRABAJO_FK: id, OR: [{ activacion: true }, { activacion: null }] },
          });
          const activos = existentes.filter((detalle) => detalle.activacion !== false);
          const requiereAnexoFinal = activos.length > 10 ? true : Boolean(otBase.REQUIERE_ANEXO);
          const mismoValor = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
          const sinEdicionInstrumentos = data.instrumentos.length === activos.length &&
            new Set(data.instrumentos.map((inst) => inst.idDetalle)).size === activos.length && data.instrumentos.every((inst) => {
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
          const textoOT = (value: string | null | undefined, actual: string | null) =>
            value === undefined ? actual : value?.trim() || null;
          const razonSocialCert = textoOT(data.razonSocialCert, otBase.Razon_social);
          const nitCert = textoOT(data.nitCert, otBase.NIT);
          const correoCertificados = textoOT(data.correoCertificados, otBase.CORREO_CERTIFICADO);
          const direccionCert = textoOT(data.direccionCert, otBase.dirrecion);
          const ciudadCert = textoOT(data.ciudadCert, otBase.ciudad);
          const correoFactura = textoOT(data.correoFactura, otBase.CORREO_FACTURA);
          const fechaLimiteFacturacion = data.fechaLimiteFacturacion === undefined
            ? otBase.FECHA_LIMITE_FACTURACION
            : data.fechaLimiteFacturacion ? new Date(data.fechaLimiteFacturacion) : null;
          const texto = (value: unknown) => String(value ?? '').trim();
          const fechaMs = (value: Date | null | undefined) => value?.getTime() ?? null;
          const cambioEscalar = texto(otBase.Razon_social) !== texto(razonSocialCert) ||
            texto(otBase.NIT) !== texto(nitCert) ||
            texto(otBase.CORREO_CERTIFICADO) !== texto(correoCertificados) ||
            texto(otBase.dirrecion) !== texto(direccionCert) ||
            texto(otBase.ciudad) !== texto(ciudadCert) ||
            texto(otBase.CORREO_FACTURA) !== texto(correoFactura) ||
            texto(otBase.RESPONSABLE) !== texto(responsableFinal) ||
            fechaMs(otBase.FECHA_LIMITE_FACTURACION) !== fechaMs(fechaLimiteFacturacion) ||
            fechaMs(otBase.FECHA_CALIBRACION_DILIGENCIAMENTO) !== fechaMs(fechaDiligenciamientoFinal) ||
            fechaMs(otBase.FECHA_CALIBRACION) !== fechaMs(fechaCalibracionFinal) ||
            fechaMs(otBase.hora) !== fechaMs(horaFinal) ||
            texto(otBase.PERSONA_CONTACTO) !== texto(data.personaContactar?.trim() || null) ||
            texto(otBase.TELEFONO_CONTACTO) !== texto(data.telefonoCalibracion?.trim() || null) ||
            Boolean(otBase.REQUIERE_ANEXO) !== requiereAnexoFinal;
          const cambioAsignacion = data.instrumentos.some((inst) => {
            const actual = activos.find((detalle) => detalle.ID_DETALLE === inst.idDetalle);
            const asignado = Number(inst.asignado) > 0 ? Number(inst.asignado) : null;
            return actual != null && asignado !== actual.asignado;
          });
          if (cambioEscalar) assertPermission(request, 'ordenes_de_trabajo', 'crear_editar');
          if (cambioAsignacion) assertPermission(request, 'ordenes_de_trabajo', 'asignar_tecnico');
          huboCambioDocumento = cambioEscalar || cambioAsignacion;
          
          // A. Actualizar cabecera de la OT
          // NOTA: `estado` ya NO se escribe desde el cliente; lo gobierna la FSM.
          const otActualizada = await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: id },
            data: {
              Razon_social: razonSocialCert,
              NIT: nitCert,
              CORREO_CERTIFICADO: correoCertificados,
              dirrecion: direccionCert,
              ciudad: ciudadCert,
              CORREO_FACTURA: correoFactura,
              ...(data.responsableUsc?.trim() ? { RESPONSABLE: data.responsableUsc.trim() } : {}),
              FECHA_CALIBRACION_DILIGENCIAMENTO: data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null,
              FECHA_CALIBRACION: parsearFechaHoraCalibracion(data.fechaCalibracion),
              hora: parsearFechaHoraCalibracion(data.fechaCalibracion, data.horaCalibracion),
              HORA_CALIBRACION: parsearFechaHoraCalibracion(data.fechaCalibracion, data.horaCalibracion),
              FECHA_LIMITE_FACTURACION: fechaLimiteFacturacion,
              PERSONA_CONTACTO: data.personaContactar?.trim() || null,
              TELEFONO_CONTACTO: data.telefonoCalibracion?.trim() || null,
              REQUIERE_ANEXO: requiereAnexoFinal,
            },
          });

          codigoOT = otActualizada.CODIGO_OT;

          for (const inst of data.instrumentos) {
            const anterior = activos.find((detalle) => detalle.ID_DETALLE === inst.idDetalle);
            if (!anterior) throw new AppError(409, 'El instrumento ya no pertenece a esta OT.');
            const asignado = Number(inst.asignado) > 0 ? Number(inst.asignado) : null;
            if (asignado === anterior.asignado) continue;
            await validarAsignacionPermitida(tx, id, anterior.ID_DETALLE);
            await tx.orden_trabajo_detalles.update({
              where: { ID_DETALLE: anterior.ID_DETALLE },
              data: { asignado },
            });
          }

          // E. Recalcular el estado automático de la OT (FSM) tras aplicar los cambios.
          const fsm = await evaluarTransicionesOT(tx, id);
          estadoFinal = fsm.estadoNuevo;

          // 2. Registrar el tracker de generación documental (dentro de la tx)
          if (huboCambioDocumento) {
            const nuevaVersionOT = await siguienteVersionOT(tx, otActualizada);
            const versionada = await tx.ordenes_trabajo.update({
              where: { ID_ORDEN_TRABAJO: id },
              data: nuevaVersionOT,
            });
            codigoOT = versionada.CODIGO_OT;
            await registrarBitacora(tx, {
              action: 'UPDATE',
              tableName: 'ordenes_trabajo',
              recordId: id,
              userId: idUsuario,
              ip: request.ip,
              details: {
                codigoAnterior: otActualizada.CODIGO_OT,
                codigo: versionada.CODIGO_OT,
                estadoAnterior: otActualizada.estado,
                estadoNuevo: estadoFinal,
              },
            });
            const quoteJob = await registrarGeneracionPendiente(tx, 'generar_ot_consolidada', {
              tipo: 2, id_registro: id, tipo_entry: 'prod', id_usuario: idUsuario,
            });
            quoteJobId = quoteJob.id;
          }
        });

        if (!huboCambioDocumento || !quoteJobId) {
          return reply.code(200).send({ ok: true, message: 'No había cambios documentales; no se generó una nueva versión.', estado: estadoFinal });
        }


        return reply.code(200).send({ 
          ok: true, 
          message: 'Orden consolidada y encolada para generación documental',
          id_job: quoteJobId,
          estado: estadoFinal,
        });

      } catch (error) {
        if (error instanceof AppError) {
          return reply.code(error.statusCode).send({ ok: false, error: error.message });
        }
        throw error;
      }
    }
  );
}
