import { FastifyInstance } from 'fastify';
import { Estados, Prisma } from '@prisma/client';

// Transiciones de estado permitidas (misma fuente que el server action).
const transicionesValidas: Record<Estados, Estados[]> = {
  BORRADOR: [Estados.ENVIADA],
  ENVIADA: [Estados.APROBADA, Estados.RECHAZADA],
  APROBADA: [Estados.EN_SEGUIMIENTO],
  RECHAZADA: [],
  EN_SEGUIMIENTO: [],
};

interface DetalleBody {
  equipoDescripcion: string;
  tipoServicio: string;
  magnitud: string;
  normaTecnica?: string | null;
  cantidad: number;
  valorUnitario: number;
}

interface CrearCotizacionBody {
  codigo: string;
  idCliente: number;
  viaticos?: number;
  descuento?: number;
  estado?: Estados;
  detalles: DetalleBody[];
}

interface ActualizarCotizacionBody {
  idCotizacion: number;
  codigo?: string;
  idCliente?: number;
  estado?: Estados;
  viaticos?: number;
  descuento?: number;
  detalles?: DetalleBody[];
}

interface CambiarEstadoBody {
  nuevoEstado: Estados;
}

interface ListCotizacionesQuery {
  page?: string;
  limit?: string;
  estado?: string;
  idCliente?: string;
  busqueda?: string;
}

// ==========================================
// SERIALIZADORES (RAW -> camelCase del frontend)
// ==========================================
function serializeCliente(row: Record<string, any>): Record<string, any> {
  return {
    idCliente: row.ID_CLIENTE,
    nitCedula: row.NIT,
    razonSocial: row.RAZON_SOCIAL,
    correo: row.CORREO,
    nombreContacto: row.NOMBRE_CONTACTO ?? null,
    telefono: row.TELEFONO ?? null,
    observacion: row.OBSERVACION ?? null,
    idRutDocumento: row.ID_RUT_DOCUMENTO_FK ?? null,
    status: row.status,
    createat: row.createat,
    dirrecion: row.dirrecion,
    updatedAt: row.updatedAt,
    ciudad: row.ciudad ?? null,
    tipoCliente: row.TIPO_CLIENTE,
  };
}

function serializeDetalle(row: Record<string, any>): Record<string, any> {
  return {
    idDetalle: row.ID_DETALLE,
    idCotizacion: row.ID_COTIZACION_FK,
    equipoDescripcion: row.EQUIPO_DESCRIPCION,
    tipoServicio: row.TIPO_SERVICIO,
    magnitud: row.MAGNITUD,
    normaTecnica: row.NORMA_TECNICA ?? null,
    cantidad: row.CANTIDAD,
    valorUnitario: row.VALOR_UNITARIO,
    valorTotal: row.VALOR_TOTAL,
    sitio: row.sitio ?? null,
  };
}

function serializeHistorialEstado(row: Record<string, any>): Record<string, any> {
  return {
    id: row.ID_HISTORIAL,
    idCotizacion: row.ID_COTIZACION_FK,
    estadoAnterior: row.ESTADO_ANTERIOR ?? null,
    estadoNuevo: row.ESTADO_NUEVO,
    idUsuario: row.ID_USUARIO_FK,
    createdAt: row.CREATED_AT,
  };
}

