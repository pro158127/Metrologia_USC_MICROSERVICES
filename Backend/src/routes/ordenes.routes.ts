import { createHash } from 'node:crypto';
import { resolverPlantillaOperativa } from '../services/plantillas-readiness.service.js';
import { FastifyInstance } from 'fastify';
import { Estados, Prisma } from '@prisma/client';
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
  vincularUnidadRecepcion,
} from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { assertAnyPermission, assertPermission } from '../lib/permissions.js';
import { generarConsecutivo } from '../services/consecutivo.service.js';
import { sincronizarOTMaestraDesdeRecepcion } from '../services/recepcion-ot-sync.service.js';
import { siguienteVersionOT } from '../services/versionado-ot.service.js';
import { cotizacionAdmiteImportacionVinculada } from '../services/importacion-cotizacion.service.js';
import { validarClienteActivoParaOperacion } from '../services/cliente-operacion.service.js';

export default async function ordenesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/ordenes/cotizaciones-importables',
    { preHandler: [fastify.authenticate], schema: { querystring: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      busqueda: z.string().trim().max(100).optional(),
    }) } },
    async (request) => {
      assertPermission(request, 'ordenesOt', 'acceso');
      const { page, limit, busqueda } = request.query;
      const where: Prisma.cotizacionesWhereInput = {
        ESTADO: Estados.APROBADA,
        clientes: { status: 'ACTIVO' },
        ...(busqueda ? { OR: [
          { CODIGO_COTIZACION: { contains: busqueda, mode: 'insensitive' as const } },
          { clientes: { RAZON_SOCIAL: { contains: busqueda, mode: 'insensitive' as const } } },
        ] } : {}),
      };
      const [total, cotizaciones] = await fastify.prisma.$transaction([
        fastify.prisma.cotizaciones.count({ where }),
        fastify.prisma.cotizaciones.findMany({
          where,
          orderBy: { CREATED_AT: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            ID_COTIZACION: true, CODIGO_COTIZACION: true, CREATED_AT: true, ESTADO: true,
            clientes: { select: { RAZON_SOCIAL: true } },
            cotizacion_detalles: { where: { activacion: true }, select: { CANTIDAD: true } },
            ordenes_trabajo: {
              where: { VIGENTE: true },
              select: { ID_ORDEN_TRABAJO: true, CODIGO_OT: true, VERSION: true, estado: true },
              orderBy: [{ VERSION: 'desc' }, { ID_ORDEN_TRABAJO: 'desc' }],
            },
          },
        }),
      ]);
      return {
        ok: true as const,
        data: cotizaciones.map((cotizacion) => ({
          idCotizacion: cotizacion.ID_COTIZACION,
          codigo: cotizacion.CODIGO_COTIZACION,
          cliente: cotizacion.clientes?.RAZON_SOCIAL ?? 'Cliente sin razón social',
          createdAt: cotizacion.CREATED_AT,
          estado: cotizacion.ESTADO,
          equiposContados: cotizacion.cotizacion_detalles.reduce((sum, detalle) => sum + detalle.CANTIDAD, 0),
          otsExistentes: cotizacion.ordenes_trabajo.map((ot) => ({
            id: ot.ID_ORDEN_TRABAJO, codigo: ot.CODIGO_OT, version: ot.VERSION, estado: ot.estado,
          })),
        })),
        meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    },
  );

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
          select: { ID_COTIZACION: true, ESTADO: true, ID_CLIENTE_FK: true },
        });
        if (!cotizacion) throw new AppError(404, 'La cotización seleccionada no existe.');
        if (!cotizacionAdmiteImportacionVinculada(cotizacion.ESTADO)) {
          throw new AppError(409, `La importación vinculada requiere una cotización APROBADA. Estado actual: ${cotizacion.ESTADO}.`);
        }
        await validarClienteActivoParaOperacion(fastify.prisma, cotizacion.ID_CLIENTE_FK);
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
        let responsableOT: string | null = null;
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
          if (data.codigoActual && data.codigoActual !== otBase.CODIGO_OT) {
            throw new AppError(409, 'La orden cambió mientras la editabas. Vuelve a abrirla.');
          }
          const existentes = await tx.orden_trabajo_detalles.findMany({
            where: { ID_ORDEN_TRABAJO_FK: id, OR: [{ activacion: true }, { activacion: null }] },
          });
          const activos = existentes.filter((detalle) => detalle.activacion !== false);
          const requiereAnexoFinal = activos.length > 10 ? true : Boolean(otBase.REQUIERE_ANEXO);
          const porId = new Map(activos.map((detalle) => [detalle.ID_DETALLE, detalle]));
          const cambiosInstrumentos = data.instrumentos.map((inst) => {
            const actual = inst.idDetalle == null ? undefined : porId.get(inst.idDetalle);
            if (!actual || actual.ITEM !== inst.item || actual.TIPO_SERVICIO !== inst.tipoServicio ||
                actual.INSTRUMENTO !== inst.instrumento) {
              throw new AppError(409, 'El ítem, el tipo de servicio y el instrumento se administran desde Cotizaciones y Recepciones.');
            }
            const texto = (valor?: string | null) => valor?.trim() || null;
            const campos = {
              FABRICANTE: texto(inst.fabricante),
              MODELO: texto(inst.modelo),
              SERIE: texto(inst.serie),
              CODIGO_INVENTARIO: texto(inst.codigoInventario),
              UBICACION: texto(inst.ubicacion),
              PUNTOS_CALIBRAR: inst.puntosCalibrar ?? actual.PUNTOS_CALIBRAR,
              UNIDAD: texto(inst.unidad),
              INTERVALO_RANGO: texto(inst.intervaloRango),
              RESOLUCION: texto(inst.resolucion),
              DECLARACION_CONFORMIDAD: inst.declaracionConformidad,
              LIMITE_CONTROL_EMC: texto(inst.limiteControlEMC),
              DOC_ESPECIFICACION: texto(inst.docEspecificacion),
              REGLA_DECISION: texto(inst.reglaDecision),
            };
            const cambio = Object.entries(campos).some(([clave, valor]) => {
              const anterior = actual[clave as keyof typeof campos];
              return typeof valor === 'string' || valor === null
                ? texto(typeof anterior === 'string' ? anterior : null) !== valor
                : JSON.stringify(anterior) !== JSON.stringify(valor);
            });
            const asignado = Number(inst.asignado) > 0 ? Number(inst.asignado) : null;
            return { actual, campos, cambio, asignado };
          });
          if (cambiosInstrumentos.length !== activos.length ||
              new Set(cambiosInstrumentos.map(({ actual }) => actual.ID_DETALLE)).size !== activos.length) {
            throw new AppError(409, 'Desde OT no se pueden agregar, duplicar ni retirar instrumentos.');
          }

          const responsableFinal = data.responsableUsc?.trim() ? data.responsableUsc.trim() : otBase.RESPONSABLE;
          const fechaDiligenciamientoFinal = data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null;
          const fechaCalibracionFinal = data.fechaCalibracion === undefined
            ? otBase.FECHA_CALIBRACION : data.fechaCalibracion ? new Date(data.fechaCalibracion) : null;
          const horaAnterior = otBase.HORA_CALIBRACION ?? (otBase.FECHA_CALIBRACION ? otBase.hora : null);
          const hora = data.horaCalibracion === undefined
            ? horaAnterior?.toISOString().slice(11, 16) : data.horaCalibracion;
          // La hora del formulario es una hora de calendario y se almacena con componentes UTC.
          const diaHora = fechaCalibracionFinal?.toISOString().slice(0, 10) ?? '1970-01-01';
          const horaFinal = data.horaCalibracion === undefined && data.fechaCalibracion === undefined
            ? horaAnterior : hora ? new Date(`${diaHora}T${hora}:00Z`) : null;
          const textoOT = (value: string | null | undefined, actual: string | null) =>
            value === undefined ? actual : value?.trim() || null;
          const razonSocialCert = textoOT(data.razonSocialCert, otBase.Razon_social);
          const nitCert = textoOT(data.nitCert, otBase.NIT);
          const correoCertificados = textoOT(data.correoCertificados, otBase.CORREO_CERTIFICADO);
          const direccionCert = textoOT(data.direccionCert, otBase.dirrecion);
          const ciudadCert = textoOT(data.ciudadCert, otBase.ciudad);
          const correoFactura = textoOT(data.correoFactura, otBase.CORREO_FACTURA);
          const observaciones = textoOT(data.observaciones, otBase.OBSERVACIONES);
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
            texto(otBase.OBSERVACIONES) !== texto(observaciones) ||
            texto(otBase.RESPONSABLE) !== texto(responsableFinal) ||
            fechaMs(otBase.FECHA_LIMITE_FACTURACION) !== fechaMs(fechaLimiteFacturacion) ||
            fechaMs(otBase.FECHA_CALIBRACION_DILIGENCIAMENTO) !== fechaMs(fechaDiligenciamientoFinal) ||
            fechaMs(otBase.FECHA_CALIBRACION) !== fechaMs(fechaCalibracionFinal) ||
            fechaMs(horaAnterior) !== fechaMs(horaFinal) ||
            texto(otBase.PERSONA_CONTACTO) !== texto(data.personaContactar?.trim() || null) ||
            texto(otBase.TELEFONO_CONTACTO) !== texto(data.telefonoCalibracion?.trim() || null) ||
            Boolean(otBase.REQUIERE_ANEXO) !== requiereAnexoFinal;
          const cambioAsignacion = cambiosInstrumentos.some(({ actual, asignado }) => asignado !== actual.asignado);
          const cambioInstrumentos = cambiosInstrumentos.some(({ cambio }) => cambio);
          if (cambioEscalar || cambioInstrumentos) assertPermission(request, 'ordenes_de_trabajo', 'crear_editar');
          if (cambioAsignacion) assertPermission(request, 'ordenes_de_trabajo', 'asignar_tecnico');
          huboCambioDocumento = cambioEscalar || cambioAsignacion || cambioInstrumentos;

          const recepcionesCambiadas = new Map<number, string>();
          const recepciones = cambioInstrumentos ? await tx.recepciones_equipo.findMany({
            where: { ID_ORDEN_TRABAJO_FK: id, VIGENTE: true, activacion: true },
            include: { recepcion_equipo_detalles: {
              where: { OR: [{ activacion: true }, { activacion: null }] },
              include: { calibraciones: { select: { ID_CALIBRACION: true } } },
            } },
          }) : [];
          if (cambioInstrumentos && await tx.ordenes_trabajo.count({
            where: { ID_OT_PADRE_FK: id, VIGENTE: true },
          })) {
            throw new AppError(409, 'Edita los instrumentos desde la OT del sitio correspondiente.');
          }
          for (const { actual, campos, cambio, asignado } of cambiosInstrumentos) {
            const reasignado = asignado !== actual.asignado;
            if (reasignado) await validarAsignacionPermitida(tx, id, actual.ID_DETALLE);
            if (cambio) {
              if (otBase.estado === 'Certificado_enviado') {
                throw new AppError(409, 'La OT ya tiene certificados enviados.');
              }
              const vinculadas = recepciones.flatMap((recepcion) => {
                const detalle = vincularUnidadRecepcion(actual, recepcion.recepcion_equipo_detalles);
                return detalle ? [{ recepcion, detalle }] : [];
              });
              if (vinculadas.length > 1) {
                throw new AppError(409, 'La unidad coincide con más de una recepción. Revisa su vinculación.');
              }
              const vinculada = vinculadas[0];
              if (vinculada) {
                const { recepcion, detalle } = vinculada;
                if (detalle.calibraciones) {
                  throw new AppError(409, `"${actual.INSTRUMENTO}" ya inició calibración. No se pueden cambiar sus datos técnicos.`);
                }
                const compartidos = {
                  ...(campos.FABRICANTE !== actual.FABRICANTE && campos.FABRICANTE !== detalle.MARCA && { MARCA: campos.FABRICANTE }),
                  ...(campos.MODELO !== actual.MODELO && campos.MODELO !== detalle.MODELO && { MODELO: campos.MODELO }),
                  ...(campos.SERIE !== actual.SERIE && campos.SERIE !== detalle.SERIE && { SERIE: campos.SERIE }),
                  ...(campos.CODIGO_INVENTARIO !== actual.CODIGO_INVENTARIO && campos.CODIGO_INVENTARIO !== detalle.CODIGO_INVENTARIO && { CODIGO_INVENTARIO: campos.CODIGO_INVENTARIO }),
                  ...(campos.RESOLUCION !== actual.RESOLUCION && campos.RESOLUCION !== detalle.RESOLUCION && { RESOLUCION: campos.RESOLUCION }),
                };
                if (Object.keys(compartidos).length) {
                  await tx.recepcion_equipo_detalles.update({
                    where: { ID_INSTRUMENTO: detalle.ID_INSTRUMENTO }, data: compartidos,
                  });
                  recepcionesCambiadas.set(recepcion.ID_RECEPCION, recepcion.CODIGO_RECEPCION);
                }
              }
            }
            if (cambio || reasignado) await tx.orden_trabajo_detalles.update({
              where: { ID_DETALLE: actual.ID_DETALLE },
              data: { ...(cambio ? campos : {}), ...(reasignado ? { asignado } : {}) },
            });
          }

          for (const [idRecepcion, anterior] of recepcionesCambiadas) {
            const codigo = await generarConsecutivo(tx, 'REC', anterior);
            await tx.recepciones_equipo.update({
              where: { ID_RECEPCION: idRecepcion }, data: { CODIGO_RECEPCION: codigo, VERSION: { increment: 1 } },
            });
            await registrarGeneracionPendiente(tx, 'actualizacion_recepcion', {
              tipo: 3, id_registro: idRecepcion, codigo_actual: codigo, tipo_entry: 'prod', id_usuario: idUsuario,
            });
          }
          if (cambioInstrumentos && otBase.ID_OT_PADRE_FK &&
              await sincronizarOTMaestraDesdeRecepcion(tx, otBase.ID_OT_PADRE_FK)) {
            await registrarGeneracionPendiente(tx, 'generar_ot_consolidada', {
              tipo: 2, id_registro: otBase.ID_OT_PADRE_FK, tipo_entry: 'prod', id_usuario: idUsuario,
            });
          }

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
              OBSERVACIONES: observaciones,
              RESPONSABLE: responsableFinal,
              FECHA_CALIBRACION_DILIGENCIAMENTO: data.fechaDiligenciamiento ? new Date(data.fechaDiligenciamiento) : null,
              ...(data.fechaCalibracion !== undefined && { FECHA_CALIBRACION: fechaCalibracionFinal }),
              ...((data.horaCalibracion !== undefined || data.fechaCalibracion !== undefined) && {
                hora: horaFinal, HORA_CALIBRACION: horaFinal,
              }),
              FECHA_LIMITE_FACTURACION: fechaLimiteFacturacion,
              PERSONA_CONTACTO: data.personaContactar?.trim() || null,
              TELEFONO_CONTACTO: data.telefonoCalibracion?.trim() || null,
              REQUIERE_ANEXO: requiereAnexoFinal,
            },
          });

          codigoOT = otActualizada.CODIGO_OT;
          responsableOT = otActualizada.RESPONSABLE ?? null;

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
                recepcionesVersionadas: [...recepcionesCambiadas.keys()],
              },
            });
            const quoteJob = await registrarGeneracionPendiente(tx, 'generar_ot_consolidada', {
              tipo: 2, id_registro: id, tipo_entry: 'prod', id_usuario: idUsuario,
            });
            quoteJobId = quoteJob.id;
          }
        });

        if (!huboCambioDocumento || !quoteJobId) {
          return reply.code(200).send({ ok: true, message: 'No había cambios documentales; no se generó una nueva versión.', estado: estadoFinal, codigo: codigoOT, responsable: responsableOT });
        }


        return reply.code(200).send({ 
          ok: true, 
          message: 'Orden consolidada y encolada para generación documental',
          id_job: quoteJobId,
          estado: estadoFinal,
          codigo: codigoOT,
          responsable: responsableOT,
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
