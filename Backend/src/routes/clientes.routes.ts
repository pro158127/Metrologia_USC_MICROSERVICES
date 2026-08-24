import { FastifyInstance } from 'fastify';
import { Estados, Prisma } from '@prisma/client';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';
import {
  actualizarClienteBodySchema,
  cambiarEstadoClienteBodySchema,
  clienteRawToDtoSchema,
  cotizacionTrazabilidadRawToDtoSchema,
  crearClienteBodySchema,
  crearDocumentoBodySchema,
  documentoRawToDtoSchema,
  idParamSchema,
  OrdenTrabajoTrazabilidadDto,
  ordenTrabajoTrazabilidadRawToDtoSchema,
  respuestaClienteSchema,
  respuestaDocumentoSchema,
  respuestaEliminarClienteSchema,
  respuestaListaClientesSchema,
  respuestaTrazabilidadSchema,
  respuestaUltimaCotizacionSchema,
} from './clientes.schemas.js';

export default async function clientesRoutes(fastify: FastifyInstance) {
  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/api/v1/clientes',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: { 200: respuestaListaClientesSchema },
      },
    },
    async () => {
      const clientes = await fastify.prisma.clientes.findMany({});

      return { ok: true as const, data: clientes.map((c) => clienteRawToDtoSchema.parse(c)) };
    }
  );

  app.post(
    '/api/v1/clientes',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearClienteBodySchema,
        response: { 200: respuestaClienteSchema },
      },
    },
    async (request) => {
      const body = request.body;

      const existeNit = await fastify.prisma.clientes.findUnique({
        where: { NIT: body.nitCedula },
      });
      if (existeNit) {
        throw new AppError(409, 'Ya existe un cliente registrado con este NIT/Cédula');
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

      return { ok: true as const, data: clienteRawToDtoSchema.parse(nuevo) };
    }
  );

  app.get(
    '/api/v1/clientes/:id/ultima-cotizacion',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaUltimaCotizacionSchema },
      },
    },
    async (request) => {
      const clienteId = request.params.id;

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

      return { ok: true as const, data: cotizacion?.CREATED_AT ?? null };
    }
  );

  app.put(
    '/api/v1/clientes/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: actualizarClienteBodySchema,
        response: { 200: respuestaClienteSchema },
      },
    },
    async (request) => {
      const idCliente = request.params.id;
      const body = request.body;

      const clienteActual = await fastify.prisma.clientes.findUnique({
        where: { ID_CLIENTE: idCliente },
      });
      if (!clienteActual) throw new AppError(404, 'Cliente no encontrado');

      if (body.nitCedula && body.nitCedula !== clienteActual.NIT) {
        const existeNit = await fastify.prisma.clientes.findUnique({
          where: { NIT: body.nitCedula },
        });
        if (existeNit) {
          throw new AppError(409, 'El NIT/Cédula ya está en uso por otro cliente');
        }
      }

      const data: Prisma.clientesUncheckedUpdateInput = { updatedAt: new Date() };
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

      return { ok: true as const, data: clienteRawToDtoSchema.parse(clienteActualizado) };
    }
  );

  app.patch(
    '/api/v1/clientes/:id/estado',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        body: cambiarEstadoClienteBodySchema,
        response: { 200: respuestaClienteSchema },
      },
    },
    async (request) => {
      const idCliente = request.params.id;

      const clienteActualizado = await fastify.prisma.clientes.update({
        where: { ID_CLIENTE: idCliente },
        data: {
          status: request.body.status,
          updatedAt: new Date(),
        },
      });

      return { ok: true as const, data: clienteRawToDtoSchema.parse(clienteActualizado) };
    }
  );

  app.delete(
    '/api/v1/clientes/:id',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaEliminarClienteSchema },
      },
    },
    async (request) => {
      await fastify.prisma.clientes.delete({
        where: { ID_CLIENTE: request.params.id },
      });

      return { ok: true as const, message: 'Cliente eliminado correctamente' };
    }
  );

  app.get(
    '/api/v1/clientes/:id/trazabilidad',
    {
      preHandler: [fastify.authenticate],
      schema: {
        params: idParamSchema,
        response: { 200: respuestaTrazabilidadSchema },
      },
    },
    async (request) => {
      const idCliente = request.params.id;

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

      if (!cliente) throw new AppError(404, 'Cliente no encontrado');

      const cotizacionIds = cliente.cotizaciones.map((c) => c.ID_COTIZACION);

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

      const ordenesPorCotizacion: Record<number, OrdenTrabajoTrazabilidadDto[]> = ordenes.reduce(
        (acc, orden) => {
          const idCot = orden.ID_COTIZACION_FK ?? 0;
          if (!acc[idCot]) acc[idCot] = [];
          acc[idCot].push(ordenTrabajoTrazabilidadRawToDtoSchema.parse(orden));
          return acc;
        },
        {} as Record<number, OrdenTrabajoTrazabilidadDto[]>
      );

      const cotizacionesConOrdenes = cliente.cotizaciones.map((cotizacion) => ({
        ...cotizacionTrazabilidadRawToDtoSchema.parse(cotizacion),
        ordenes: ordenesPorCotizacion[cotizacion.ID_COTIZACION] || [],
      }));

      return {
        ok: true as const,
        data: {
          ...clienteRawToDtoSchema.parse(cliente),
          rutDocumento: cliente.documentos ? documentoRawToDtoSchema.parse(cliente.documentos) : null,
          cotizaciones: cotizacionesConOrdenes,
        },
      };
    }
  );

  app.post(
    '/api/v1/documentos',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: crearDocumentoBodySchema,
        response: { 200: respuestaDocumentoSchema },
      },
    },
    async (request) => {
      const body = request.body;

      if (!body.nombre || !body.rutaUrl || !body.mimeType) {
        throw new AppError(400, 'Faltan campos obligatorios (nombre, rutaUrl o mimeType).');
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
        ok: true as const,
        data: documentoRawToDtoSchema.parse(nuevoDocumento),
        message: 'Documento registrado correctamente en la base de datos.',
      };
    }
  );
}
