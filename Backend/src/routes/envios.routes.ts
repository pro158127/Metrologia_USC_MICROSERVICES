import { FastifyInstance, FastifyRequest } from 'fastify';
import { EstadoOT } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { uploadBuffer } from '../lib/minioClient.js';
import { getEmailQueue } from '../lib/queue/queue.js';
import { transicionarOT, evaluarTransicionesOT } from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';

const otParamsSchema = z.object({ id: z.coerce.number() });

/** Valida permisos del módulo entrega_y_envio. */
function assertPermisoEntrega(
  request: FastifyRequest,
  accion: 'marcar_ot_pagada' | 'enviar_certificados_lotes'
): void {
  const permisos = request.user?.user?.permissions?.permisos?.entrega_y_envio;
  if (!permisos?.[accion]) {
    throw new AppError(403, `Sin permisos para ${accion} (entrega y envío).`);
  }
}

const respuestaDocumentosEnvioSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    idOrdenTrabajo: z.number(),
    codigoOT: z.string(),
    cliente: z.string(),
    correo: z.string().nullable(),
    todosAprobados: z.boolean(),
    certificados: z.array(
      z.object({
        idCertificado: z.number(),
        codigo: z.string(),
        instrumento: z.string(),
        estampilla: z.string().nullable(),
        estadoRevision: z.string(),
        rutaUrl: z.string().nullable(),
        idDocumento: z.number(),
      })
    ),
    comprobantes: z.array(
      z.object({ idDocumento: z.number(), nombre: z.string(), rutaUrl: z.string() })
    ),
  }),
});

const respuestaDocumentosEnvioCotizacionSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    idCotizacion: z.number(),
    codigoCotizacion: z.string().nullable(),
    masterCodigo: z.string().nullable(),
    cliente: z.string(),
    correo: z.string().nullable(),
    todosAprobados: z.boolean(),
    ots: z.array(
      z.object({
        idOrdenTrabajo: z.number(),
        codigo: z.string(),
        sitioCalibracion: z.string().nullable(),
      })
    ),
    certificados: z.array(
      z.object({
        idCertificado: z.number(),
        codigo: z.string(),
        codigoOT: z.string(),
        instrumento: z.string(),
        estampilla: z.string().nullable(),
        estadoRevision: z.string(),
        rutaUrl: z.string().nullable(),
        idDocumento: z.number(),
      })
    ),
    comprobantes: z.array(
      z.object({ idDocumento: z.number(), nombre: z.string(), rutaUrl: z.string() })
    ),
  }),
});

