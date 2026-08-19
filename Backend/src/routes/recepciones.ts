import { FastifyInstance } from 'fastify';
import { Decimal } from '@prisma/client/runtime/library';

function serializeData<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (value instanceof Decimal) {
        return value.toNumber();
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    })
  );
}

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

function serializeClienteResumen(row: Record<string, any>): Record<string, any> {
  return {
    idCliente: row.ID_CLIENTE,
    razonSocial: row.RAZON_SOCIAL,
    correo: row.CORREO,
  };
}

function serializeHistorialTarifa(row: Record<string, any>): Record<string, any> {
  return {
    idHistorial: row.ID_HISTORIAL,
    idTarifa: row.ID_TARIFA_FK,
    fechaInicio: row.FECHA_INICIO,
    fechaFin: row.FECHA_FIN ?? null,
    precioU: row.PRECIO_U,
  };
}

function serializeTarifa(row: Record<string, any>): Record<string, any> {
  return {
    idTarifa: row.ID_TARIFA,
    magnitud: row.MAGNITUD,
    tipoServicio: row.TIPO_SERVICIO,
    estado: row.ESTADO,
    Instrumento: row.Instrumento,
    Norma: row.Norma,
    historial: (row.historial_tarifas ?? []).map(serializeHistorialTarifa),
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

function serializeCotizacion(row: Record<string, any>): Record<string, any> {
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
    cliente: row.clientes ? serializeCliente(row.clientes) : null,
  };
}

function serializeCotizacionConDetalles(row: Record<string, any>): Record<string, any> {
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
    cliente: row.clientes ? serializeClienteResumen(row.clientes) : null,
    detalles: (row.cotizacion_detalles ?? []).map(serializeCotizacionDetalle),
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
    cliente: row.clientes ? serializeCliente(row.clientes) : null,
    cotizacion: row.cotizaciones ? serializeCotizacion(row.cotizaciones) : null,
  };
}

function serializeOrdenTrabajoResumen(row: Record<string, any>): Record<string, any> {
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
    cliente: row.clientes ? serializeClienteResumen(row.clientes) : null,
    cotizacion: row.cotizaciones
      ? { idCotizacion: row.cotizaciones.ID_COTIZACION, codigo: row.cotizaciones.CODIGO_COTIZACION }
      : null,
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
    documentos: (row.documentos ?? []).map(serializeDocumento),
    instrumentos: (row.recepcion_equipo_detalles ?? []).map(serializeRecepcionDetalle),
    cotizacion: row.cotizaciones ? serializeCotizacion(row.cotizaciones) : null,
    ordenTrabajo: row.ordenes_trabajo ? serializeOrdenTrabajo(row.ordenes_trabajo) : null,
  };
}

export default async function recepcionesRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/recepciones/enriquecidas',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const recepciones = await fastify.prisma.recepciones_equipo.findMany({
          include: {
            recepcion_equipo_detalles: true,
            cotizaciones: { include: { clientes: true } },
            ordenes_trabajo: { include: { clientes: true, cotizaciones: true } },
            documentos: true,
          },
          orderBy: { FECHA_RECEPCION: 'desc' },
        });

        const enriquecidas = recepciones.map((rec) => {
          let clienteNombre = 'Cliente no especificado';
          if (rec.cotizaciones?.clientes?.RAZON_SOCIAL) {
            clienteNombre = rec.cotizaciones.clientes.RAZON_SOCIAL;
          } else if (rec.ordenes_trabajo?.clientes?.RAZON_SOCIAL) {
            clienteNombre = rec.ordenes_trabajo.clientes.RAZON_SOCIAL;
          } else if (rec.ID_COTIZACION_FK && rec.cotizaciones?.clientes) {
            clienteNombre = rec.cotizaciones.clientes.RAZON_SOCIAL || 'Sin razón social';
          } else if (rec.ID_ORDEN_TRABAJO_FK && rec.ordenes_trabajo?.clientes) {
            clienteNombre = rec.ordenes_trabajo.clientes.RAZON_SOCIAL || 'Sin razón social';
          }

          const codigoCotizacion = rec.cotizaciones?.CODIGO_COTIZACION || '';
          const codigoOT = rec.ordenes_trabajo?.CODIGO_OT || '';

          return {
            idRecepcion: rec.ID_RECEPCION,
            codigo: rec.CODIGO_RECEPCION || `REC-${rec.ID_RECEPCION}`,
            clienteNombre,
            fecha: rec.FECHA_RECEPCION
              ? new Date(rec.FECHA_RECEPCION).toISOString().split('T')[0]
              : '',
            cantidadInstrumentos: rec.recepcion_equipo_detalles?.length || 0,
            codigoCotizacion,
            codigoOT,
            raw: serializeRecepcionEquipo(rec),
          };
        });

        return enriquecidas;
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'No se pudieron cargar las recepciones' });
      }
    }
  );

  fastify.get(
    '/api/v1/recepciones',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const [recepciones, clientes, cotizaciones, ordenes, tarifas] =
          await fastify.prisma.$transaction([
            fastify.prisma.recepciones_equipo.findMany({
              include: {
                recepcion_equipo_detalles: true,
                cotizaciones: { include: { clientes: true } },
                ordenes_trabajo: { include: { clientes: true, cotizaciones: true } },
                documentos: true,
              },
              orderBy: { FECHA_RECEPCION: 'desc' },
            }),
            fastify.prisma.clientes.findMany({ orderBy: { RAZON_SOCIAL: 'asc' } }),
            fastify.prisma.cotizaciones.findMany({
              include: {
                clientes: { select: { ID_CLIENTE: true, RAZON_SOCIAL: true, CORREO: true } },
                cotizacion_detalles: true,
              },
              orderBy: { CREATED_AT: 'desc' },
            }),
            fastify.prisma.ordenes_trabajo.findMany({
              include: {
                clientes: { select: { ID_CLIENTE: true, RAZON_SOCIAL: true, CORREO: true } },
                cotizaciones: { select: { ID_COTIZACION: true, CODIGO_COTIZACION: true } },
              },
              orderBy: { CREATED_AT: 'desc' },
            }),
            fastify.prisma.tarifas.findMany({
              include: { historial_tarifas: true },
              orderBy: { Instrumento: 'asc' },
            }),
          ]);

        return {
          recepciones: serializeData(recepciones.map(serializeRecepcionEquipo)),
          clientes: serializeData(clientes.map(serializeCliente)),
          cotizaciones: serializeData(cotizaciones.map(serializeCotizacionConDetalles)),
          ordenes: serializeData(ordenes.map(serializeOrdenTrabajoResumen)),
          tarifas: serializeData(tarifas.map(serializeTarifa)),
        };
      } catch (error) {
        request.log.error(error);
        return reply.code(500).send({ error: 'No se pudieron cargar los datos iniciales' });
      }
    }
  );
}
