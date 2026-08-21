import { FastifyInstance } from 'fastify';
import { Estados } from '@prisma/client';

// Contrato camelCase que consume el frontend (mismo shape que el modelo Cliente del frontend).
interface ClienteDTO {
  idCliente: number;
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto: string | null;
  telefono: string | null;
  observacion: string | null;
  idRutDocumento: number | null;
  status: string;
  createat: string | Date;
  dirrecion: string;
  updatedAt: string | Date;
  ciudad: string | null;
  tipoCliente: string;
}

interface CrearClienteBody {
  nitCedula: string;
  razonSocial: string;
  correo: string;
  nombreContacto?: string | null;
  telefono?: string | null;
  observacion?: string | null;
  tipoCliente?: 'NATURAL' | 'JURIDICO';
  ciudad?: string | null;
  idRutDocumento?: number | null;
}

interface ActualizarClienteBody {
  nitCedula?: string;
  razonSocial?: string;
  correo?: string;
  nombreContacto?: string | null;
  telefono?: string | null;
  observacion?: string | null;
  tipoCliente?: 'NATURAL' | 'JURIDICO';
  dirrecion?: string;
  ciudad?: string | null;
  idRutDocumento?: number | null;
}

interface CambiarEstadoClienteBody {
  status: 'ACTIVO' | 'INACTIVO';
}

interface CrearDocumentoBody {
  nombre: string;
  rutaUrl: string;
  mimeType: string;
  proveedor?: 'LOCAL' | 'AWS_S3' | 'GOOGLE_DRIVE';
  idCotizacion?: number | null;
  idOrdenTrabajo?: number | null;
  idRecepcion?: number | null;
  idPlantilla?: number | null;
  idClienteRut?: number | null;
}

