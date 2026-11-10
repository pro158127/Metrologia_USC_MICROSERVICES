import { FastifyInstance, FastifyRequest } from 'fastify';
import { EstadoOT } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import { getCertificatePdfQueue } from '../lib/queue/queue.js';
import { esAcreditado, seleccionarPlantillaSello } from '../services/certificatePdf.service.js';
import { evaluarTransicionesOT, transicionarOT } from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { notificarUsuario } from '../services/notificacion.service.js';
import {
  aprobarCertificadoBodySchema,
  calibracionRawToDtoSchema,
  certificadoIdParamsSchema,
  certificadoRawToDtoSchema,
  clienteRawToDtoSchema,
  ordenTrabajoRawToDtoSchema,
  recepcionEquipoDetalleRawToDtoSchema,
  rechazarCertificadoBodySchema,
  respuestaCertificadoMutacionSchema,
  respuestaCertificadosSchema,
} from './certificados.schemas.js';

/** Valida que el usuario tenga permisos de revisión de certificados. */
function assertPermisoRevision(request: FastifyRequest): void {
  const rev = request.user?.user?.permissions?.permisos?.revision;
  const puede = Boolean(
    rev?.revisar_aprobar_acreditados || rev?.revisar_aprobar_no_acreditados
  );
  if (!puede) {
    throw new AppError(403, 'Sin permisos para revisar/aprobar certificados.');
  }
}