async function cargarContextoOT(fastify: FastifyInstance, idOT: number) {
  const ot = await fastify.prisma.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    include: {
      clientes: true,
      recepciones_equipo: {
        include: {
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            include: {
              calibraciones: {
                include: { certificados: { include: { documentos: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!ot) throw new AppError(404, 'Orden de trabajo no encontrada');

  const certificados = ot.recepciones_equipo.flatMap((rec) =>
    rec.recepcion_equipo_detalles.flatMap((det) => {
      const cert = det.calibraciones?.certificados;
      if (!cert) return [];
      return [
        {
          idCertificado: cert.ID_CERTIFICADO,
          codigo: cert.CODIGO_CERTIFICADO,
          instrumento: det.INSTRUMENTO,
          estampilla: det.ESTAMPILLA,
          estadoRevision: cert.ESTADO_REVISION,
          rutaUrl: cert.documentos?.RUTA_URL ?? null,
          idDocumento: cert.ID_DOCUMENTO_FK,
        },
      ];
    })
  );

  const comprobantes = await fastify.prisma.documentos.findMany({
    where: { ordenPagoId: idOT },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  const todosAprobados =
    certificados.length > 0 && certificados.every((c) => c.estadoRevision === 'APROBADO');

  return { ot, certificados, comprobantes, todosAprobados };
}

async function cargarContextoCotizacion(fastify: FastifyInstance, idCotizacion: number) {
  const hijas = await fastify.prisma.ordenes_trabajo.findMany({
    where: {
      ID_COTIZACION_FK: idCotizacion,
      SITIO_CALIBRACION: { not: null },
      VIGENTE: true,
    },
    include: {
      clientes: true,
      recepciones_equipo: {
        include: {
          recepcion_equipo_detalles: {
            where: { OR: [{ activacion: true }, { activacion: null }] },
            include: {
              calibraciones: { include: { certificados: { include: { documentos: true } } } },
            },
          },
        },
      },
    },
  });

  if (hijas.length === 0) {
    throw new AppError(404, 'La cotización no tiene órdenes de trabajo hijas vigentes');
  }

  const certificados = hijas.flatMap((hija) =>
    hija.recepciones_equipo.flatMap((rec) =>
      rec.recepcion_equipo_detalles.flatMap((det) => {
        const cert = det.calibraciones?.certificados;
        if (!cert) return [];
        return [
          {
            idCertificado: cert.ID_CERTIFICADO,
            codigo: cert.CODIGO_CERTIFICADO,
            codigoOT: hija.CODIGO_OT,
            instrumento: det.INSTRUMENTO,
            estampilla: det.ESTAMPILLA,
            estadoRevision: cert.ESTADO_REVISION,
            rutaUrl: cert.documentos?.RUTA_URL ?? null,
            idDocumento: cert.ID_DOCUMENTO_FK,
          },
        ];
      })
    )
  );

  const hijaIds = hijas.map((h) => h.ID_ORDEN_TRABAJO);
  const comprobantes = await fastify.prisma.documentos.findMany({
    where: { ordenPagoId: { in: hijaIds } },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  const todosAprobados =
    certificados.length > 0 && certificados.every((c) => c.estadoRevision === 'APROBADO');

  const master = await fastify.prisma.ordenes_trabajo.findFirst({
    where: { ID_COTIZACION_FK: idCotizacion, SITIO_CALIBRACION: null, VIGENTE: true },
    select: { ID_ORDEN_TRABAJO: true, CODIGO_OT: true, CORREO_CERTIFICADO: true },
  });

  const cotizacion = await fastify.prisma.cotizaciones.findUnique({
    where: { ID_COTIZACION: idCotizacion },
    select: { CODIGO_COTIZACION: true, MONTO_TOTAL: true, ID_CLIENTE_FK: true },
  });

  return {
    hijas,
    master,
    cotizacion,
    certificados,
    comprobantes,
    todosAprobados,
  };
}

async function convertirImagenAPdf(buffer: Buffer, mime: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const img =
    mime === 'image/png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return Buffer.from(await pdf.save());
}

export default async function enviosRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  // ==========================================================================
  // GET /api/v1/ordenes/:id/documentos-envio
  // Certificados aprobados + comprobante (PDF) para el visor integrado.
  // ==========================================================================
  app.get(
    '/api/v1/ordenes/:id/documentos-envio',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: otParamsSchema,
        response: { 200: respuestaDocumentosEnvioSchema },
      },
    },
    async (request) => {
      const { ot, certificados, comprobantes, todosAprobados } = await cargarContextoOT(
        fastify,
        request.params.id
      );

      return {
        ok: true as const,
        data: {
          idOrdenTrabajo: ot.ID_ORDEN_TRABAJO,
          codigoOT: ot.CODIGO_OT,
          cliente: ot.clientes?.RAZON_SOCIAL ?? ot.Razon_social ?? '—',
          correo: ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null,
          todosAprobados,
          certificados,
          comprobantes: comprobantes.map((c) => ({
            idDocumento: c.ID_DOCUMENTO,
            nombre: c.NOMBRE,
            rutaUrl: c.RUTA_URL,
          })),
        },
      };
    }
  );

  // ==========================================================================
  // POST /api/v1/ordenes/:id/comprobante (multipart)
  // Solo si TODOS los certificados están aprobados. Las imágenes se convierten a PDF.
  // ==========================================================================
  app.post(
    '/api/v1/ordenes/:id/comprobante',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      assertPermisoEntrega(request, 'marcar_ot_pagada');
      const idOT = request.params.id;
      const { ot, certificados, todosAprobados } = await cargarContextoOT(fastify, idOT);

      const cotizacion = ot.ID_COTIZACION_FK
        ? await fastify.prisma.cotizaciones.findUnique({
            where: { ID_COTIZACION: ot.ID_COTIZACION_FK },
            select: { CODIGO_COTIZACION: true, MONTO_TOTAL: true, ID_CLIENTE_FK: true },
          })
        : null;

      if (!todosAprobados) {
        throw new AppError(
          409,
          'El comprobante solo puede subirse cuando TODOS los certificados de la OT están aprobados.'
        );
      }

      const data = await (request as any).file();
      if (!data) throw new AppError(400, 'Debe adjuntar el comprobante (imagen o PDF)');

      const mime: string = data.mimetype;
      let buffer: Buffer = await data.toBuffer();

      const esImagen = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg';
      if (esImagen) {
        buffer = await convertirImagenAPdf(buffer, mime === 'image/jpg' ? 'image/jpeg' : mime);
      } else if (mime !== 'application/pdf') {
        throw new AppError(415, 'Formato no permitido. Use PDF, PNG o JPG.');
      }

      // En BD solo se registran comprobantes tipo PDF. Cada subida crea un
      // documento nuevo: se admiten uno o más comprobantes por OT.
      const key = `comprobantes/${ot.CODIGO_OT}_${Date.now()}.pdf`;
      const nombre = `Comprobante_${ot.CODIGO_OT}.pdf`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: nombre });

      // Transacción atómica: documento + pago + FSM + seguimiento comercial.
      const resultado = await fastify.prisma.$transaction(async (tx) => {
        const otActual = await tx.ordenes_trabajo.findUnique({
          where: { ID_ORDEN_TRABAJO: idOT },
          select: { estado_pago: true },
        });
        const yaPagada = otActual?.estado_pago === 'PAGADO';

        const documento = await tx.documentos.create({
          data: {
            NOMBRE: nombre,
            RUTA_URL: key,
            PROVEEDOR: 'AWS_S3',
            MIME_TYPE: 'application/pdf',
            ID_ORDEN_TRABAJO_FK: idOT,
            ordenPagoId: idOT,
          },
        });

        await tx.ordenes_trabajo.update({
          where: { ID_ORDEN_TRABAJO: idOT },
          data: { estado_pago: 'PAGADO' },
        });

        // El pago registrado dispara automáticamente el estado "Certificado_enviado".
        await evaluarTransicionesOT(tx, idOT);

        // Crear (idempotente) la factura asociada a la cotización.
        const numeroFactura = cotizacion?.CODIGO_COTIZACION
          ? `FAC-${cotizacion.CODIGO_COTIZACION}`
          : null;
        if (numeroFactura) {
          const facturaExistente = await tx.facturas.findUnique({
            where: { NUMERO_FACTURA: numeroFactura },
          });
          if (!facturaExistente) {
            await tx.facturas.create({
              data: {
                NUMERO_FACTURA: numeroFactura,
                ID_ORDEN_TRABAJO_FK: idOT,
                ID_CLIENTE_FK: cotizacion?.ID_CLIENTE_FK ?? ot.ID_CLIENTE_FK ?? null,
                FECHA: new Date(),
                VALOR: Number(cotizacion?.MONTO_TOTAL ?? 0),
                ESTADO: 'EMITIDA',
              },
            });
          }
        }

        // Trazabilidad comercial: solo en la transición no-PAGADO -> PAGADO.
        if (!yaPagada && ot.ID_COTIZACION_FK) {
          await tx.seguimientos_comerciales.create({
            data: {
              ID_COTIZACION_FK: ot.ID_COTIZACION_FK,
              TIPO: 'PAGO',
              DESCRIPCION: `Comprobante de pago registrado — OT ${ot.CODIGO_OT}`,
              RESULTADO: 'PAGADO',
              ID_USUARIO_FK: Number(request.user?.sub ?? 0) || null,
            },
          });
        }

        await registrarBitacora(tx, {
          action: 'MARCAR_PAGADA',
          tableName: 'ordenes_trabajo',
          recordId: idOT,
          userId: Number(request.user?.sub ?? 0),
          ip: request.ip,
          details: { codigoOT: ot.CODIGO_OT, idDocumento: documento.ID_DOCUMENTO },
        });

        return { idDocumento: documento.ID_DOCUMENTO, rutaUrl: documento.RUTA_URL, yaPagada };
      });

      // Notificación de "pago registrado" (una sola vez por transición de pago).
      if (!resultado.yaPagada) {
        const destino = ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null;
        if (destino) {
          const links = [
            ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
            resultado.rutaUrl,
          ];
          try {
            await getEmailQueue().add('pago_registrado', {
              to: destino,
              subject: `Pago registrado — OT ${ot.CODIGO_OT}`,
              template_type: 'pago_registrado',
              context_data: {
                nombreCliente: ot.clientes?.NOMBRE_CONTACTO ?? ot.clientes?.RAZON_SOCIAL ?? 'Cliente',
                numeroOT: ot.CODIGO_OT,
                numeroCotizacion: ot.no_cotizacion ?? null,
                totalCertificados: certificados.length,
                certificados: certificados.map((c, i) => ({
                  item: i + 1,
                  codigo: c.codigo,
                  instrumento: c.instrumento,
                  estampilla: c.estampilla ?? '—',
                })),
              },
              minio_links: links,
              id_registro: idOT,
              tipo_entry: 'prod',
            });
          } catch (mailError) {
            fastify.log.error(mailError);
          }
        }
      }

      return {
        ok: true as const,
        data: {
          idDocumento: resultado.idDocumento,
          rutaUrl: resultado.rutaUrl,
        },
      };
    }
  );

  // ==========================================================================
  // POST /api/v1/ordenes/:id/enviar-certificados
  // Valida comprobante + certificados aprobados, transiciona la OT y encola el correo.
  // ==========================================================================
  app.post(
    '/api/v1/ordenes/:id/enviar-certificados',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      assertPermisoEntrega(request, 'enviar_certificados_lotes');
      const idOT = request.params.id;
      const { ot, certificados, comprobantes, todosAprobados } = await cargarContextoOT(
        fastify,
        idOT
      );

      if (comprobantes.length === 0) {
        throw new AppError(409, 'Debe adjuntar el comprobante de pago antes de enviar.');
      }
      if (!todosAprobados) {
        throw new AppError(409, 'Todos los certificados deben estar aprobados para enviar.');
      }

      const destino = ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null;
      if (!destino) {
        throw new AppError(409, 'La OT no tiene correo de certificados configurado.');
      }

      // Transición explícita al estado de envío.
      await transicionarOT(fastify.prisma, idOT, EstadoOT.Certificado_enviado, {
        permitirRetroceso: true,
      });

      await registrarBitacora(fastify.prisma, {
        action: 'ENVIAR_CERTIFICADOS',
        tableName: 'ordenes_trabajo',
        recordId: idOT,
        userId: Number(request.user?.sub ?? 0),
        ip: request.ip,
        details: { codigoOT: ot.CODIGO_OT, totalCertificados: certificados.length },
      });

      const links = [
        ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
        ...comprobantes.map((c) => c.RUTA_URL),
      ];

      const job = await getEmailQueue().add('enviar_certificados', {
        to: destino,
        subject: `Certificados de calibración — OT ${ot.CODIGO_OT}`,
        template_type: 'envia_certifiados',
        context_data: {
          nombreCliente: ot.clientes?.NOMBRE_CONTACTO ?? ot.clientes?.RAZON_SOCIAL ?? 'Cliente',
          numeroOT: ot.CODIGO_OT,
          numeroCotizacion: ot.no_cotizacion ?? null,
          totalCertificados: certificados.length,
          certificados: certificados.map((c, i) => ({
            item: i + 1,
            codigo: c.codigo,
            instrumento: c.instrumento,
            estampilla: c.estampilla ?? '—',
          })),
        },
        minio_links: links,
        id_registro: idOT,
        tipo_entry: 'prod',
      });

      return {
        ok: true as const,
        message: `Certificados encolados para envío a ${destino}.`,
        id_job: job.id,
      };
    }
  );

  // ==========================================================================
  // Cotización (agrupa hijas) — documentos de envío
  // ==========================================================================
  app.get(
    '/api/v1/cotizaciones/:id/documentos-envio',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: otParamsSchema,
        response: { 200: respuestaDocumentosEnvioCotizacionSchema },
      },
    },
    async (request) => {
      const idCotizacion = request.params.id;
      const { hijas, master, cotizacion, certificados, comprobantes, todosAprobados } =
        await cargarContextoCotizacion(fastify, idCotizacion);

      const cliente = hijas[0]?.clientes?.RAZON_SOCIAL ?? '—';
      const correo = hijas[0]?.CORREO_CERTIFICADO ?? master?.CORREO_CERTIFICADO ?? hijas[0]?.clientes?.CORREO ?? null;

      return {
        ok: true as const,
        data: {
          idCotizacion,
          codigoCotizacion: cotizacion?.CODIGO_COTIZACION ?? null,
          masterCodigo: master?.CODIGO_OT ?? null,
          cliente,
          correo,
          todosAprobados,
          ots: hijas.map((h) => ({
            idOrdenTrabajo: h.ID_ORDEN_TRABAJO,
            codigo: h.CODIGO_OT,
            sitioCalibracion: h.SITIO_CALIBRACION,
          })),
          certificados,
          comprobantes: comprobantes.map((c) => ({
            idDocumento: c.ID_DOCUMENTO,
            nombre: c.NOMBRE,
            rutaUrl: c.RUTA_URL,
          })),
        },
      };
    }
  );

  // ==========================================================================
  // Cotización — subir comprobante (marca todas las hijas PAGADO)
  // ==========================================================================
  app.post(
    '/api/v1/cotizaciones/:id/comprobante',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      assertPermisoEntrega(request, 'marcar_ot_pagada');
      const idCotizacion = request.params.id;
      const { hijas, master, cotizacion, certificados, todosAprobados } =
        await cargarContextoCotizacion(fastify, idCotizacion);

      if (!todosAprobados) {
        throw new AppError(
          409,
          'El comprobante solo puede subirse cuando TODOS los certificados de la cotización están aprobados.'
        );
      }

      const data = await (request as any).file();
      if (!data) throw new AppError(400, 'Debe adjuntar el comprobante (imagen o PDF)');

      const mime: string = data.mimetype;
      let buffer: Buffer = await data.toBuffer();

      const esImagen = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg';
      if (esImagen) {
        buffer = await convertirImagenAPdf(buffer, mime === 'image/jpg' ? 'image/jpeg' : mime);
      } else if (mime !== 'application/pdf') {
        throw new AppError(415, 'Formato no permitido. Use PDF, PNG o JPG.');
      }

      const key = `comprobantes/cotizacion_${idCotizacion}_${Date.now()}.pdf`;
      const nombre = `Comprobante_${idCotizacion}.pdf`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: nombre });

      const idVinculo = hijas[0].ID_ORDEN_TRABAJO;

      await fastify.prisma.$transaction(async (tx) => {
        await tx.documentos.create({
          data: {
            NOMBRE: nombre,
            RUTA_URL: key,
            PROVEEDOR: 'AWS_S3',
            MIME_TYPE: 'application/pdf',
            ID_ORDEN_TRABAJO_FK: idVinculo,
            ordenPagoId: idVinculo,
          },
        });

        for (const hija of hijas) {
          await tx.ordenes_trabajo.update({
            where: { ID_ORDEN_TRABAJO: hija.ID_ORDEN_TRABAJO },
            data: { estado_pago: 'PAGADO' },
          });
          await evaluarTransicionesOT(tx, hija.ID_ORDEN_TRABAJO);
        }

        // Crear (idempotente) la factura asociada a la cotización.
        const numeroFactura = cotizacion?.CODIGO_COTIZACION
          ? `FAC-${cotizacion.CODIGO_COTIZACION}`
          : null;
        if (numeroFactura) {
          const existente = await tx.facturas.findUnique({
            where: { NUMERO_FACTURA: numeroFactura },
          });
          if (!existente) {
            await tx.facturas.create({
              data: {
                NUMERO_FACTURA: numeroFactura,
                ID_ORDEN_TRABAJO_FK: master?.ID_ORDEN_TRABAJO ?? hijas[0].ID_ORDEN_TRABAJO,
                ID_CLIENTE_FK: cotizacion?.ID_CLIENTE_FK ?? null,
                FECHA: new Date(),
                VALOR: Number(cotizacion?.MONTO_TOTAL ?? 0),
                ESTADO: 'EMITIDA',
              },
            });
          }
        }

        await registrarBitacora(tx, {
          action: 'MARCAR_PAGADA',
          tableName: 'cotizaciones',
          recordId: idCotizacion,
          userId: Number(request.user?.sub ?? 0),
          ip: request.ip,
          details: { idCotizacion, totalOTs: hijas.length },
        });
      });

      return {
        ok: true as const,
        data: { rutaUrl: key },
      };
    }
  );

  // ==========================================================================
  // Cotización — enviar certificados (transiciona todas las hijas y encola 1 correo)
  // ==========================================================================
  app.post(
    '/api/v1/cotizaciones/:id/enviar-certificados',
    {
      preHandler: [fastify.authenticate],
      schema: { params: otParamsSchema },
    },
    async (request) => {
      assertPermisoEntrega(request, 'enviar_certificados_lotes');
      const idCotizacion = request.params.id;
      const { hijas, master, certificados, comprobantes, todosAprobados } =
        await cargarContextoCotizacion(fastify, idCotizacion);

      if (comprobantes.length === 0) {
        throw new AppError(409, 'Debe adjuntar el comprobante de pago antes de enviar.');
      }
      if (!todosAprobados) {
        throw new AppError(409, 'Todos los certificados deben estar aprobados para enviar.');
      }

      const destino =
        hijas[0]?.CORREO_CERTIFICADO ?? master?.CORREO_CERTIFICADO ?? hijas[0]?.clientes?.CORREO ?? null;
      if (!destino) {
        throw new AppError(409, 'La cotización no tiene correo de certificados configurado.');
      }

      for (const hija of hijas) {
        await transicionarOT(fastify.prisma, hija.ID_ORDEN_TRABAJO, EstadoOT.Certificado_enviado, {
          permitirRetroceso: true,
        });
      }

      await registrarBitacora(fastify.prisma, {
        action: 'ENVIAR_CERTIFICADOS',
        tableName: 'cotizaciones',
        recordId: idCotizacion,
        userId: Number(request.user?.sub ?? 0),
        ip: request.ip,
        details: { idCotizacion, totalOTs: hijas.length, totalCertificados: certificados.length },
      });

      const links = [
        ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
        ...comprobantes.map((c) => c.RUTA_URL),
      ];

      const job = await getEmailQueue().add('enviar_certificados', {
        to: destino,
        subject: `Certificados de calibración — Cotización ${idCotizacion}`,
        template_type: 'envia_certifiados',
        context_data: {
          nombreCliente:
            hijas[0]?.clientes?.NOMBRE_CONTACTO ?? hijas[0]?.clientes?.RAZON_SOCIAL ?? 'Cliente',
          numeroOT: hijas.map((h) => h.CODIGO_OT).join(', '),
          numeroCotizacion: null,
          totalCertificados: certificados.length,
          certificados: certificados.map((c, i) => ({
            item: i + 1,
            codigo: c.codigo,
            instrumento: c.instrumento,
            estampilla: c.estampilla ?? '—',
          })),
        },
        minio_links: links,
        id_registro: idCotizacion,
        tipo_entry: 'prod',
      });

      return {
        ok: true as const,
        message: `Certificados encolados para envío a ${destino}.`,
        id_job: job.id,
      };
    }
  );
}
