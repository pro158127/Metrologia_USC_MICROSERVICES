import { z } from 'zod';

export const estadosEnum = z.enum(['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'EN_SEGUIMIENTO']);
export type EstadosZod = z.infer<typeof estadosEnum>;

export const clienteDtoSchema = z.object({
  idCliente: z.number(),
  nitCedula: z.string(),
  razonSocial: z.string(),
  correo: z.string(),
  nombreContacto: z.string().nullable(),
  telefono: z.string().nullable(),
  observacion: z.string().nullable(),
  idRutDocumento: z.number().nullable(),
  status: z.enum(['ACTIVO', 'INACTIVO']),
  createat: z.coerce.date(),
  dirrecion: z.string(),
  updatedAt: z.coerce.date(),
  ciudad: z.string().nullable(),
  tipoCliente: z.enum(['NATURAL', 'JURIDICO']),
});
export type ClienteDto = z.infer<typeof clienteDtoSchema>;

export const rolDtoSchema = z.object({
  idRol: z.number(),
  nombreRol: z.string(),
  permisos: z.unknown(),
  justificacion: z.string(),
  directrizDirector: z.boolean(),
});
export type RolDto = z.infer<typeof rolDtoSchema>;

export const usuarioDtoSchema = z.object({
  idUsuario: z.number(),
  nombreCompleto: z.string(),
  idRol: z.number(),
  correo: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  estado: z.boolean(),
  intentos: z.number(),
  elminado: z.boolean(),
  rol: rolDtoSchema.nullable(),
});
export type UsuarioDto = z.infer<typeof usuarioDtoSchema>;

export const historialTarifaDtoSchema = z.object({
  idHistorial: z.number(),
  idTarifa: z.number(),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date().nullable(),
  precioU: z.number(),
});
export type HistorialTarifaDto = z.infer<typeof historialTarifaDtoSchema>;

export const tarifaDtoSchema = z.object({
  idTarifa: z.number(),
  magnitud: z.string(),
  tipoServicio: z.string(),
  estado: z.string(),
  Instrumento: z.string(),
  Norma: z.string(),
  historial: z.array(historialTarifaDtoSchema),
});
export type TarifaDto = z.infer<typeof tarifaDtoSchema>;

export const versionDocumentoDtoSchema = z.object({
  idVersion: z.number(),
  idDocumento: z.number(),
  version: z.number(),
  rutaUrl: z.string(),
  createdAt: z.coerce.date(),
  usuario_fk: z.number(),
  content_json: z.unknown().nullable(),
});
export type VersionDocumentoDto = z.infer<typeof versionDocumentoDtoSchema>;

export const documentoDtoSchema = z.object({
  idDocumento: z.number(),
  nombre: z.string(),
  rutaUrl: z.string(),
  proveedor: z.enum(['LOCAL', 'AWS_S3', 'GOOGLE_DRIVE']),
  mimeType: z.string(),
  createdAt: z.coerce.date(),
  idCotizacion: z.number().nullable(),
  idOrdenTrabajo: z.number().nullable(),
  idRecepcion: z.number().nullable(),
  idPlantilla: z.number().nullable(),
  ordenPagoId: z.number().nullable(),
  versiones: z.array(versionDocumentoDtoSchema),
});
export type DocumentoDto = z.infer<typeof documentoDtoSchema>;

export const cotizacionDtoSchema = z.object({
  idCotizacion: z.number(),
  codigo: z.string(),
  idCliente: z.number().nullable(),
  montoTotal: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  viaticos: z.number(),
  estado: estadosEnum,
  enviar: z.boolean(),
  descuento: z.number(),
  cliente: clienteDtoSchema.nullable(),
});
export type CotizacionDto = z.infer<typeof cotizacionDtoSchema>;

export const ordenTrabajoDetalleDtoSchema = z.object({
  idDetalle: z.number(),
  idOrdenTrabajo: z.number(),
  item: z.number(),
  tipoServicio: z.string(),
  instrumento: z.string(),
  fabricante: z.string().nullable(),
  modelo: z.string().nullable(),
  serie: z.string().nullable(),
  codigoInventario: z.string().nullable(),
  ubicacion: z.string().nullable(),
  puntosCalibrar: z.array(z.string()),
  unidad: z.string().nullable(),
  intervaloRango: z.string().nullable(),
  resolucion: z.string().nullable(),
  asignado: z.number(),
  declaracionConformidad: z.boolean(),
  limiteControlEMC: z.string().nullable(),
  docEspecificacion: z.string().nullable(),
  reglaDecision: z.string().nullable(),
});
export type OrdenTrabajoDetalleDto = z.infer<typeof ordenTrabajoDetalleDtoSchema>;

export const ordenTrabajoDtoSchema = z.object({
  idOrdenTrabajo: z.number(),
  codigo: z.string(),
  idCotizacion: z.number().nullable(),
  idCliente: z.number().nullable(),
  correoCertificado: z.string().nullable(),
  correoFactura: z.string().nullable(),
  fechaLimiteFacturacion: z.coerce.date().nullable(),
  NIT: z.string(),
  dirrecion: z.string(),
  ciudad: z.string(),
  esInternoUSC: z.boolean(),
  esEnSitio: z.boolean(),
  esLabPermanente: z.boolean(),
  personaContacto: z.string().nullable(),
  telefonoContacto: z.string().nullable(),
  fechaCalibracion: z.coerce.date().nullable(),
  hora: z.coerce.date().nullable(),
  Razon_social: z.string(),
  dirrecion_solcitante: z.string(),
  personaContacto_solicitante: z.string().nullable(),
  ciudad_solcitante: z.string(),
  NIT_solicitante: z.string(),
  telefonoContacto_solcitante: z.string().nullable(),
  no_orden_trabajo: z.string(),
  no_cotizacion: z.string(),
  responsable: z.string().nullable(),
  fecha_dilgenciamento: z.coerce.date().nullable(),
  requireAnexo: z.boolean(),
  observaciones: z.string().nullable(),
  estado: z.string().nullable(),
  estadoRevision: z.string(),
  motivoRechazo: z.string().nullable(),
  createdAt: z.coerce.date().nullable(),
  estado_pago: z.string().nullable(),
  alertamessag: z.string(),
  cliente: clienteDtoSchema.nullable(),
  cotizacion: cotizacionDtoSchema.nullable(),
  instrumentos: z.array(ordenTrabajoDetalleDtoSchema),
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

export const clienteRawToDtoSchema = z
  .object({
    ID_CLIENTE: z.number(),
    NIT: z.string(),
    RAZON_SOCIAL: z.string(),
    CORREO: z.string(),
    NOMBRE_CONTACTO: z.string().nullish(),
    TELEFONO: z.string().nullish(),
    OBSERVACION: z.string().nullish(),
    ID_RUT_DOCUMENTO_FK: z.number().nullish(),
    status: z.enum(['ACTIVO', 'INACTIVO']),
    createat: z.coerce.date(),
    dirrecion: z.string(),
    updatedAt: z.coerce.date(),
    ciudad: z.string().nullish(),
    TIPO_CLIENTE: z.enum(['NATURAL', 'JURIDICO']),
  })
  .transform((raw): ClienteDto => ({
    idCliente: raw.ID_CLIENTE,
    nitCedula: raw.NIT,
    razonSocial: raw.RAZON_SOCIAL,
    correo: raw.CORREO,
    nombreContacto: raw.NOMBRE_CONTACTO ?? null,
    telefono: raw.TELEFONO ?? null,
    observacion: raw.OBSERVACION ?? null,
    idRutDocumento: raw.ID_RUT_DOCUMENTO_FK ?? null,
    status: raw.status,
    createat: raw.createat,
    dirrecion: raw.dirrecion,
    updatedAt: raw.updatedAt,
    ciudad: raw.ciudad ?? null,
    tipoCliente: raw.TIPO_CLIENTE,
  }));
export type ClienteRaw = z.input<typeof clienteRawToDtoSchema>;

export const rolRawToDtoSchema = z
  .object({
    ID_ROL_INCREMENT: z.number(),
    NOMBRE_ROL: z.string(),
    PERMISOS_JSON: z.unknown(),
    JUSTIFICACION: z.string(),
    DIRECTRIZ_DIRECTOR: z.boolean(),
  })
  .transform((raw): RolDto => ({
    idRol: raw.ID_ROL_INCREMENT,
    nombreRol: raw.NOMBRE_ROL,
    permisos: raw.PERMISOS_JSON,
    justificacion: raw.JUSTIFICACION,
    directrizDirector: raw.DIRECTRIZ_DIRECTOR,
  }));
export type RolRaw = z.input<typeof rolRawToDtoSchema>;

export const usuarioRawToDtoSchema = z
  .object({
    ID_USUARIO_AUTO_INCREMENT: z.number(),
    NOMBRE_COMPLETO: z.string(),
    ID_ROL_FK: z.number(),
    CORREO_INSTITUCION: z.string(),
    CREATED_AT: z.coerce.date(),
    UPDATE_AT: z.coerce.date().nullish(),
    ESTADO: z.boolean(),
    intentos: z.number(),
    elminado: z.boolean(),
    roles: rolRawToDtoSchema.nullish(),
  })
  .transform((raw): UsuarioDto => ({
    idUsuario: raw.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: raw.NOMBRE_COMPLETO,
    idRol: raw.ID_ROL_FK,
    correo: raw.CORREO_INSTITUCION,
    createdAt: raw.CREATED_AT,
    updatedAt: raw.UPDATE_AT ?? null,
    estado: raw.ESTADO,
    intentos: raw.intentos,
    elminado: raw.elminado,
    rol: raw.roles ?? null,
  }));
export type UsuarioRaw = z.input<typeof usuarioRawToDtoSchema>;

export const historialTarifaRawToDtoSchema = z
  .object({
    ID_HISTORIAL: z.number(),
    ID_TARIFA_FK: z.number(),
    FECHA_INICIO: z.coerce.date(),
    FECHA_FIN: z.coerce.date().nullish(),
    PRECIO_U: z.coerce.number(),
  })
  .transform((raw): HistorialTarifaDto => ({
    idHistorial: raw.ID_HISTORIAL,
    idTarifa: raw.ID_TARIFA_FK,
    fechaInicio: raw.FECHA_INICIO,
    fechaFin: raw.FECHA_FIN ?? null,
    precioU: raw.PRECIO_U,
  }));
export type HistorialTarifaRaw = z.input<typeof historialTarifaRawToDtoSchema>;

export const tarifaRawToDtoSchema = z
  .object({
    ID_TARIFA: z.number(),
    MAGNITUD: z.string(),
    TIPO_SERVICIO: z.string(),
    ESTADO: z.string(),
    Instrumento: z.string(),
    Norma: z.string(),
    historial_tarifas: z.array(historialTarifaRawToDtoSchema).nullish(),
  })
  .transform((raw): TarifaDto => ({
    idTarifa: raw.ID_TARIFA,
    magnitud: raw.MAGNITUD,
    tipoServicio: raw.TIPO_SERVICIO,
    estado: raw.ESTADO,
    Instrumento: raw.Instrumento,
    Norma: raw.Norma,
    historial: raw.historial_tarifas ?? [],
  }));
export type TarifaRaw = z.input<typeof tarifaRawToDtoSchema>;

export const versionDocumentoRawToDtoSchema = z
  .object({
    ID_VERSION: z.number(),
    ID_DOCUMENTO_FK: z.number(),
    VERSION: z.number(),
    RUTA_URL: z.string(),
    CREATED_AT: z.coerce.date(),
    usuario_fk: z.number(),
    content_json: z.unknown().nullish(),
  })
  .transform((raw): VersionDocumentoDto => ({
    idVersion: raw.ID_VERSION,
    idDocumento: raw.ID_DOCUMENTO_FK,
    version: raw.VERSION,
    rutaUrl: raw.RUTA_URL,
    createdAt: raw.CREATED_AT,
    usuario_fk: raw.usuario_fk,
    content_json: raw.content_json ?? null,
  }));
export type VersionDocumentoRaw = z.input<typeof versionDocumentoRawToDtoSchema>;

export const documentoRawToDtoSchema = z
  .object({
    ID_DOCUMENTO: z.number(),
    NOMBRE: z.string(),
    RUTA_URL: z.string(),
    PROVEEDOR: z.enum(['LOCAL', 'AWS_S3', 'GOOGLE_DRIVE']),
    MIME_TYPE: z.string(),
    CREATED_AT: z.coerce.date(),
    ID_COTIZACION_FK: z.number().nullish(),
    ID_ORDEN_TRABAJO_FK: z.number().nullish(),
    ID_RECEPCION_FK: z.number().nullish(),
    ID_PLANTILLA_FK: z.number().nullish(),
    ordenPagoId: z.number().nullish(),
    version_documentos: z.array(versionDocumentoRawToDtoSchema).nullish(),
  })
  .transform((raw): DocumentoDto => ({
    idDocumento: raw.ID_DOCUMENTO,
    nombre: raw.NOMBRE,
    rutaUrl: raw.RUTA_URL,
    proveedor: raw.PROVEEDOR,
    mimeType: raw.MIME_TYPE,
    createdAt: raw.CREATED_AT,
    idCotizacion: raw.ID_COTIZACION_FK ?? null,
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO_FK ?? null,
    idRecepcion: raw.ID_RECEPCION_FK ?? null,
    idPlantilla: raw.ID_PLANTILLA_FK ?? null,
    ordenPagoId: raw.ordenPagoId ?? null,
    versiones: raw.version_documentos ?? [],
  }));
export type DocumentoRaw = z.input<typeof documentoRawToDtoSchema>;

export const cotizacionRawToDtoSchema = z
  .object({
    ID_COTIZACION: z.number(),
    CODIGO_COTIZACION: z.string(),
    ID_CLIENTE_FK: z.number().nullish(),
    MONTO_TOTAL: z.coerce.number().nullish(),
    CREATED_AT: z.coerce.date(),
    UPDATED_AT: z.coerce.date().nullish(),
    viaticos: z.coerce.number().nullish(),
    ESTADO: estadosEnum,
    enviar: z.boolean(),
    descuento: z.coerce.number().nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
  })
  .transform((raw): CotizacionDto => ({
    idCotizacion: raw.ID_COTIZACION,
    codigo: raw.CODIGO_COTIZACION,
    idCliente: raw.ID_CLIENTE_FK ?? null,
    montoTotal: raw.MONTO_TOTAL ?? null,
    createdAt: raw.CREATED_AT,
    updatedAt: raw.UPDATED_AT ?? null,
    viaticos: raw.viaticos ?? 0,
    estado: raw.ESTADO,
    enviar: raw.enviar,
    descuento: raw.descuento ?? 0,
    cliente: raw.clientes ?? null,
  }));
export type CotizacionRaw = z.input<typeof cotizacionRawToDtoSchema>;

export const ordenTrabajoDetalleRawToDtoSchema = z
  .object({
    ID_DETALLE: z.number(),
    ID_ORDEN_TRABAJO_FK: z.number(),
    ITEM: z.number(),
    TIPO_SERVICIO: z.string(),
    INSTRUMENTO: z.string(),
    FABRICANTE: z.string().nullish(),
    MODELO: z.string().nullish(),
    SERIE: z.string().nullish(),
    CODIGO_INVENTARIO: z.string().nullish(),
    UBICACION: z.string().nullish(),
    PUNTOS_CALIBRAR: z.array(z.string()).nullish(),
    UNIDAD: z.string().nullish(),
    INTERVALO_RANGO: z.string().nullish(),
    RESOLUCION: z.string().nullish(),
    asignado: z.number(),
    DECLARACION_CONFORMIDAD: z.boolean().nullish(),
    LIMITE_CONTROL_EMC: z.string().nullish(),
    DOC_ESPECIFICACION: z.string().nullish(),
    REGLA_DECISION: z.string().nullish(),
  })
  .transform((raw): OrdenTrabajoDetalleDto => ({
    idDetalle: raw.ID_DETALLE,
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO_FK,
    item: raw.ITEM,
    tipoServicio: raw.TIPO_SERVICIO,
    instrumento: raw.INSTRUMENTO,
    fabricante: raw.FABRICANTE ?? null,
    modelo: raw.MODELO ?? null,
    serie: raw.SERIE ?? null,
    codigoInventario: raw.CODIGO_INVENTARIO ?? null,
    ubicacion: raw.UBICACION ?? null,
    puntosCalibrar: raw.PUNTOS_CALIBRAR ?? [],
    unidad: raw.UNIDAD ?? null,
    intervaloRango: raw.INTERVALO_RANGO ?? null,
    resolucion: raw.RESOLUCION ?? null,
    asignado: raw.asignado,
    declaracionConformidad: raw.DECLARACION_CONFORMIDAD ?? false,
    limiteControlEMC: raw.LIMITE_CONTROL_EMC ?? null,
    docEspecificacion: raw.DOC_ESPECIFICACION ?? null,
    reglaDecision: raw.REGLA_DECISION ?? null,
  }));
export type OrdenTrabajoDetalleRaw = z.input<typeof ordenTrabajoDetalleRawToDtoSchema>;

export const ordenTrabajoRawToDtoSchema = z
  .object({
    ID_ORDEN_TRABAJO: z.number(),
    CODIGO_OT: z.string(),
    ID_COTIZACION_FK: z.number().nullish(),
    ID_CLIENTE_FK: z.number().nullish(),
    CORREO_CERTIFICADO: z.string().nullish(),
    CORREO_FACTURA: z.string().nullish(),
    FECHA_LIMITE_FACTURACION: z.coerce.date().nullish(),
    NIT: z.string().nullish(),
    dirrecion: z.string().nullish(),
    ciudad: z.string().nullish(),
    ES_INTERNO_USC: z.boolean().nullish(),
    ES_EN_SITIO: z.boolean().nullish(),
    ES_LAB_PERMANENTE: z.boolean().nullish(),
    PERSONA_CONTACTO: z.string().nullish(),
    TELEFONO_CONTACTO: z.string().nullish(),
    FECHA_CALIBRACION: z.coerce.date().nullish(),
    hora: z.coerce.date().nullish(),
    Razon_social: z.string().nullish(),
    dirrecion_solcitante: z.string().nullish(),
    PERSONA_CONTACT_SOLCITANTE: z.string().nullish(),
    ciudad_solcitante: z.string().nullish(),
    NIT_solicitante: z.string().nullish(),
    TELEFONO_CONTACTO_SOLICITANTE: z.string().nullish(),
    no_orden_trabajo: z.string().nullish(),
    no_cotizacion: z.string().nullish(),
    RESPONSABLE: z.string().nullish(),
    FECHA_CALIBRACION_DILIGENCIAMENTO: z.coerce.date().nullish(),
    REQUIERE_ANEXO: z.boolean().nullish(),
    OBSERVACIONES: z.string().nullish(),
    estado: z.string().nullish(),
    ESTADO_REVISION: z.string().nullish(),
    MOTIVO_RECHAZO: z.string().nullish(),
    CREATED_AT: z.coerce.date().nullish(),
    estado_pago: z.string().nullish(),
    alertamessag: z.string().nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
    cotizaciones: cotizacionRawToDtoSchema.nullish(),
    orden_trabajo_detalles: z.array(ordenTrabajoDetalleRawToDtoSchema).nullish(),
  })
  .transform((raw): OrdenTrabajoDto => ({
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO,
    codigo: raw.CODIGO_OT,
    idCotizacion: raw.ID_COTIZACION_FK ?? null,
    idCliente: raw.ID_CLIENTE_FK ?? null,
    correoCertificado: raw.CORREO_CERTIFICADO ?? null,
    correoFactura: raw.CORREO_FACTURA ?? null,
    fechaLimiteFacturacion: raw.FECHA_LIMITE_FACTURACION ?? null,
    NIT: raw.NIT ?? 'sin nit',
    dirrecion: raw.dirrecion ?? 'sin dirreccion',
    ciudad: raw.ciudad ?? 'sin ciudad',
    esInternoUSC: raw.ES_INTERNO_USC ?? false,
    esEnSitio: raw.ES_EN_SITIO ?? false,
    esLabPermanente: raw.ES_LAB_PERMANENTE ?? true,
    personaContacto: raw.PERSONA_CONTACTO ?? null,
    telefonoContacto: raw.TELEFONO_CONTACTO ?? null,
    fechaCalibracion: raw.FECHA_CALIBRACION ?? null,
    hora: raw.hora ?? null,
    Razon_social: raw.Razon_social ?? 'sin razon_social',
    dirrecion_solcitante: raw.dirrecion_solcitante ?? 'sin dirreccion',
    personaContacto_solicitante: raw.PERSONA_CONTACT_SOLCITANTE ?? null,
    ciudad_solcitante: raw.ciudad_solcitante ?? 'sin ciudad',
    NIT_solicitante: raw.NIT_solicitante ?? 'sin nit',
    telefonoContacto_solcitante: raw.TELEFONO_CONTACTO_SOLICITANTE ?? null,
    no_orden_trabajo: raw.no_orden_trabajo ?? 'n/a',
    no_cotizacion: raw.no_cotizacion ?? 'n/a',
    responsable: raw.RESPONSABLE ?? null,
    fecha_dilgenciamento: raw.FECHA_CALIBRACION_DILIGENCIAMENTO ?? null,
    requireAnexo: raw.REQUIERE_ANEXO ?? false,
    observaciones: raw.OBSERVACIONES ?? null,
    estado: raw.estado ?? null,
    estadoRevision: raw.ESTADO_REVISION ?? 'PENDIENTE_REVISION',
    motivoRechazo: raw.MOTIVO_RECHAZO ?? null,
    createdAt: raw.CREATED_AT ?? null,
    estado_pago: raw.estado_pago ?? null,
    alertamessag: raw.alertamessag ?? 'sin novedades',
    cliente: raw.clientes ?? null,
    cotizacion: raw.cotizaciones ?? null,
    instrumentos: raw.orden_trabajo_detalles ?? [],
  }));
export type OrdenTrabajoRaw = z.input<typeof ordenTrabajoRawToDtoSchema>;

export const datosInicialesResponseSchema = z.object({
  ordenes: z.array(ordenTrabajoDtoSchema),
  clientes: z.array(clienteDtoSchema),
  usuarios: z.array(usuarioDtoSchema),
  roles: z.array(rolDtoSchema),
  tarifas: z.array(tarifaDtoSchema),
  version: z.array(documentoDtoSchema),
});
export type DatosInicialesResponse = z.infer<typeof datosInicialesResponseSchema>;