export default async function certificadosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/certificados',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaCertificadosSchema },
      },
    },
    async () => {
      const [certificados, calibraciones, instrumentos, ordenes, clientes] = await Promise.all([
        fastify.prisma.certificados.findMany({
          include: { certificado_sellos: true },
          orderBy: { ID_CERTIFICADO: 'desc' },
        }),
        fastify.prisma.calibraciones.findMany(),
        fastify.prisma.recepcion_equipo_detalles.findMany(),
        fastify.prisma.ordenes_trabajo.findMany({
          include: {
            clientes: true,
            cotizaciones: { include: { clientes: true } },
            orden_trabajo_detalles: true,
          },
        }),
        fastify.prisma.clientes.findMany(),
      ]);

      return {
        ok: true as const,
        data: {
          certificados: certificados.map((c) => certificadoRawToDtoSchema.parse(c)),
          calibraciones: calibraciones.map((c) => calibracionRawToDtoSchema.parse(c)),
          instrumentos: instrumentos.map((i) => recepcionEquipoDetalleRawToDtoSchema.parse(i)),
          ordenes: ordenes.map((o) => ordenTrabajoRawToDtoSchema.parse(o)),
          clientes: clientes.map((cl) => clienteRawToDtoSchema.parse(cl)),
        },
      };
    }
  );

  // ==========================================================================
  // GET /api/v1/certificados/revision
  // Bandeja de revisión con contexto (instrumento, OT, cliente, técnico, tipo).
  // ==========================================================================
  app.get(
    '/api/v1/certificados/revision',
    { preHandler: [fastify.authenticate] },
    async () => {
      const certificados = await fastify.prisma.certificados.findMany({
        include: {
          documentos: true,
          calibraciones: {
            include: {
              usuarios: true,
              recepcion_equipo_detalles: {
                include: {
                  recepciones_equipo: {
                    include: {
                      ordenes_trabajo: {
                        include: { clientes: true, orden_trabajo_detalles: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { ID_CERTIFICADO: 'desc' },
      });

      return certificados.map((cert) => {
        const cal = cert.calibraciones;
        const detalle = cal?.recepcion_equipo_detalles;
        const ot = detalle?.recepciones_equipo?.ordenes_trabajo ?? null;
        const otDetalle =
          ot?.orden_trabajo_detalles.find((d) => d.INSTRUMENTO === detalle?.INSTRUMENTO) ??
          ot?.orden_trabajo_detalles.find((d) => d.ITEM === detalle?.ITEM) ??
          null;

        return {
          idCertificado: cert.ID_CERTIFICADO,
          codigo: cert.CODIGO_CERTIFICADO,
          estadoRevision: cert.ESTADO_REVISION,
          motivoRechazo: cert.MOTIVO_RECHAZO,
          idDocumento: cert.ID_DOCUMENTO_FK,
          rutaUrl: cert.documentos?.RUTA_URL ?? null,
          mimeType: cert.documentos?.MIME_TYPE ?? 'application/pdf',
          idPlantillaSello: cert.ID_PLANTILLA_SELLO_FK,
          idCalibracion: cert.ID_CALIBRACION_FK,
          idInstrumento: detalle?.ID_INSTRUMENTO ?? null,
          instrumento: detalle?.INSTRUMENTO ?? '—',
          estampilla: detalle?.ESTAMPILLA ?? '—',
          serie: detalle?.SERIE ?? null,
          marca: detalle?.MARCA ?? null,
          modelo: detalle?.MODELO ?? null,
          idOrdenTrabajo: ot?.ID_ORDEN_TRABAJO ?? null,
          codigoOT: ot?.CODIGO_OT ?? '—',
          cliente: ot?.clientes?.RAZON_SOCIAL ?? '—',
          tecnico: cal?.usuarios?.NOMBRE_COMPLETO ?? '—',
          tipoServicio: otDetalle?.TIPO_SERVICIO ?? null,
          datosTecnicos: cal?.DATOS_TECNICOS_JSON ?? null,
          createdAt: cal?.CREATED_AT ?? null,
          acreditado: esAcreditado(otDetalle?.TIPO_SERVICIO ?? null),
        };
      });
    }
  );

  // ==========================================================================
  // POST /api/v1/certificados/:id/aprobar
  // Aprueba, infiere plantilla de sello (Acreditado/No Acreditado) y encola el PDF.
  // ==========================================================================
  app.post(
    '/api/v1/certificados/:id/aprobar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: certificadoIdParamsSchema,
        body: aprobarCertificadoBodySchema,
        response: { 200: respuestaCertificadoMutacionSchema },
      },
    },
    async (request) => {
      assertPermisoRevision(request);
      const idCertificado = request.params.id;
      const idUsuario = Number(request.user?.sub ?? 0);

      const cert = await fastify.prisma.certificados.findUnique({
        where: { ID_CERTIFICADO: idCertificado },
        include: {
          calibraciones: {
            include: {
              recepcion_equipo_detalles: {
                include: {
                  recepciones_equipo: {
                    include: { ordenes_trabajo: { include: { orden_trabajo_detalles: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!cert) throw new AppError(404, 'Certificado no encontrado');

      const detalle = cert.calibraciones?.recepcion_equipo_detalles;
      const ot = detalle?.recepciones_equipo?.ordenes_trabajo ?? null;
      const otDetalle =
        ot?.orden_trabajo_detalles.find((d) => d.INSTRUMENTO === detalle?.INSTRUMENTO) ??
        ot?.orden_trabajo_detalles.find((d) => d.ITEM === detalle?.ITEM) ??
        null;

      // Selección de plantilla de sello por acreditación del instrumento (ID 1/2).
      const plantilla = request.body.selloId
        ? await fastify.prisma.plantillas_sellos.findUnique({
            where: { ID_PLANTILLA_SELLO: request.body.selloId },
          })
        : await seleccionarPlantillaSello(fastify.prisma, otDetalle?.TIPO_SERVICIO ?? null);

      const actualizado = await fastify.prisma.$transaction(async (tx) => {
        const upd = await tx.certificados.update({
          where: { ID_CERTIFICADO: idCertificado },
          data: {
            ESTADO_REVISION: 'APROBADO',
            MOTIVO_RECHAZO: null,
            ID_REVISOR_FK: idUsuario,
            REVISADO_AT: new Date(),
            ID_PLANTILLA_SELLO_FK: plantilla?.ID_PLANTILLA_SELLO ?? null,
          },
          include: { certificado_sellos: true },
        });
        if (ot) await evaluarTransicionesOT(tx, ot.ID_ORDEN_TRABAJO);

        await registrarBitacora(tx, {
          action: 'APROBAR',
          tableName: 'certificados',
          recordId: idCertificado,
          userId: idUsuario,
          ip: request.ip,
          details: {
            codigo: cert.CODIGO_CERTIFICADO,
            idOrdenTrabajo: ot?.ID_ORDEN_TRABAJO ?? null,
            idPlantillaSello: plantilla?.ID_PLANTILLA_SELLO ?? null,
          },
        });

        return upd;
      });

      // Encolar la generación asíncrona del certificado final sellado
      const job = await getCertificatePdfQueue().add('generar-certificado', {
        tipo: 'certificado',
        certificadoId: idCertificado,
        selloId: plantilla?.ID_PLANTILLA_SELLO,
        usuarioId: idUsuario,
      });

      return {
        ok: true as const,
        message: plantilla
          ? `Certificado aprobado. Plantilla "${plantilla.NOMBRE}" encolada para sellado.`
          : 'Certificado aprobado. No hay plantilla de sello configurada; se conserva el PDF original.',
        data: certificadoRawToDtoSchema.parse(actualizado),
        id_job: job.id,
      };
    }
  );

  // ==========================================================================
  // POST /api/v1/certificados/:id/rechazar
  // Anula la certificación (descripción obligatoria) y devuelve el flujo al técnico.
  // ==========================================================================
  app.post(
    '/api/v1/certificados/:id/rechazar',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: certificadoIdParamsSchema,
        body: rechazarCertificadoBodySchema,
        response: { 200: respuestaCertificadoMutacionSchema },
      },
    },
    async (request) => {
      assertPermisoRevision(request);
      const idCertificado = request.params.id;
      const idUsuario = Number(request.user?.sub ?? 0);

      const cert = await fastify.prisma.certificados.findUnique({
        where: { ID_CERTIFICADO: idCertificado },
        include: {
          calibraciones: {
            include: {
              recepcion_equipo_detalles: {
                include: { recepciones_equipo: { include: { ordenes_trabajo: true } } },
              },
            },
          },
        },
      });
      if (!cert) throw new AppError(404, 'Certificado no encontrado');

      const ot = cert.calibraciones?.recepcion_equipo_detalles?.recepciones_equipo?.ordenes_trabajo;
      const idTecnico = cert.calibraciones?.ID_TECNICO_FK ?? null;

      const actualizado = await fastify.prisma.$transaction(async (tx) => {
        const upd = await tx.certificados.update({
          where: { ID_CERTIFICADO: idCertificado },
          data: {
            ESTADO_REVISION: 'RECHAZADO',
            MOTIVO_RECHAZO: request.body.descripcion,
            ID_REVISOR_FK: idUsuario,
            REVISADO_AT: new Date(),
          },
          include: { certificado_sellos: true },
        });

        // Trazabilidad: registrar cada devolución con usuario, fecha y motivo.
        await tx.historial_devoluciones_informes.create({
          data: {
            ID_CERTIFICADO_FK: idCertificado,
            ID_CALIBRACION_FK: cert.ID_CALIBRACION_FK,
            ID_USUARIO_FK: idUsuario,
            MOTIVO: request.body.descripcion,
          },
        });

        // Devolver el flujo al técnico (transición explícita con retroceso permitido).
        if (ot) {
          await transicionarOT(tx, ot.ID_ORDEN_TRABAJO, EstadoOT.En_calibración, {
            permitirRetroceso: true,
          });

          // Trazabilidad comercial del rechazo (módulo Seguimiento Comercial).
          if (ot.ID_COTIZACION_FK) {
            await tx.seguimientos_comerciales.create({
              data: {
                ID_COTIZACION_FK: ot.ID_COTIZACION_FK,
                TIPO: 'RECHAZO',
                DESCRIPCION: `Certificado ${cert.CODIGO_CERTIFICADO} rechazado: ${request.body.descripcion}`,
                RESULTADO: 'RECHAZADO',
                ID_USUARIO_FK: idUsuario || null,
              },
            });
          }
        }

        await registrarBitacora(tx, {
          action: 'RECHAZAR',
          tableName: 'certificados',
          recordId: idCertificado,
          userId: idUsuario,
          ip: request.ip,
          details: {
            codigo: cert.CODIGO_CERTIFICADO,
            idOrdenTrabajo: ot?.ID_ORDEN_TRABAJO ?? null,
            motivo: request.body.descripcion,
          },
        });

        // Notificar al técnico responsable del instrumento.
        await notificarUsuario(tx, {
          idUsuario: idTecnico,
          mensaje: `Tu certificado ${cert.CODIGO_CERTIFICADO} fue devuelto para corrección: ${request.body.descripcion}`,
          modulo: 'revision',
          nivelPrioridad: 'ALTA',
        });

        return upd;
      });

      return {
        ok: true as const,
        message: 'Certificado rechazado. El flujo fue devuelto al técnico.',
        data: certificadoRawToDtoSchema.parse(actualizado),
      };
    }
  );

  // ==========================================================================
  // GET /api/v1/certificados/:id/devoluciones
  // Historial de devoluciones (trazabilidad) de un certificado/informe.
  // ==========================================================================
  app.get(
    '/api/v1/certificados/:id/devoluciones',
    {
      preHandler: [fastify.authenticate],
      schema: { params: certificadoIdParamsSchema },
    },
    async (request) => {
      const idCertificado = request.params.id;

      const historial = await fastify.prisma.historial_devoluciones_informes.findMany({
        where: { ID_CERTIFICADO_FK: idCertificado },
        include: {
          usuarios: {
            select: {
              ID_USUARIO_AUTO_INCREMENT: true,
              NOMBRE_COMPLETO: true,
              CORREO_INSTITUCION: true,
            },
          },
        },
        orderBy: { FECHA_DEVOLUCION: 'desc' },
      });

      return historial.map((h) => ({
        id: h.ID_HISTORIAL_DEVOLUCION,
        idCertificado: h.ID_CERTIFICADO_FK,
        idCalibracion: h.ID_CALIBRACION_FK,
        idUsuario: h.ID_USUARIO_FK,
        revisor: h.usuarios?.NOMBRE_COMPLETO ?? null,
        motivo: h.MOTIVO,
        fecha: h.FECHA_DEVOLUCION,
      }));
    }
  );
}
