import { FastifyInstance } from 'fastify';

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

function serializeRol(row: Record<string, any>): Record<string, any> {
  return {
    idRol: row.ID_ROL_INCREMENT,
    nombreRol: row.NOMBRE_ROL,
    permisos: row.PERMISOS_JSON,
    justificacion: row.JUSTIFICACION,
    directrizDirector: row.DIRECTRIZ_DIRECTOR,
  };
}

function serializeUsuario(row: Record<string, any>): Record<string, any> {
  return {
    idUsuario: row.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: row.NOMBRE_COMPLETO,
    idRol: row.ID_ROL_FK,
    correo: row.CORREO_INSTITUCION,
    createdAt: row.CREATED_AT,
    updatedAt: row.UPDATE_AT ?? null,
    estado: row.ESTADO,
    intentos: row.intentos,
    elminado: row.elminado,
    rol: row.roles ? serializeRol(row.roles) : null,
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

function serializeVersionDocumento(row: Record<string, any>): Record<string, any> {
  return {
    idVersion: row.ID_VERSION,
    idDocumento: row.ID_DOCUMENTO_FK,
    version: row.VERSION,
    rutaUrl: row.RUTA_URL,
    createdAt: row.CREATED_AT,
    usuario_fk: row.usuario_fk,
    content_json: row.content_json ?? null,
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
    instrumentos: (row.orden_trabajo_detalles ?? []).map(serializeOrdenTrabajoDetalle),
  };
}

export default async function ordenesRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/ordenes/datos-iniciales',
    { preHandler: [fastify.authenticate] },
    async (request) => {
      try {
        const [ordenes, clientes, usuarios, roles, tarifas, version] = await Promise.all([
          fastify.prisma.ordenes_trabajo.findMany({
            include: {
              clientes: true,
              cotizaciones: { include: { clientes: true } },
              orden_trabajo_detalles: true,
            },
            orderBy: { CREATED_AT: 'desc' },
          }),

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
          ordenes: ordenes.map(serializeOrdenTrabajo),
          clientes: clientes.map(serializeCliente),
          usuarios: usuarios.map(serializeUsuario),
          roles: roles.map(serializeRol),
          tarifas: tarifas.map(serializeTarifa),
          version: version.map(serializeDocumento),
        };
      } catch (error) {
        request.log.error(error);
        return {
          ordenes: [],
          clientes: [],
          usuarios: [],
          roles: [],
          tarifas: [],
          version: [],
        };
      }
    }
  );
}