// Mapea la fila cruda (nombres de columna reales de la DB) al contrato camelCase del frontend.
function serializeCliente(row: Record<string, any>): ClienteDTO {
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

function serializeUsuario(row: Record<string, any>): Record<string, any> {
  return {
    idUsuario: row.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: row.NOMBRE_COMPLETO,
    correo: row.CORREO_INSTITUCION,
  };
}

function serializeVersionDocumento(row: Record<string, any>): Record<string, any> {
  return {
    idVersion: row.ID_VERSION,
    idDocumento: row.ID_DOCUMENTO_FK,
    version: row.VERSION,
    rutaUrl: row.RUTA_URL,
    createdAt: row.CREATED_AT,
    usuario_fk: row.usuario_fk,
    content_json: row.content_json ?? null,
    usuario: row.usuarios ? serializeUsuario(row.usuarios) : null,
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
    versiones: (row.version_documentos ?? []).map(serializeVersionDocumento),
  };
}

function serializeCotizacionDetalle(row: Record<string, any>): Record<string, any> {
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

function serializeCertificado(row: Record<string, any>): Record<string, any> {
  return {
    idCertificado: row.ID_CERTIFICADO,
    codigo: row.CODIGO_CERTIFICADO,
    idCalibracion: row.ID_CALIBRACION_FK,
    idDocumento: row.ID_DOCUMENTO_FK,
    documento: row.documentos ? serializeDocumento(row.documentos) : null,
  };
}

function serializeCalibracion(row: Record<string, any>): Record<string, any> {
  return {
    idCalibracion: row.ID_CALIBRACION,
    idInstrumento: row.ID_INSTRUMENTO_FK,
    idTecnico: row.ID_TECNICO_FK,
    datosTecnicos: row.DATOS_TECNICOS_JSON,
    observaciones: row.OBSERVACIONES ?? null,
    createdAt: row.CREATED_AT,
    certificado: row.certificados ? serializeCertificado(row.certificados) : null,
  };
}

function serializeRecepcionDetalle(row: Record<string, any>): Record<string, any> {
  return {
    idInstrumento: row.ID_INSTRUMENTO,
    idRecepcion: row.ID_RECEPCION_FK,
    instrumento: row.INSTRUMENTO,
    marca: row.MARCA ?? null,
    modelo: row.MODELO ?? null,
    serie: row.SERIE ?? null,
    codigoInventario: row.CODIGO_INVENTARIO ?? null,
    resolucion: row.RESOLUCION ?? null,
    tipoSensorTemp: row.TIPO_SENSOR_TEMP ?? null,
    estadoIBC: row.ESTADO_IBC ?? null,
    estampilla: row.ESTAMPILLA ?? null,
    observaciones: row.OBSERVACIONES ?? null,
    calibracion: row.calibraciones ? serializeCalibracion(row.calibraciones) : null,
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
    instrumentos: (row.recepcion_equipo_detalles ?? []).map(serializeRecepcionDetalle),
    documentos: (row.documentos ?? []).map(serializeDocumento),
  };
}

function serializeOrdenTrabajoDetalle(row: Record<string, any>): Record<string, any> {
  return {
    idDetalle: row.ID_DETALLE,
    idOrdenTrabajo: row.ID_ORDEN_TRABAJO_FK,
    item: row.ITEM,
    tipoServicio: row.TIPO_SERVICIO,
    instrumento: row.INSTRUMENTO,
    fabricante: row.FABRICANTE ?? null,
    modelo: row.MODELO ?? null,
    serie: row.SERIE ?? null,
    codigoInventario: row.CODIGO_INVENTARIO ?? null,
    ubicacion: row.UBICACION ?? null,
    puntosCalibrar: row.PUNTOS_CALIBRAR ?? [],
    unidad: row.UNIDAD ?? null,
    intervaloRango: row.INTERVALO_RANGO ?? null,
    resolucion: row.RESOLUCION ?? null,
    asignado: row.asignado,
    declaracionConformidad: row.DECLARACION_CONFORMIDAD ?? false,
    limiteControlEMC: row.LIMITE_CONTROL_EMC ?? null,
    docEspecificacion: row.DOC_ESPECIFICACION ?? null,
    reglaDecision: row.REGLA_DECISION ?? null,
  };
}

function serializeOrdenTrabajoTrazabilidad(row: Record<string, any>): Record<string, any> {
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
    instrumentos: (row.orden_trabajo_detalles ?? []).map(serializeOrdenTrabajoDetalle),
    documentos: (row.documentos ?? []).map(serializeDocumento),
  };
}

function serializeCotizacionTrazabilidad(row: Record<string, any>): Record<string, any> {
  return {
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
    detalles: (row.cotizacion_detalles ?? []).map(serializeCotizacionDetalle),
    documentos: (row.documentos ?? []).map(serializeDocumento),
    recepciones: (row.recepciones_equipo ?? []).map(serializeRecepcionEquipo),
  };
}

const crearClienteSchema = {
  type: 'object',
  required: ['nitCedula', 'razonSocial', 'correo'],
  properties: {
    nitCedula: { type: 'string' },
    razonSocial: { type: 'string' },
    correo: { type: 'string' },
    nombreContacto: { type: ['string', 'null'] },
    telefono: { type: ['string', 'null'] },
    observacion: { type: ['string', 'null'] },
    tipoCliente: { type: 'string', enum: ['NATURAL', 'JURIDICO'] },
    ciudad: { type: ['string', 'null'] },
    idRutDocumento: { type: ['integer', 'null'] },
  },
  additionalProperties: false,
} as const;

const actualizarClienteSchema = {
  type: 'object',
  properties: {
    nitCedula: { type: 'string' },
    razonSocial: { type: 'string' },
    correo: { type: 'string' },
    nombreContacto: { type: ['string', 'null'] },
    telefono: { type: ['string', 'null'] },
    observacion: { type: ['string', 'null'] },
    tipoCliente: { type: 'string', enum: ['NATURAL', 'JURIDICO'] },
    dirrecion: { type: 'string' },
    ciudad: { type: ['string', 'null'] },
    idRutDocumento: { type: ['integer', 'null'] },
  },
  additionalProperties: false,
} as const;

const cambiarEstadoClienteSchema = {
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ACTIVO', 'INACTIVO'] },
  },
  additionalProperties: false,
} as const;

