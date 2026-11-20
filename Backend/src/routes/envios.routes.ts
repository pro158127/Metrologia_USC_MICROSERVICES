import { randomUUID } from 'node:crypto';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { EstadoOT, Prisma } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { deleteObject, uploadBuffer } from '../lib/minioClient.js';
import { esPdfSelladoVigente } from '../services/documento-generado.service.js';
import { enviarCorreoYEsperar } from '../services/email-delivery.service.js';
import { transicionarOT, evaluarTransicionesOT, vincularUnidadRecepcion } from '../services/ot-fsm.service.js';
import { registrarBitacora } from '../services/bitacora.service.js';
import { assertAnyPermission } from '../lib/permissions.js';
import { pendientesEntregaSalida } from '../services/recepcion-entrega.service.js';
import { cerrarSeguimientoSiCompleto } from '../services/seguimiento-cierre.service.js';

const otParamsSchema = z.object({ id: z.coerce.number() });

/** Valida permisos del módulo entrega_y_envio. */
function assertPermisoEntrega(
  request: FastifyRequest,
  accion: 'marcar_ot_pagada' | 'enviar_certificados_lotes' | 'previsualizar_antes_de_envio'
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
    selladoPendiente: z.array(z.string()),
    entregaCompleta: z.boolean(),
    entregasPendientes: z.array(z.string()),
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
    selladoPendiente: z.array(z.string()),
    entregaCompleta: z.boolean(),
    entregasPendientes: z.array(z.string()),
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

const datosOrdenEnvio = {
  clientes: true,
  cotizaciones: { select: { CODIGO_COTIZACION: true, MONTO_TOTAL: true, ID_CLIENTE_FK: true } },
  orden_trabajo_detalles: {
    where: { OR: [{ activacion: true }, { activacion: null }] },
    select: { ID_UNIDAD_FK: true, ITEM: true },
  },
  recepciones_equipo: {
    where: { VIGENTE: true, activacion: true },
    orderBy: [{ VERSION: 'desc' }, { ID_RECEPCION: 'desc' }],
    include: {
      recepcion_equipo_detalles: {
        where: { OR: [{ activacion: true }, { activacion: null }] },
        include: {
          calibraciones: { include: { certificados: { include: {
            documentos: { include: { version_documentos: {
              orderBy: [{ VERSION: 'desc' }, { ID_VERSION: 'desc' }],
              select: { CREATED_AT: true, RUTA_URL: true },
            } } },
          } } } },
        },
      },
    },
  },
} satisfies Prisma.ordenes_trabajoInclude;

type OrdenEnvio = Prisma.ordenes_trabajoGetPayload<{ include: typeof datosOrdenEnvio }>;

type LecturaEnvio = Pick<Prisma.TransactionClient, 'ordenes_trabajo' | 'documentos'>;

async function cargarContextoOT(db: LecturaEnvio, idOT: number) {
  const ot = await db.ordenes_trabajo.findUnique({
    where: { ID_ORDEN_TRABAJO: idOT },
    include: datosOrdenEnvio,
  });
  if (!ot) throw new AppError(404, 'Orden de trabajo no encontrada');

  const { certificados, todosAprobados, selladoPendiente } = evaluarCertificadosParaEnvio([ot]);

  const comprobantes = await db.documentos.findMany({
    where: { ordenPagoId: idOT },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  const entregasPendientes = pendientesEntrega(ot.recepciones_equipo);

  return { ot, certificados, comprobantes, todosAprobados, selladoPendiente, entregaCompleta: entregasPendientes.length === 0, entregasPendientes };
}

function pendientesEntrega(recepciones: OrdenEnvio["recepciones_equipo"]): string[] {
  const faltantes = new Set<string>();
  for (const recepcion of recepciones) {
    if (recepcion.ESTADO === 'ENTREGADO') continue;
    const pendientes = pendientesEntregaSalida({
      fechaSalida: recepcion.FECHA_SALIDA,
      nombreRecibe: recepcion.NOMBRE_RECIBE,
      nombreEmpaca: recepcion.NOMBRE_EMPACA,
      accesorios: recepcion.ACCESORIOS,
      nombreRecibeServicio: recepcion.NOMBRE_RECIBE_SERVICIO,
      instrumentos: recepcion.recepcion_equipo_detalles.map((equipo) => ({
        instrumento: equipo.INSTRUMENTO,
        estadoIBC: equipo.ESTADO_IBC as { salida?: Record<string, unknown> } | null,
        activacion: equipo.activacion,
      })),
    });
    pendientes.forEach((pendiente) => faltantes.add(pendiente));
    if (pendientes.length === 0) {
      faltantes.add(`${recepcion.CODIGO_RECEPCION}: verifique los datos de entrada y consolide la recepción`);
    }
  }
  if (recepciones.length === 0) faltantes.add('recepción de equipos');
  return [...faltantes];
}

function agruparOrdenesEnvio(ordenesVigentes: OrdenEnvio[]) {
  const padresConHijasVigentes = new Set(ordenesVigentes.map((ot) => ot.ID_OT_PADRE_FK));
  const esMaestra = (ot: OrdenEnvio) => padresConHijasVigentes.has(ot.ID_ORDEN_TRABAJO);
  return {
    hijas: ordenesVigentes.filter((ot) => !esMaestra(ot)),
    maestra: ordenesVigentes.find(esMaestra),
  };
}

function evaluarCertificadosParaEnvio(ordenes: OrdenEnvio[]) {
  const unidadesPorOrden = ordenes.map((ot) => {
    const recibidos = ot.recepciones_equipo[0]?.recepcion_equipo_detalles ?? [];
    return ot.orden_trabajo_detalles.map((unidad) => {
      const detalle = vincularUnidadRecepcion(unidad, recibidos);
      const cert = detalle?.calibraciones?.certificados;
      if (!detalle || !cert) return null;
      const versiones = cert.documentos?.version_documentos ?? [];
      const archivos: { rutaUrl: string; createdAt: Date | null }[] = versiones.map((version) => ({ rutaUrl: version.RUTA_URL, createdAt: version.CREATED_AT }));
      if (!versiones.length && cert.documentos?.RUTA_URL) {
        archivos.push({ rutaUrl: cert.documentos.RUTA_URL, createdAt: null });
      }
      const rutaSellada = archivos.find((archivo) =>
        esPdfSelladoVigente(archivo, cert.CODIGO_CERTIFICADO, cert.REVISADO_AT))?.rutaUrl ?? null;
      return {
        idCertificado: cert.ID_CERTIFICADO,
        codigo: cert.CODIGO_CERTIFICADO,
        codigoOT: ot.CODIGO_OT,
        instrumento: detalle.INSTRUMENTO,
        estampilla: detalle.ESTAMPILLA,
        estadoRevision: cert.ESTADO_REVISION,
        rutaUrl: cert.ESTADO_REVISION === 'APROBADO' ? rutaSellada : null,
        idDocumento: cert.ID_DOCUMENTO_FK,
      };
    });
  });
  const certificados = unidadesPorOrden.flat().filter((certificado) => certificado != null);
  const ids = new Set(certificados.map((certificado) => certificado.idCertificado));
  const todosAprobados = ordenes.length > 0 && ids.size === certificados.length &&
    unidadesPorOrden.every((unidades) => unidades.length > 0 &&
      unidades.every((certificado) => certificado?.estadoRevision === 'APROBADO'));
  const selladoPendiente = certificados.filter((cert) => cert.estadoRevision === 'APROBADO' && !cert.rutaUrl)
    .map((cert) => cert.codigo);
  return { certificados, todosAprobados, selladoPendiente };
}

async function cargarContextoCotizacion(db: LecturaEnvio, idCotizacion: number) {
  const ordenesVigentes = await db.ordenes_trabajo.findMany({
    where: { ID_COTIZACION_FK: idCotizacion, VIGENTE: true },
    include: datosOrdenEnvio,
  });
  const { hijas, maestra: masterHeterogenea } = agruparOrdenesEnvio(ordenesVigentes);

  if (hijas.length === 0) {
    throw new AppError(404, 'La cotización no tiene órdenes de trabajo hijas vigentes');
  }

  const { certificados, todosAprobados, selladoPendiente } = evaluarCertificadosParaEnvio(hijas);

  const hijaIds = hijas.map((h) => h.ID_ORDEN_TRABAJO);
  const comprobantes = await db.documentos.findMany({
    where: { ordenPagoId: { in: hijaIds } },
    orderBy: { ID_DOCUMENTO: 'desc' },
  });

  const entregasPendientes = [...new Set(hijas.flatMap((h) => pendientesEntrega(h.recepciones_equipo)))];

  const masterHomogenea = hijas.length === 1 && hijas[0]?.SITIO_CALIBRACION == null
    ? hijas[0]
    : undefined;
  const master = masterHeterogenea ?? masterHomogenea ?? null;

  const cotizacion = hijas[0]?.cotizaciones ?? null;

  return {
    hijas,
    master,
    cotizacion,
    certificados,
    comprobantes,
    todosAprobados,
    selladoPendiente,
    entregaCompleta: entregasPendientes.length === 0,
    entregasPendientes,
  };
}

async function bloquearCotizacionParaEntrega(tx: Prisma.TransactionClient, idCotizacion: number) {
  await tx.$queryRaw`SELECT "ID_COTIZACION" FROM cotizaciones WHERE "ID_COTIZACION" = ${idCotizacion} FOR UPDATE`;
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

  app.get('/api/v1/envios/listado', {
    preHandler: [fastify.authenticate],
    schema: { response: { 200: z.array(z.object({
      idCotizacion: z.number(),
      codigoCotizacion: z.string(),
      masterCodigo: z.string(),
      cliente: z.string(),
      correo: z.string().nullable(),
      totalHijas: z.number(),
      fecha: z.iso.datetime().nullable(),
    })) } },
  }, async (request) => {
    assertAnyPermission(request, [
      ['entrega_y_envio', 'marcar_ot_pagada'],
      ['entrega_y_envio', 'enviar_certificados_lotes'],
      ['entrega_y_envio', 'previsualizar_antes_de_envio'],
    ]);
    const ordenes = await fastify.prisma.ordenes_trabajo.findMany({
      where: { VIGENTE: true, ID_COTIZACION_FK: { not: null } },
      include: datosOrdenEnvio,
      orderBy: { CREATED_AT: 'desc' },
    });
    const grupos = new Map<number, OrdenEnvio[]>();
    for (const orden of ordenes) {
      if (orden.ID_COTIZACION_FK == null) continue;
      const grupo = grupos.get(orden.ID_COTIZACION_FK) ?? [];
      grupo.push(orden);
      grupos.set(orden.ID_COTIZACION_FK, grupo);
    }
    return [...grupos].flatMap(([idCotizacion, grupo]) => {
      const { hijas, maestra } = agruparOrdenesEnvio(grupo);
      const primera = hijas[0];
      if (!primera || hijas.some((ot) => ot.estado === EstadoOT.Certificado_enviado) || !evaluarCertificadosParaEnvio(hijas).todosAprobados) return [];
      return [{
        idCotizacion,
        codigoCotizacion: primera.cotizaciones?.CODIGO_COTIZACION ?? '—',
        masterCodigo: maestra?.CODIGO_OT ?? (hijas.length === 1 ? primera.CODIGO_OT : '—'),
        cliente: primera.clientes?.RAZON_SOCIAL ?? '—',
        correo: primera.CORREO_CERTIFICADO ?? maestra?.CORREO_CERTIFICADO ?? primera.clientes?.CORREO ?? null,
        totalHijas: hijas.length,
        fecha: primera.CREATED_AT?.toISOString() ?? null,
      }];
    });
  });

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
      assertAnyPermission(request, [
        ['entrega_y_envio', 'marcar_ot_pagada'],
        ['entrega_y_envio', 'enviar_certificados_lotes'],
        ['entrega_y_envio', 'previsualizar_antes_de_envio'],
      ]);
      const { ot, certificados, comprobantes, todosAprobados, selladoPendiente, entregaCompleta, entregasPendientes } = await cargarContextoOT(
        fastify.prisma,
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
          selladoPendiente,
          entregaCompleta,
          entregasPendientes,
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
      const { ot, todosAprobados } = await cargarContextoOT(fastify.prisma, idOT);
      if (!ot.VIGENTE) throw new AppError(409, 'La orden dejó de estar vigente.');

      const destinoPago = ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null;
      if (!destinoPago) {
        throw new AppError(409, 'No se puede registrar el pago: la OT no tiene un correo válido. Revise o actualice el correo electrónico.');
      }

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
      const key = `comprobantes/${ot.CODIGO_OT}_${randomUUID()}.pdf`;
      const nombre = `Comprobante_${ot.CODIGO_OT}.pdf`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: nombre });

      // Transacción atómica: documento + pago + FSM + seguimiento comercial.
      const resultado = await fastify.prisma.$transaction(async (tx) => {
        if (ot.ID_COTIZACION_FK != null) await bloquearCotizacionParaEntrega(tx, ot.ID_COTIZACION_FK);
        await tx.$queryRaw`SELECT "ID_ORDEN_TRABAJO" FROM ordenes_trabajo WHERE "ID_ORDEN_TRABAJO" = ${idOT} FOR UPDATE`;
        const contextoActual = await cargarContextoOT(tx, idOT);
        if (!contextoActual.ot.VIGENTE || !contextoActual.todosAprobados) {
          throw new AppError(409, 'La orden cambió mientras se cargaba el comprobante. Consulte su estado vigente.');
        }
        const yaPagada = contextoActual.ot.estado_pago === 'PAGADO';

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

        // Recalcula estados técnicos, pero el pago por sí solo no marca el certificado como enviado.
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

        await registrarBitacora(tx, {
          action: 'MARCAR_PAGADA',
          tableName: 'ordenes_trabajo',
          recordId: idOT,
          userId: Number(request.user?.sub ?? 0),
          ip: request.ip,
          details: { codigoOT: ot.CODIGO_OT, idDocumento: documento.ID_DOCUMENTO },
        });

        if (!yaPagada) {
          await enviarCorreoYEsperar({
            to: destinoPago,
            subject: `Pago registrado — OT ${ot.CODIGO_OT}`,
            template_type: 'pago_registrado',
            context_data: {
              nombreCliente: ot.clientes?.NOMBRE_CONTACTO ?? ot.clientes?.RAZON_SOCIAL ?? 'Cliente',
              numeroOT: ot.CODIGO_OT,
              numeroCotizacion: ot.no_cotizacion ?? null,
            },
            minio_links: [key],
            id_registro: idOT,
            notificar_usuario_id: Number(request.user?.sub ?? 0) || null,
            modulo_origen: 'entrega_y_envio',
            tabla_origen: 'ordenes_trabajo',
            tipo_entry: 'prod',
          });
        }

        if (ot.ID_COTIZACION_FK) {
          await cerrarSeguimientoSiCompleto(tx, ot.ID_COTIZACION_FK, Number(request.user?.sub ?? 0) || null);
        }

        return { idDocumento: documento.ID_DOCUMENTO, rutaUrl: documento.RUTA_URL, yaPagada };
      }, { timeout: 180_000 }).catch(async (error) => {
        await deleteObject(key).catch((err) => request.log.warn({ err, key }, 'Error al retirar el comprobante no registrado'));
        throw error;
      });

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
      const { destino, jobId } = await fastify.prisma.$transaction(async (tx) => {
        const referencia = await tx.ordenes_trabajo.findUnique({
          where: { ID_ORDEN_TRABAJO: idOT }, select: { ID_COTIZACION_FK: true },
        });
        if (referencia?.ID_COTIZACION_FK != null) {
          await bloquearCotizacionParaEntrega(tx, referencia.ID_COTIZACION_FK);
        }
        await tx.$queryRaw`SELECT "ID_ORDEN_TRABAJO" FROM ordenes_trabajo WHERE "ID_ORDEN_TRABAJO" = ${idOT} FOR UPDATE`;
        const { ot, certificados, comprobantes, todosAprobados, selladoPendiente } = await cargarContextoOT(tx, idOT);

        if (!ot.VIGENTE || ot.estado === EstadoOT.Certificado_enviado) {
          throw new AppError(409, 'La orden dejó de estar disponible para envío o ya se envió.');
        }
        if (ot.estado_pago !== 'PAGADO') throw new AppError(409, 'Registre el pago de la OT antes de enviar.');
        if (comprobantes.length === 0) {
          throw new AppError(409, 'Debe adjuntar el comprobante de pago antes de enviar.');
        }
        if (!todosAprobados) {
          throw new AppError(409, 'Todos los certificados deben estar aprobados para enviar.');
        }
        if (selladoPendiente.length) {
          throw new AppError(409, `PDF sellado pendiente de publicación: ${selladoPendiente.join(', ')}.`);
        }

        const destino = ot.CORREO_CERTIFICADO ?? ot.clientes?.CORREO ?? null;
        if (!destino) {
          throw new AppError(409, 'La OT no tiene correo de certificados configurado.');
        }

        const links = [
          ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
          ...comprobantes.map((c) => c.RUTA_URL),
        ];

        const emailData = {
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
          notificar_usuario_id: Number(request.user?.sub ?? 0) || null,
          modulo_origen: 'entrega_y_envio',
          tabla_origen: 'ordenes_trabajo',
          tipo_entry: 'prod',
        } as const;
        await transicionarOT(tx, idOT, EstadoOT.Certificado_enviado, { permitirRetroceso: true });
        await registrarBitacora(tx, {
            action: 'ENVIAR_CERTIFICADOS', tableName: 'ordenes_trabajo', recordId: idOT,
            userId: Number(request.user?.sub ?? 0), ip: request.ip,
            details: { codigoOT: ot.CODIGO_OT, totalCertificados: certificados.length },
        });
        const jobId = await enviarCorreoYEsperar(emailData);
        if (ot.ID_COTIZACION_FK) {
          await cerrarSeguimientoSiCompleto(tx, ot.ID_COTIZACION_FK, Number(request.user?.sub ?? 0) || null);
        }
        return { destino, jobId };
      }, { timeout: 180_000 });

      return {
        ok: true as const,
        message: `Certificados enviados a ${destino}.`,
        id_job: jobId,
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
      assertAnyPermission(request, [
        ['entrega_y_envio', 'marcar_ot_pagada'],
        ['entrega_y_envio', 'enviar_certificados_lotes'],
        ['entrega_y_envio', 'previsualizar_antes_de_envio'],
      ]);
      const idCotizacion = request.params.id;
      const { hijas, master, cotizacion, certificados, comprobantes, todosAprobados, selladoPendiente, entregaCompleta, entregasPendientes } =
        await cargarContextoCotizacion(fastify.prisma, idCotizacion);

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
          selladoPendiente,
          entregaCompleta,
          entregasPendientes,
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
      const { todosAprobados } = await cargarContextoCotizacion(fastify.prisma, idCotizacion);

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

      const key = `comprobantes/cotizacion_${idCotizacion}_${randomUUID()}.pdf`;
      const nombre = `Comprobante_${idCotizacion}.pdf`;
      await uploadBuffer(key, buffer, 'application/pdf', { originalName: nombre });

      await fastify.prisma.$transaction(async (tx) => {
        await bloquearCotizacionParaEntrega(tx, idCotizacion);
        const contextoActual = await cargarContextoCotizacion(tx, idCotizacion);
        if (!contextoActual.todosAprobados) {
          throw new AppError(409, 'La cotización cambió mientras se cargaba el comprobante. Consulte sus órdenes vigentes.');
        }
        const { hijas, master, cotizacion } = contextoActual;
        const idVinculo = hijas[0].ID_ORDEN_TRABAJO;
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
        await cerrarSeguimientoSiCompleto(tx, idCotizacion, Number(request.user?.sub ?? 0) || null);

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
      }).catch(async (error) => {
        await deleteObject(key).catch((err) => request.log.warn({ err, key }, 'Error al retirar el comprobante no registrado'));
        throw error;
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
      const { destino, jobId } = await fastify.prisma.$transaction(async (tx) => {
        await bloquearCotizacionParaEntrega(tx, idCotizacion);
        const { hijas, master, cotizacion, certificados, comprobantes, todosAprobados, selladoPendiente } =
          await cargarContextoCotizacion(tx, idCotizacion);

        if (hijas.some((ot) => ot.estado === EstadoOT.Certificado_enviado)) {
          throw new AppError(409, 'La cotización ya tiene órdenes enviadas. Revise su trazabilidad antes de repetir el envío.');
        }
        if (hijas.some((ot) => ot.estado_pago !== 'PAGADO')) {
          throw new AppError(409, 'Registre el pago de todas las órdenes antes de enviar.');
        }
        if (comprobantes.length === 0) {
          throw new AppError(409, 'Debe adjuntar el comprobante de pago antes de enviar.');
        }
        if (!todosAprobados) {
          throw new AppError(409, 'Todos los certificados deben estar aprobados para enviar.');
        }
        if (selladoPendiente.length) {
          throw new AppError(409, `PDF sellado pendiente de publicación: ${selladoPendiente.join(', ')}.`);
        }

        const destino =
          hijas[0]?.CORREO_CERTIFICADO ?? master?.CORREO_CERTIFICADO ?? hijas[0]?.clientes?.CORREO ?? null;
        if (!destino) {
          throw new AppError(409, 'La cotización no tiene correo de certificados configurado.');
        }

        const links = [
          ...certificados.map((c) => c.rutaUrl).filter((v): v is string => !!v),
          ...comprobantes.map((c) => c.RUTA_URL),
        ];

        const emailData = {
          to: destino,
          subject: `Certificados de calibración — Cotización ${cotizacion?.CODIGO_COTIZACION ?? idCotizacion}`,
          template_type: 'envia_certifiados',
          context_data: {
            nombreCliente:
              hijas[0]?.clientes?.NOMBRE_CONTACTO ?? hijas[0]?.clientes?.RAZON_SOCIAL ?? 'Cliente',
            numeroOT: hijas.map((h) => h.CODIGO_OT).join(', '),
            numeroCotizacion: cotizacion?.CODIGO_COTIZACION ?? null,
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
          notificar_usuario_id: Number(request.user?.sub ?? 0) || null,
          modulo_origen: 'entrega_y_envio',
          tabla_origen: 'cotizaciones',
          tipo_entry: 'prod',
        } as const;
        for (const hija of hijas) {
          await transicionarOT(tx, hija.ID_ORDEN_TRABAJO, EstadoOT.Certificado_enviado, { permitirRetroceso: true });
        }
        await registrarBitacora(tx, {
            action: 'ENVIAR_CERTIFICADOS', tableName: 'cotizaciones', recordId: idCotizacion,
            userId: Number(request.user?.sub ?? 0), ip: request.ip,
            details: { idCotizacion, totalOTs: hijas.length, totalCertificados: certificados.length },
        });
        const jobId = await enviarCorreoYEsperar(emailData);
        await cerrarSeguimientoSiCompleto(tx, idCotizacion, Number(request.user?.sub ?? 0) || null);
        return { destino, jobId };
      }, { timeout: 180_000 });

      return {
        ok: true as const,
        message: `Certificados enviados a ${destino}.`,
        id_job: jobId,
      };
    }
  );
}