function serializeHistorialCambio(row: Record<string, any>): Record<string, any> {
  return {
    id: row.id,
    numeroVersion: row.numero_version,
    fechaCambio: row.fecha_cambio,
    descripcion: row.descripcion,
    requiereValidacionHoja: row.requiere_validacion_hoja,
    observaciones: row.observaciones ?? null,
    aprobo: row.aprobo,
    idCotizacion: row.id_cotizacion,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeDocumento(row: Record<string, any>): Record<string, any> {
  return {
    idDocumento: row.ID_DOCUMENTO,
    nombre: row.NOMBRE,
    rutaUrl: row.RUTA_URL,
    proveedor: row.PROVEEDOR,
    mimeType: row.MIME_TYPE,
    createdAt: row.CREATED_AT,
    idCotizacion: row.ID_COTIZACION_FK ?? null,
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO_FK ?? null,
    idRecepcion: row.ID_RECEPCION_FK ?? null,
    idPlantilla: row.ID_PLANTILLA_FK ?? null,
    ordenPagoId: row.ordenPagoId ?? null,
  };
}

function serializeOrdenTrabajo(row: Record<string, any>): Record<string, any> {
  return {
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO,
    codigo: row.CODIGO_OT,
    idCotizacion: row.ID_COTIZACION_FK ?? null,
    idCliente: row.ID_CLIENTE_FK ?? null,
    correoCertificado: row.CORREO_CERTIFICADO ?? null,
    correoFactura: row.CORREO_FACTURA ?? null,
    fechaLimiteFacturacion: row.FECHA_LIMITE_FACTURACION ?? null,
    NIT: row.NIT ?? 'sin nit',
    dirrecion: row.dirrecion ?? 'sin dirreccion',
    ciudad: row.ciudad ?? 'sin ciudad',
    esInternoUSC: row.ES_INTERNO_USC ?? false,
    esEnSitio: row.ES_EN_SITIO ?? false,
    esLabPermanente: row.ES_LAB_PERMANENTE ?? true,
    personaContacto: row.PERSONA_CONTACTO ?? null,
    telefonoContacto: row.TELEFONO_CONTACTO ?? null,
    fechaCalibracion: row.FECHA_CALIBRACION ?? null,
    hora: row.hora ?? null,
    Razon_social: row.Razon_social ?? 'sin razon_social',
    dirrecion_solcitante: row.dirrecion_solcitante ?? 'sin dirreccion',
    personaContacto_solicitante: row.PERSONA_CONTACT_SOLCITANTE ?? null,
    ciudad_solcitante: row.ciudad_solcitante ?? 'sin ciudad',
    NIT_solicitante: row.NIT_solicitante ?? 'sin nit',
    telefonoContacto_solcitante: row.TELEFONO_CONTACTO_SOLICITANTE ?? null,
    no_orden_trabajo: row.no_orden_trabajo ?? 'n/a',
    no_cotizacion: row.no_cotizacion ?? 'n/a',
    responsable: row.RESPONSABLE ?? null,
    fecha_dilgenciamento: row.FECHA_CALIBRACION_DILIGENCIAMENTO ?? null,
    requireAnexo: row.REQUIERE_ANEXO ?? false,
    observaciones: row.OBSERVACIONES ?? null,
    estado: row.estado ?? null,
    estadoRevision: row.ESTADO_REVISION ?? 'PENDIENTE_REVISION',
    motivoRechazo: row.MOTIVO_RECHAZO ?? null,
    createdAt: row.CREATED_AT ?? null,
    estado_pago: row.estado_pago ?? null,
    alertamessag: row.alertamessag ?? 'sin novedades',
  };
}

function serializeRecepcionEquipo(row: Record<string, any>): Record<string, any> {
  return {
    idRecepcion: row.ID_RECEPCION,
    codigo: row.CODIGO_RECEPCION,
    idCotizacion: row.ID_COTIZACION_FK ?? null,
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO_FK ?? null,
    solicitante: row.SOLICITANTE,
    nombreEntrega: row.NOMBRE_ENTREGA ?? null,
    sitioCalibracion: row.SITIO_CALIBRACION,
    fechaRecepcion: row.FECHA_RECEPCION,
    fechaSalida: row.FECHA_SALIDA ?? null,
    nombreRecibe: row.NOMBRE_RECIBE ?? null,
    nombreEmpaca: row.NOMBRE_EMPACA ?? null,
    nombreCalibra: row.NOMBRE_CALIBRA ?? null,
    nombreRecibeServicio: row.NOMBRE_RECIBE_SERVICIO ?? null,
    accesorios: row.ACCESORIOS ?? null,
    pruebasCompletas: row.PRUEBAS_COMPLETAS ?? true,
    observacionesPruebas: row.OBSERVACIONES_PRUEBAS ?? null,
    estado: row.ESTADO ?? 'RECIBIDO',
    createdAt: row.CREATED_AT,
  };
}

function serializeCount(row: Record<string, any>): Record<string, any> {
  return {
    ordenes: row.ordenes_trabajo ?? 0,
    recepciones: row.recepciones_equipo ?? 0,
    documentos: row.documentos ?? 0,
    historialEstados: row.historial_estado_cotizacion ?? 0,
  };
}

function serializeCotizacion(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {
    idCotizacion: row.ID_COTIZACION,
    codigo: row.CODIGO_COTIZACION,
    idCliente: row.ID_CLIENTE_FK ?? null,
    montoTotal: row.MONTO_TOTAL ?? null,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATED_AT ?? null,
    viaticos: row.viaticos ?? 0,
    estado: row.ESTADO,
    enviar: row.enviar,
    descuento: row.descuento ?? 0,
  };
  if (row.cotizacion_detalles) result.detalles = row.cotizacion_detalles.map(serializeDetalle);
  if (row.clientes) result.cliente = serializeCliente(row.clientes);
  if (row.historial_estado_cotizacion) {
    result.historialEstados = row.historial_estado_cotizacion.map(serializeHistorialEstado);
  }
  if (row.historial_cambios) {
    result.Historiacambios = row.historial_cambios.map(serializeHistorialCambio);
  }
  if (row.ordenes_trabajo) result.ordenes = row.ordenes_trabajo.map(serializeOrdenTrabajo);
  if (row.recepciones_equipo) result.recepciones = row.recepciones_equipo.map(serializeRecepcionEquipo);
  if (row.documentos) result.documentos = row.documentos.map(serializeDocumento);
  if (row._count) result._count = serializeCount(row._count);
  return result;
}

const detalleSchema = {
  type: 'object',
  required: ['equipoDescripcion', 'tipoServicio', 'magnitud', 'cantidad', 'valorUnitario'],
  properties: {
    equipoDescripcion: { type: 'string' },
    tipoServicio: { type: 'string' },
    magnitud: { type: 'string' },
    normaTecnica: { type: ['string', 'null'] },
    cantidad: { type: 'number' },
    valorUnitario: { type: 'number' },
  },
  additionalProperties: false,
} as const;

const estadosEnum = ['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'EN_SEGUIMIENTO'] as const;

const crearCotizacionSchema = {
  type: 'object',
  required: ['codigo', 'idCliente', 'detalles'],
  properties: {
    codigo: { type: 'string' },
    idCliente: { type: 'number' },
    viaticos: { type: 'number' },
    descuento: { type: 'number' },
    estado: { type: 'string', enum: estadosEnum },
    detalles: { type: 'array', items: detalleSchema },
  },
  additionalProperties: false,
} as const;

const actualizarCotizacionSchema = {
  type: 'object',
  required: ['idCotizacion'],
  properties: {
    idCotizacion: { type: 'number' },
    codigo: { type: 'string' },
    idCliente: { type: 'number' },
    estado: { type: 'string', enum: estadosEnum },
    viaticos: { type: 'number' },
    descuento: { type: 'number' },
    detalles: { type: 'array', items: detalleSchema },
  },
  additionalProperties: false,
} as const;

const cambiarEstadoSchema = {
  type: 'object',
  required: ['nuevoEstado'],
  properties: {
    nuevoEstado: { type: 'string', enum: estadosEnum },
  },
  additionalProperties: false,
} as const;

export default async function cotizacionesRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: CrearCotizacionBody }>(
    '/api/v1/cotizaciones',
    { preHandler: [fastify.authenticate], schema: { body: crearCotizacionSchema } },
    async (request) => {
      const idUsuario = Number((request.user as any)?.sub ?? 0);

      try {
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
          const montoTotal = subtotalConViaticos - (subtotalConViaticos * (descuentoPorcentaje / 100));

          const estado = request.body.estado || Estados.BORRADOR;

          const nuevaCotizacion = await tx.cotizaciones.create({
            data: {
              CODIGO_COTIZACION: request.body.codigo,
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

          return nuevaCotizacion;
        });

        return { ok: true, data: serializeCotizacion(resultado) };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error && error.message ? error.message : 'Error al crear la cotización';
        return { ok: false, error: message };
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/api/v1/cotizaciones/:id',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const idCotizacion = Number(request.params.id);

        const cotizacion = await fastify.prisma.cotizaciones.findUnique({
          where: { ID_COTIZACION: idCotizacion },
          include: {
            clientes: true,
            cotizacion_detalles: true,
            ordenes_trabajo: true,
            recepciones_equipo: true,
            documentos: true,
          },
        });

        if (!cotizacion) return { ok: false, error: 'Cotización no encontrada' };
        return { ok: true, data: serializeCotizacion(cotizacion) };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error && error.message ? error.message : 'Error al obtener la cotización';
        return { ok: false, error: message };
      }
    }
  );

  fastify.put<{ Params: { id: string }; Body: ActualizarCotizacionBody }>(
    '/api/v1/cotizaciones/:id',
    { preHandler: [fastify.authenticate], schema: { body: actualizarCotizacionSchema } },
    async (request) => {
      const idCotizacion = request.body.idCotizacion;
      const idUsuario = Number((request.user as any)?.sub ?? 0);

      try {
        const resultado = await fastify.prisma.$transaction(async (tx) => {
          const existente = await tx.cotizaciones.findUnique({
            where: { ID_COTIZACION: idCotizacion },
            include: { cotizacion_detalles: true },
          });
          if (!existente) throw new Error('Cotización no encontrada');

          let detallesMapeados:
            | {
                EQUIPO_DESCRIPCION: string;
                TIPO_SERVICIO: string;
                MAGNITUD: string;
                NORMA_TECNICA: string | null;
                CANTIDAD: number;
                VALOR_UNITARIO: number;
                VALOR_TOTAL: number;
              }[]
            | undefined;
          let subtotal = 0;
          if (request.body.detalles) {
            await tx.cotizacion_detalles.deleteMany({ where: { ID_COTIZACION_FK: idCotizacion } });
            detallesMapeados = request.body.detalles.map((d) => {
              const valorTotal = d.cantidad * d.valorUnitario;
              subtotal += valorTotal;
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
          } else {
            subtotal = existente.cotizacion_detalles.reduce(
              (acc, d) => acc + d.CANTIDAD * Number(d.VALOR_UNITARIO),
              0
            );
          }

          const viaticos =
            request.body.viaticos !== undefined
              ? request.body.viaticos
              : Number(existente.viaticos || 0);
          const descuento =
            request.body.descuento !== undefined
              ? request.body.descuento
              : Number(existente.descuento || 0);
          const subtotalConViaticos = subtotal + viaticos;
          const montoTotal = subtotalConViaticos - (subtotalConViaticos * (descuento / 100));

          if (request.body.estado && request.body.estado !== existente.ESTADO) {
            const permitidos = transicionesValidas[existente.ESTADO] || [];
            if (!permitidos.includes(request.body.estado)) {
              throw new Error(
                `Transición no permitida de ${existente.ESTADO} a ${request.body.estado}`
              );
            }
          }

          const cotizacionActualizada = await tx.cotizaciones.update({
            where: { ID_COTIZACION: idCotizacion },
            data: {
              ...(request.body.codigo && { CODIGO_COTIZACION: request.body.codigo }),
              ...(request.body.idCliente && { ID_CLIENTE_FK: request.body.idCliente }),
              ...(request.body.estado && { ESTADO: request.body.estado }),
              viaticos,
              descuento,
              MONTO_TOTAL: montoTotal,
              ...(detallesMapeados && { cotizacion_detalles: { create: detallesMapeados } }),
            },
            include: {
              clientes: true,
              cotizacion_detalles: true,
              historial_estado_cotizacion: true,
            },
          });

          if (request.body.estado && request.body.estado !== existente.ESTADO) {
            await tx.historial_estado_cotizacion.create({
              data: {
                ID_COTIZACION_FK: idCotizacion,
                ESTADO_ANTERIOR: existente.ESTADO,
                ESTADO_NUEVO: request.body.estado,
                ID_USUARIO_FK: idUsuario,
              },
            });
          }

          return cotizacionActualizada;
        });

        return { ok: true, data: serializeCotizacion(resultado) };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error && error.message ? error.message : 'Error al actualizar la cotización';
        return { ok: false, error: message };
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: CambiarEstadoBody }>(
    '/api/v1/cotizaciones/:id/estado',
    { preHandler: [fastify.authenticate], schema: { body: cambiarEstadoSchema } },
    async (request) => {
      const idCotizacion = Number(request.params.id);
      const nuevoEstado = request.body.nuevoEstado;
      const idUsuario = Number((request.user as any)?.sub ?? 0);

      try {
        const resultado = await fastify.prisma.$transaction(async (tx) => {
          const actual = await tx.cotizaciones.findUnique({
            where: { ID_COTIZACION: idCotizacion },
            select: { ESTADO: true },
          });
          if (!actual) throw new Error('Cotización no encontrada');

          const permitidos = transicionesValidas[actual.ESTADO] || [];
          if (!permitidos.includes(nuevoEstado)) {
            throw new Error(`Transición no permitida de ${actual.ESTADO} a ${nuevoEstado}`);
          }

          const cotizacion = await tx.cotizaciones.update({
            where: { ID_COTIZACION: idCotizacion },
            data: { ESTADO: nuevoEstado },
            include: {
              clientes: true,
              cotizacion_detalles: true,
              historial_estado_cotizacion: true,
            },
          });

          await tx.historial_estado_cotizacion.create({
            data: {
              ID_COTIZACION_FK: idCotizacion,
              ESTADO_ANTERIOR: actual.ESTADO,
              ESTADO_NUEVO: nuevoEstado,
              ID_USUARIO_FK: idUsuario,
            },
          });

          return cotizacion;
        });

        return { ok: true, data: serializeCotizacion(resultado) };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error && error.message ? error.message : 'Error al cambiar el estado';
        return { ok: false, error: message };
      }
    }
  );

  fastify.get<{ Querystring: ListCotizacionesQuery }>(
    '/api/v1/cotizaciones',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const page = Number(request.query.page) || 1;
        const limit = Number(request.query.limit) || 10;
        const skip = (page - 1) * limit;
        const estado = request.query.estado ? (request.query.estado as Estados) : undefined;
        const idCliente = request.query.idCliente ? Number(request.query.idCliente) : undefined;
        const busqueda = request.query.busqueda || undefined;

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
          ok: true,
          data: cotizaciones.map(serializeCotizacion),
          meta: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        request.log.error(error);
        const message =
          error instanceof Error && error.message ? error.message : 'Error al obtener la lista de cotizaciones';
        return { ok: false, error: message };
      }
    }
  );
}