const crearDocumentoSchema = {
  type: 'object',
  required: ['nombre', 'rutaUrl', 'mimeType'],
  properties: {
    nombre: { type: 'string' },
    rutaUrl: { type: 'string' },
    mimeType: { type: 'string' },
    proveedor: { type: 'string', enum: ['LOCAL', 'AWS_S3', 'GOOGLE_DRIVE'] },
    idCotizacion: { type: ['integer', 'null'] },
    idOrdenTrabajo: { type: ['integer', 'null'] },
    idRecepcion: { type: ['integer', 'null'] },
    idPlantilla: { type: ['integer', 'null'] },
    idClienteRut: { type: ['integer', 'null'] },
  },
  additionalProperties: false,
} as const;

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/clientes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const clientes = await fastify.prisma.clientes.findMany({
      
        });

        return { success: true, data: clientes.map(serializeCliente) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor' });
      }
    }
  );

  fastify.post<{ Body: CrearClienteBody }>(
    '/api/v1/clientes',
    { preHandler: [fastify.authenticate], schema: { body: crearClienteSchema } },
    async (request, reply) => {
      try {
        const body = request.body;

        const existeNit = await fastify.prisma.clientes.findUnique({
          where: { NIT: body.nitCedula },
        });
        if (existeNit) {
          return reply
            .code(409)
            .send({ success: false, error: 'Ya existe un cliente registrado con este NIT/Cédula' });
        }

        const nuevo = await fastify.prisma.clientes.create({
          data: {
            NIT: body.nitCedula,
            RAZON_SOCIAL: body.razonSocial,
            CORREO: body.correo,
            NOMBRE_CONTACTO: body.nombreContacto ?? null,
            TELEFONO: body.telefono ?? null,
            OBSERVACION: body.observacion ?? null,
            TIPO_CLIENTE: body.tipoCliente ?? 'NATURAL',
            ciudad: body.ciudad ?? 'Cali',
            ID_RUT_DOCUMENTO_FK: body.idRutDocumento ?? null,
          },
        });

        return { success: true, data: serializeCliente(nuevo) };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno al crear el cliente' });
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/api/v1/clientes/:id/ultima-cotizacion',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const clienteId = Number(request.params.id);

        const cotizacion = await fastify.prisma.cotizaciones.findFirst({
          where: {
            ID_CLIENTE_FK: clienteId,
            ESTADO: {
              in: [
                Estados.ENVIADA,
                Estados.APROBADA,
                Estados.RECHAZADA,
                Estados.BORRADOR,
                Estados.EN_SEGUIMIENTO,
              ],
            },
          },
          orderBy: { CREATED_AT: 'desc' },
          select: { CREATED_AT: true },
        });

        return { success: true, data: cotizacion?.CREATED_AT ?? null };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ success: false, error: 'Error interno del servidor' });
      }
    }
  );

  fastify.put<{ Params: { id: string }; Body: ActualizarClienteBody }>(
    '/api/v1/clientes/:id',
    { preHandler: [fastify.authenticate], schema: { body: actualizarClienteSchema } },
    async (request, reply) => {
      try {
        const idCliente = Number(request.params.id);
        const body = request.body;

        const clienteActual = await fastify.prisma.clientes.findUnique({
          where: { ID_CLIENTE: idCliente },
        });
        if (!clienteActual) {
          return reply.code(404).send({ success: false, error: 'Cliente no encontrado' });
        }

        if (body.nitCedula && body.nitCedula !== clienteActual.NIT) {
          const existeNit = await fastify.prisma.clientes.findUnique({
            where: { NIT: body.nitCedula },
          });
          if (existeNit) {
            return reply
              .code(409)
              .send({ success: false, error: 'El NIT/Cédula ya está en uso por otro cliente' });
          }
        }

        const data: Record<string, any> = { updatedAt: new Date() };
        if (body.nitCedula !== undefined) data.NIT = body.nitCedula;
        if (body.razonSocial !== undefined) data.RAZON_SOCIAL = body.razonSocial;
        if (body.correo !== undefined) data.CORREO = body.correo;
        if (body.nombreContacto !== undefined) data.NOMBRE_CONTACTO = body.nombreContacto;
        if (body.telefono !== undefined) data.TELEFONO = body.telefono;
        if (body.observacion !== undefined) data.OBSERVACION = body.observacion;
        if (body.tipoCliente !== undefined) data.TIPO_CLIENTE = body.tipoCliente;
        if (body.dirrecion !== undefined) data.dirrecion = body.dirrecion;
        if (body.ciudad !== undefined) data.ciudad = body.ciudad;
        if (body.idRutDocumento !== undefined) data.ID_RUT_DOCUMENTO_FK = body.idRutDocumento;

        const clienteActualizado = await fastify.prisma.clientes.update({
          where: { ID_CLIENTE: idCliente },
          data,
        });

        return { success: true, data: serializeCliente(clienteActualizado) };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ success: false, error: 'Error interno al actualizar el cliente' });
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: CambiarEstadoClienteBody }>(
    '/api/v1/clientes/:id/estado',
    { preHandler: [fastify.authenticate], schema: { body: cambiarEstadoClienteSchema } },
    async (request, reply) => {
      try {
        const idCliente = Number(request.params.id);

        const clienteActualizado = await fastify.prisma.clientes.update({
          where: { ID_CLIENTE: idCliente },
          data: {
            status: request.body.status,
            updatedAt: new Date(),
          },
        });

        return { success: true, data: serializeCliente(clienteActualizado) };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ success: false, error: 'Error interno al cambiar el estado del cliente' });
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/clientes/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idCliente = Number(request.params.id);

        await fastify.prisma.clientes.delete({
          where: { ID_CLIENTE: idCliente },
        });

        return { success: true, message: 'Cliente eliminado correctamente' };
      } catch (error: any) {
        request.log.error(error);
        if (error?.code === 'P2003') {
          return reply
            .code(409)
            .send({ success: false, error: 'No se puede eliminar el cliente porque tiene registros asociados' });
        }
        if (error?.code === 'P2025') {
          return reply.code(404).send({ success: false, error: 'Cliente no encontrado' });
        }
        return reply
          .code(500)
          .send({ success: false, error: 'No se puede eliminar el cliente porque tiene registros asociados' });
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    '/api/v1/clientes/:id/trazabilidad',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const idCliente = Number(request.params.id);

        const cliente = await fastify.prisma.clientes.findUnique({
          where: { ID_CLIENTE: idCliente },
          include: {
            documentos: {
              include: {
                version_documentos: {
                  include: {
                    usuarios: {
                      select: {
                        ID_USUARIO_AUTO_INCREMENT: true,
                        NOMBRE_COMPLETO: true,
                        CORREO_INSTITUCION: true,
                      },
                    },
                  },
                  orderBy: { VERSION: 'desc' },
                },
              },
            },
            cotizaciones: {
              orderBy: { CREATED_AT: 'desc' },
              include: {
                cotizacion_detalles: true,
                documentos: {
                  include: {
                    version_documentos: {
                      include: {
                        usuarios: {
                          select: {
                            ID_USUARIO_AUTO_INCREMENT: true,
                            NOMBRE_COMPLETO: true,
                            CORREO_INSTITUCION: true,
                          },
                        },
                      },
                      orderBy: { VERSION: 'desc' },
                    },
                  },
                },
                recepciones_equipo: {
                  orderBy: { CREATED_AT: 'desc' },
                  include: {
                    recepcion_equipo_detalles: {
                      include: {
                        calibraciones: {
                          include: {
                            certificados: {
                              include: {
                                documentos: {
                                  include: {
                                    version_documentos: {
                                      include: {
                                        usuarios: {
                                          select: {
                                            ID_USUARIO_AUTO_INCREMENT: true,
                                            NOMBRE_COMPLETO: true,
                                            CORREO_INSTITUCION: true,
                                          },
                                        },
                                      },
                                      orderBy: { VERSION: 'desc' },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    documentos: {
                      include: {
                        version_documentos: {
                          include: {
                            usuarios: {
                              select: {
                                ID_USUARIO_AUTO_INCREMENT: true,
                                NOMBRE_COMPLETO: true,
                                CORREO_INSTITUCION: true,
                              },
                            },
                          },
                          orderBy: { VERSION: 'desc' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!cliente) {
          return reply.code(404).send({ success: false, error: 'Cliente no encontrado' });
        }

        const cotizacionIds = cliente.cotizaciones.map((c) => c.ID_COTIZACION);

        let ordenesPorCotizacion: Record<number, any[]> = {};
        try {
          const ordenes = await fastify.prisma.ordenes_trabajo.findMany({
            where: { ID_COTIZACION_FK: { in: cotizacionIds } },
            orderBy: { CREATED_AT: 'desc' },
            include: {
              orden_trabajo_detalles: true,
              documentos: {
                include: {
                  version_documentos: {
                    include: {
                      usuarios: {
                        select: {
                          ID_USUARIO_AUTO_INCREMENT: true,
                          NOMBRE_COMPLETO: true,
                          CORREO_INSTITUCION: true,
                        },
                      },
                    },
                    orderBy: { VERSION: 'desc' },
                  },
                },
              },
            },
          });

          ordenesPorCotizacion = ordenes.reduce((acc, orden) => {
            const idCot = orden.ID_COTIZACION_FK ?? 0;
            if (!acc[idCot]) acc[idCot] = [];
            acc[idCot].push(serializeOrdenTrabajoTrazabilidad(orden));
            return acc;
          }, {} as Record<number, any[]>);
        } catch (ordenesError) {
          request.log.error(ordenesError);
        }

        const cotizacionesConOrdenes = cliente.cotizaciones.map((cotizacion) => ({
          ...serializeCotizacionTrazabilidad(cotizacion),
          ordenes: ordenesPorCotizacion[cotizacion.ID_COTIZACION] || [],
        }));

        return {
          success: true,
          data: {
            ...serializeCliente(cliente),
            rutDocumento: cliente.documentos ? serializeDocumento(cliente.documentos) : null,
            cotizaciones: cotizacionesConOrdenes,
          },
        };
      } catch (error) {
        request.log.error(error);
        return reply
          .code(500)
          .send({ success: false, error: 'Error interno del servidor al consultar la trazabilidad' });
      }
    }
  );

  fastify.post<{ Body: CrearDocumentoBody }>(
    '/api/v1/documentos',
    { preHandler: [fastify.authenticate], schema: { body: crearDocumentoSchema } },
    async (request, reply) => {
      try {
        const body = request.body;

        if (!body.nombre || !body.rutaUrl || !body.mimeType) {
          return reply
            .code(400)
            .send({ success: false, error: 'Faltan campos obligatorios (nombre, rutaUrl o mimeType).' });
        }

        const nuevoDocumento = await fastify.prisma.$transaction(async (tx) => {
          const doc = await tx.documentos.create({
            data: {
              NOMBRE: body.nombre,
              RUTA_URL: body.rutaUrl,
              MIME_TYPE: body.mimeType,
              PROVEEDOR: body.proveedor ?? 'LOCAL',
              ID_COTIZACION_FK: body.idCotizacion ?? null,
              ID_ORDEN_TRABAJO_FK: body.idOrdenTrabajo ?? null,
              ID_RECEPCION_FK: body.idRecepcion ?? null,
              ID_PLANTILLA_FK: body.idPlantilla ?? null,
            },
          });

          if (body.idClienteRut) {
            await tx.clientes.update({
              where: { ID_CLIENTE: body.idClienteRut },
              data: { ID_RUT_DOCUMENTO_FK: doc.ID_DOCUMENTO },
            });
          }

          return doc;
        });

        return {
          success: true,
          data: serializeDocumento(nuevoDocumento),
          message: 'Documento registrado correctamente en la base de datos.',
        };
      } catch (error: any) {
        request.log.error(error);
        if (error?.code === 'P2025') {
          return reply
            .code(404)
            .send({ success: false, error: 'La entidad relacionada (Cliente/Cotización/etc.) no existe.' });
        }
        return reply
          .code(500)
          .send({ success: false, error: 'Error interno del servidor al crear el documento.' });
      }
    }
  );
}
