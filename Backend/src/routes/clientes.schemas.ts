import { z } from 'zod';

// ============================================================
// ENUMS
// ============================================================
export const tipoClienteEnum = z.enum(['NATURAL', 'JURIDICO']);
export type TipoClienteZod = z.infer<typeof tipoClienteEnum>;

export const statusClienteEnum = z.enum(['ACTIVO', 'INACTIVO']);
export type StatusClienteZod = z.infer<typeof statusClienteEnum>;

export const proveedorEnum = z.enum(['LOCAL', 'AWS_S3', 'GOOGLE_DRIVE']);
export type ProveedorZod = z.infer<typeof proveedorEnum>;

export const estadosEnum = z.enum(['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'EN_SEGUIMIENTO']);
export type EstadosZod = z.infer<typeof estadosEnum>;

// ============================================================
// INPUTS (body / params)
// ============================================================
export const crearClienteBodySchema = z.object({
  nitCedula: z.string(),
  razonSocial: z.string(),
  correo: z.string(),
  nombreContacto: z.string().nullish(),
  telefono: z.string().nullish(),
  observacion: z.string().nullish(),
  tipoCliente: tipoClienteEnum.optional(),
  ciudad: z.string().nullish(),
  idRutDocumento: z.number().nullish(),
});
export type CrearClienteBody = z.infer<typeof crearClienteBodySchema>;

export const actualizarClienteBodySchema = z.object({
  nitCedula: z.string().optional(),
  razonSocial: z.string().optional(),
  correo: z.string().optional(),
  nombreContacto: z.string().nullish(),
  telefono: z.string().nullish(),
  observacion: z.string().nullish(),
  tipoCliente: tipoClienteEnum.optional(),
  dirrecion: z.string().optional(),
  ciudad: z.string().nullish(),
  idRutDocumento: z.number().nullish(),
});
export type ActualizarClienteBody = z.infer<typeof actualizarClienteBodySchema>;

export const cambiarEstadoClienteBodySchema = z.object({
  status: statusClienteEnum,
});
export type CambiarEstadoClienteBody = z.infer<typeof cambiarEstadoClienteBodySchema>;

export const crearDocumentoBodySchema = z.object({
  nombre: z.string(),
  rutaUrl: z.string(),
  mimeType: z.string(),
  proveedor: proveedorEnum.optional(),
  idCotizacion: z.number().nullish(),
  idOrdenTrabajo: z.number().nullish(),
  idRecepcion: z.number().nullish(),
  idPlantilla: z.number().nullish(),
  idClienteRut: z.number().nullish(),
});
export type CrearDocumentoBody = z.infer<typeof crearDocumentoBodySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

// ============================================================
// OUTPUT CONTRACTS (camelCase que consume el frontend)
// ============================================================
export const clienteDtoSchema = z.object({
  idCliente: z.number(),
  nitCedula: z.string(),
  razonSocial: z.string(),
  correo: z.string(),
  nombreContacto: z.string().nullable(),
  telefono: z.string().nullable(),
  observacion: z.string().nullable(),
  idRutDocumento: z.number().nullable(),
  status: statusClienteEnum,
  createat: z.coerce.date(),
  dirrecion: z.string(),
  updatedAt: z.coerce.date(),
  ciudad: z.string().nullable(),
  tipoCliente: tipoClienteEnum,
});
export type ClienteDto = z.infer<typeof clienteDtoSchema>;

export const usuarioDtoSchema = z.object({
  idUsuario: z.number(),
  nombreCompleto: z.string(),
  correo: z.string(),
});
export type UsuarioDto = z.infer<typeof usuarioDtoSchema>;

export const versionDocumentoDtoSchema = z.object({
  idVersion: z.number(),
  idDocumento: z.number(),
  version: z.number(),
  rutaUrl: z.string(),
  createdAt: z.coerce.date(),
  usuario_fk: z.number(),
  content_json: z.unknown(),
  usuario: usuarioDtoSchema.nullable(),
});
export type VersionDocumentoDto = z.infer<typeof versionDocumentoDtoSchema>;

export const documentoDtoSchema = z.object({
  idDocumento: z.number(),
  nombre: z.string(),
  rutaUrl: z.string(),
  proveedor: proveedorEnum,
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

export const cotizacionDetalleDtoSchema = z.object({
  idDetalle: z.number(),
  idCotizacion: z.number(),
  equipoDescripcion: z.string(),
  tipoServicio: z.string(),
  magnitud: z.string(),
  normaTecnica: z.string().nullable(),
  cantidad: z.number(),
  valorUnitario: z.number(),
  valorTotal: z.number(),
  sitio: z.string().nullable(),
});
export type CotizacionDetalleDto = z.infer<typeof cotizacionDetalleDtoSchema>;

export const certificadoDtoSchema = z.object({
  idCertificado: z.number(),
  codigo: z.string(),
  idCalibracion: z.number(),
  idDocumento: z.number(),
  documento: documentoDtoSchema.nullable(),
});
export type CertificadoDto = z.infer<typeof certificadoDtoSchema>;

export const calibracionDtoSchema = z.object({
  idCalibracion: z.number(),
  idInstrumento: z.number(),
  idTecnico: z.number(),
  datosTecnicos: z.unknown(),
  observaciones: z.string().nullable(),
  createdAt: z.coerce.date(),
  certificado: certificadoDtoSchema.nullable(),
});
export type CalibracionDto = z.infer<typeof calibracionDtoSchema>;

export const recepcionDetalleDtoSchema = z.object({
  idInstrumento: z.number(),
  idRecepcion: z.number(),
  instrumento: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  serie: z.string().nullable(),
  codigoInventario: z.string().nullable(),
  resolucion: z.string().nullable(),
  tipoSensorTemp: z.string().nullable(),
  estadoIBC: z.unknown(),
  estampilla: z.string().nullable(),
  observaciones: z.string().nullable(),
  calibracion: calibracionDtoSchema.nullable(),
});
export type RecepcionDetalleDto = z.infer<typeof recepcionDetalleDtoSchema>;

export const recepcionEquipoDtoSchema = z.object({
  idRecepcion: z.number(),
  codigo: z.string(),
  idCotizacion: z.number().nullable(),
  idOrdenTrabajo: z.number().nullable(),
  solicitante: z.string(),
  nombreEntrega: z.string().nullable(),
  sitioCalibracion: z.string(),
  fechaRecepcion: z.coerce.date(),
  fechaSalida: z.coerce.date().nullable(),
  nombreRecibe: z.string().nullable(),
  nombreEmpaca: z.string().nullable(),
  nombreCalibra: z.string().nullable(),
  nombreRecibeServicio: z.string().nullable(),
  accesorios: z.string().nullable(),
  pruebasCompletas: z.boolean(),
  observacionesPruebas: z.string().nullable(),
  estado: z.string(),
  createdAt: z.coerce.date(),
  instrumentos: z.array(recepcionDetalleDtoSchema),
  documentos: z.array(documentoDtoSchema),
});
export type RecepcionEquipoDto = z.infer<typeof recepcionEquipoDtoSchema>;

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

export const ordenTrabajoTrazabilidadDtoSchema = z.object({
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
  instrumentos: z.array(ordenTrabajoDetalleDtoSchema),
  documentos: z.array(documentoDtoSchema),
});
export type OrdenTrabajoTrazabilidadDto = z.infer<typeof ordenTrabajoTrazabilidadDtoSchema>;

export const cotizacionTrazabilidadDtoSchema = z.object({
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
  detalles: z.array(cotizacionDetalleDtoSchema),
  documentos: z.array(documentoDtoSchema),
  recepciones: z.array(recepcionEquipoDtoSchema),
});
export type CotizacionTrazabilidadDto = z.infer<typeof cotizacionTrazabilidadDtoSchema>;

export const cotizacionConOrdenesDtoSchema = cotizacionTrazabilidadDtoSchema.extend({
  ordenes: z.array(ordenTrabajoTrazabilidadDtoSchema),
});
export type CotizacionConOrdenesDto = z.infer<typeof cotizacionConOrdenesDtoSchema>;

export const clienteTrazabilidadDtoSchema = clienteDtoSchema.extend({
  rutDocumento: documentoDtoSchema.nullable(),
  cotizaciones: z.array(cotizacionConOrdenesDtoSchema),
});
export type ClienteTrazabilidadDto = z.infer<typeof clienteTrazabilidadDtoSchema>;

// ============================================================
// TRANSFORMS (RAW DB -> DTO camelCase) — reemplazan a serialize*
// ============================================================
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
    status: statusClienteEnum,
    createat: z.coerce.date(),
    dirrecion: z.string(),
    updatedAt: z.coerce.date(),
    ciudad: z.string().nullish(),
    TIPO_CLIENTE: tipoClienteEnum,
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

export const usuarioRawToDtoSchema = z
  .object({
    ID_USUARIO_AUTO_INCREMENT: z.number(),
    NOMBRE_COMPLETO: z.string(),
    CORREO_INSTITUCION: z.string(),
  })
  .transform((raw): UsuarioDto => ({
    idUsuario: raw.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: raw.NOMBRE_COMPLETO,
    correo: raw.CORREO_INSTITUCION,
  }));
export type UsuarioRaw = z.input<typeof usuarioRawToDtoSchema>;

export const versionDocumentoRawToDtoSchema = z
  .object({
    ID_VERSION: z.number(),
    ID_DOCUMENTO_FK: z.number(),
    VERSION: z.number(),
    RUTA_URL: z.string(),
    CREATED_AT: z.coerce.date(),
    usuario_fk: z.number(),
    content_json: z.unknown().nullish(),
    usuarios: usuarioRawToDtoSchema.nullish(),
  })
  .transform((raw): VersionDocumentoDto => ({
    idVersion: raw.ID_VERSION,
    idDocumento: raw.ID_DOCUMENTO_FK,
    version: raw.VERSION,
    rutaUrl: raw.RUTA_URL,
    createdAt: raw.CREATED_AT,
    usuario_fk: raw.usuario_fk,
    content_json: raw.content_json ?? null,
    usuario: raw.usuarios ?? null,
  }));
export type VersionDocumentoRaw = z.input<typeof versionDocumentoRawToDtoSchema>;

export const documentoRawToDtoSchema = z
  .object({
    ID_DOCUMENTO: z.number(),
    NOMBRE: z.string(),
    RUTA_URL: z.string(),
    PROVEEDOR: proveedorEnum,
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

export const cotizacionDetalleRawToDtoSchema = z
  .object({
    ID_DETALLE: z.number(),
    ID_COTIZACION_FK: z.number(),
    EQUIPO_DESCRIPCION: z.string(),
    TIPO_SERVICIO: z.string(),
    MAGNITUD: z.string(),
    NORMA_TECNICA: z.string().nullish(),
    CANTIDAD: z.number(),
    VALOR_UNITARIO: z.coerce.number(),
    VALOR_TOTAL: z.coerce.number(),
    sitio: z.string().nullish(),
  })
  .transform((raw): CotizacionDetalleDto => ({
    idDetalle: raw.ID_DETALLE,
    idCotizacion: raw.ID_COTIZACION_FK,
    equipoDescripcion: raw.EQUIPO_DESCRIPCION,
    tipoServicio: raw.TIPO_SERVICIO,
    magnitud: raw.MAGNITUD,
    normaTecnica: raw.NORMA_TECNICA ?? null,
    cantidad: raw.CANTIDAD,
    valorUnitario: raw.VALOR_UNITARIO,
    valorTotal: raw.VALOR_TOTAL,
    sitio: raw.sitio ?? null,
  }));
export type CotizacionDetalleRaw = z.input<typeof cotizacionDetalleRawToDtoSchema>;

export const certificadoRawToDtoSchema = z
  .object({
    ID_CERTIFICADO: z.number(),
    CODIGO_CERTIFICADO: z.string(),
    ID_CALIBRACION_FK: z.number(),
    ID_DOCUMENTO_FK: z.number(),
    documentos: documentoRawToDtoSchema.nullish(),
  })
  .transform((raw): CertificadoDto => ({
    idCertificado: raw.ID_CERTIFICADO,
    codigo: raw.CODIGO_CERTIFICADO,
    idCalibracion: raw.ID_CALIBRACION_FK,
    idDocumento: raw.ID_DOCUMENTO_FK,
    documento: raw.documentos ?? null,
  }));
export type CertificadoRaw = z.input<typeof certificadoRawToDtoSchema>;

export const calibracionRawToDtoSchema = z
  .object({
    ID_CALIBRACION: z.number(),
    ID_INSTRUMENTO_FK: z.number(),
    ID_TECNICO_FK: z.number(),
    DATOS_TECNICOS_JSON: z.unknown(),
    OBSERVACIONES: z.string().nullish(),
    CREATED_AT: z.coerce.date(),
    certificados: certificadoRawToDtoSchema.nullish(),
  })
  .transform((raw): CalibracionDto => ({
    idCalibracion: raw.ID_CALIBRACION,
    idInstrumento: raw.ID_INSTRUMENTO_FK,
    idTecnico: raw.ID_TECNICO_FK,
    datosTecnicos: raw.DATOS_TECNICOS_JSON,
    observaciones: raw.OBSERVACIONES ?? null,
    createdAt: raw.CREATED_AT,
    certificado: raw.certificados ?? null,
  }));
export type CalibracionRaw = z.input<typeof calibracionRawToDtoSchema>;

export const recepcionDetalleRawToDtoSchema = z
  .object({
    ID_INSTRUMENTO: z.number(),
    ID_RECEPCION_FK: z.number(),
    INSTRUMENTO: z.string(),
    MARCA: z.string().nullish(),
    MODELO: z.string().nullish(),
    SERIE: z.string().nullish(),
    CODIGO_INVENTARIO: z.string().nullish(),
    RESOLUCION: z.string().nullish(),
    TIPO_SENSOR_TEMP: z.string().nullish(),
    ESTADO_IBC: z.unknown().nullish(),
    ESTAMPILLA: z.string().nullish(),
    OBSERVACIONES: z.string().nullish(),
    calibraciones: calibracionRawToDtoSchema.nullish(),
  })
  .transform((raw): RecepcionDetalleDto => ({
    idInstrumento: raw.ID_INSTRUMENTO,
    idRecepcion: raw.ID_RECEPCION_FK,
    instrumento: raw.INSTRUMENTO,
    marca: raw.MARCA ?? null,
    modelo: raw.MODELO ?? null,
    serie: raw.SERIE ?? null,
    codigoInventario: raw.CODIGO_INVENTARIO ?? null,
    resolucion: raw.RESOLUCION ?? null,
    tipoSensorTemp: raw.TIPO_SENSOR_TEMP ?? null,
    estadoIBC: raw.ESTADO_IBC ?? null,
    estampilla: raw.ESTAMPILLA ?? null,
    observaciones: raw.OBSERVACIONES ?? null,
    calibracion: raw.calibraciones ?? null,
  }));
export type RecepcionDetalleRaw = z.input<typeof recepcionDetalleRawToDtoSchema>;

export const recepcionEquipoRawToDtoSchema = z
  .object({
    ID_RECEPCION: z.number(),
    CODIGO_RECEPCION: z.string(),
    ID_COTIZACION_FK: z.number().nullish(),
    ID_ORDEN_TRABAJO_FK: z.number().nullish(),
    SOLICITANTE: z.string(),
    NOMBRE_ENTREGA: z.string().nullish(),
    SITIO_CALIBRACION: z.string(),
    FECHA_RECEPCION: z.coerce.date(),
    FECHA_SALIDA: z.coerce.date().nullish(),
    NOMBRE_RECIBE: z.string().nullish(),
    NOMBRE_EMPACA: z.string().nullish(),
    NOMBRE_CALIBRA: z.string().nullish(),
    NOMBRE_RECIBE_SERVICIO: z.string().nullish(),
    ACCESORIOS: z.string().nullish(),
    PRUEBAS_COMPLETAS: z.boolean().nullish(),
    OBSERVACIONES_PRUEBAS: z.string().nullish(),
    ESTADO: z.string().nullish(),
    CREATED_AT: z.coerce.date(),
    recepcion_equipo_detalles: z.array(recepcionDetalleRawToDtoSchema).nullish(),
    documentos: z.array(documentoRawToDtoSchema).nullish(),
  })
  .transform((raw): RecepcionEquipoDto => ({
    idRecepcion: raw.ID_RECEPCION,
    codigo: raw.CODIGO_RECEPCION,
    idCotizacion: raw.ID_COTIZACION_FK ?? null,
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO_FK ?? null,
    solicitante: raw.SOLICITANTE,
    nombreEntrega: raw.NOMBRE_ENTREGA ?? null,
    sitioCalibracion: raw.SITIO_CALIBRACION,
    fechaRecepcion: raw.FECHA_RECEPCION,
    fechaSalida: raw.FECHA_SALIDA ?? null,
    nombreRecibe: raw.NOMBRE_RECIBE ?? null,
    nombreEmpaca: raw.NOMBRE_EMPACA ?? null,
    nombreCalibra: raw.NOMBRE_CALIBRA ?? null,
    nombreRecibeServicio: raw.NOMBRE_RECIBE_SERVICIO ?? null,
    accesorios: raw.ACCESORIOS ?? null,
    pruebasCompletas: raw.PRUEBAS_COMPLETAS ?? true,
    observacionesPruebas: raw.OBSERVACIONES_PRUEBAS ?? null,
    estado: raw.ESTADO ?? 'RECIBIDO',
    createdAt: raw.CREATED_AT,
    instrumentos: raw.recepcion_equipo_detalles ?? [],
    documentos: raw.documentos ?? [],
  }));
export type RecepcionEquipoRaw = z.input<typeof recepcionEquipoRawToDtoSchema>;

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

export const ordenTrabajoTrazabilidadRawToDtoSchema = z
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
    orden_trabajo_detalles: z.array(ordenTrabajoDetalleRawToDtoSchema).nullish(),
    documentos: z.array(documentoRawToDtoSchema).nullish(),
  })
  .transform((raw): OrdenTrabajoTrazabilidadDto => ({
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
    instrumentos: raw.orden_trabajo_detalles ?? [],
    documentos: raw.documentos ?? [],
  }));
export type OrdenTrabajoTrazabilidadRaw = z.input<typeof ordenTrabajoTrazabilidadRawToDtoSchema>;

export const cotizacionTrazabilidadRawToDtoSchema = z
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
    cotizacion_detalles: z.array(cotizacionDetalleRawToDtoSchema).nullish(),
    documentos: z.array(documentoRawToDtoSchema).nullish(),
    recepciones_equipo: z.array(recepcionEquipoRawToDtoSchema).nullish(),
  })
  .transform((raw): CotizacionTrazabilidadDto => ({
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
    detalles: raw.cotizacion_detalles ?? [],
    documentos: raw.documentos ?? [],
    recepciones: raw.recepciones_equipo ?? [],
  }));
export type CotizacionTrazabilidadRaw = z.input<typeof cotizacionTrazabilidadRawToDtoSchema>;

// ============================================================
// RESPONSES
// ============================================================
export const respuestaClienteSchema = z.object({
  ok: z.literal(true),
  data: clienteDtoSchema,
});
export type RespuestaCliente = z.infer<typeof respuestaClienteSchema>;

export const respuestaListaClientesSchema = z.object({
  ok: z.literal(true),
  data: z.array(clienteDtoSchema),
});
export type RespuestaListaClientes = z.infer<typeof respuestaListaClientesSchema>;

export const respuestaUltimaCotizacionSchema = z.object({
  ok: z.literal(true),
  data: z.coerce.date().nullable(),
});
export type RespuestaUltimaCotizacion = z.infer<typeof respuestaUltimaCotizacionSchema>;

export const respuestaEliminarClienteSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
});
export type RespuestaEliminarCliente = z.infer<typeof respuestaEliminarClienteSchema>;

export const respuestaTrazabilidadSchema = z.object({
  ok: z.literal(true),
  data: clienteTrazabilidadDtoSchema,
});
export type RespuestaTrazabilidad = z.infer<typeof respuestaTrazabilidadSchema>;

export const respuestaDocumentoSchema = z.object({
  ok: z.literal(true),
  data: documentoDtoSchema,
  message: z.string(),
});
export type RespuestaDocumento = z.infer<typeof respuestaDocumentoSchema>;
