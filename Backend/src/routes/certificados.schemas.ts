import { z } from 'zod';

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
  status: z.enum(['ACTIVO', 'INACTIVO']),
  createat: z.coerce.date(),
  dirrecion: z.string(),
  updatedAt: z.coerce.date(),
  ciudad: z.string().nullable(),
  tipoCliente: z.enum(['NATURAL', 'JURIDICO']),
});
export type ClienteDto = z.infer<typeof clienteDtoSchema>;

export const certificadoSelloDtoSchema = z.object({
  idCertificado: z.number(),
  idSello: z.number(),
});
export type CertificadoSelloDto = z.infer<typeof certificadoSelloDtoSchema>;

export const certificadoDtoSchema = z.object({
  idCertificado: z.number(),
  codigo: z.string(),
  idCalibracion: z.number(),
  idDocumento: z.number(),
  sellos: z.array(certificadoSelloDtoSchema),
});
export type CertificadoDto = z.infer<typeof certificadoDtoSchema>;

export const calibracionDtoSchema = z.object({
  idCalibracion: z.number(),
  idInstrumento: z.number(),
  idTecnico: z.number(),
  datosTecnicos: z.unknown(),
  observaciones: z.string().nullable(),
  createdAt: z.coerce.date(),
});
export type CalibracionDto = z.infer<typeof calibracionDtoSchema>;

export const recepcionEquipoDetalleDtoSchema = z.object({
  idInstrumento: z.number(),
  idRecepcion: z.number(),
  instrumento: z.string(),
  marca: z.string().nullable(),
  modelo: z.string().nullable(),
  serie: z.string().nullable(),
  codigoInventario: z.string().nullable(),
  resolucion: z.string().nullable(),
  tipoSensorTemp: z.string().nullable(),
  estadoIBC: z.unknown().nullable(),
  estampilla: z.string().nullable(),
  observaciones: z.string().nullable(),
});
export type RecepcionEquipoDetalleDto = z.infer<typeof recepcionEquipoDetalleDtoSchema>;

export const cotizacionDtoSchema = z.object({
  idCotizacion: z.number(),
  codigo: z.string(),
  idCliente: z.number().nullable(),
  montoTotal: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  viaticos: z.number().nullable(),
  estado: z.string(),
  enviar: z.boolean(),
  descuento: z.number().nullable(),
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
  NIT: z.string().nullable(),
  dirrecion: z.string().nullable(),
  ciudad: z.string().nullable(),
  esInternoUSC: z.boolean().nullable(),
  esEnSitio: z.boolean().nullable(),
  esLabPermanente: z.boolean().nullable(),
  personaContacto: z.string().nullable(),
  telefonoContacto: z.string().nullable(),
  fechaCalibracion: z.coerce.date().nullable(),
  hora: z.coerce.date().nullable(),
  Razon_social: z.string().nullable(),
  dirrecion_solcitante: z.string().nullable(),
  personaContacto_solicitante: z.string().nullable(),
  ciudad_solcitante: z.string().nullable(),
  NIT_solicitante: z.string().nullable(),
  telefonoContacto_solcitante: z.string().nullable(),
  no_orden_trabajo: z.string().nullable(),
  no_cotizacion: z.string().nullable(),
  responsable: z.string().nullable(),
  fecha_dilgenciamento: z.coerce.date().nullable(),
  requireAnexo: z.boolean().nullable(),
  observaciones: z.string().nullable(),
  estado: z.string().nullable(),
  estadoRevision: z.string().nullable(),
  motivoRechazo: z.string().nullable(),
  createdAt: z.coerce.date().nullable(),
  estado_pago: z.string().nullable(),
  alertamessag: z.string().nullable(),
  cliente: clienteDtoSchema.nullable(),
  cotizacion: cotizacionDtoSchema.nullable(),
  instrumentos: z.array(ordenTrabajoDetalleDtoSchema),
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

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

export const certificadoSelloRawToDtoSchema = z
  .object({
    ID_CERTIFICADO_FK: z.number(),
    ID_SELLO_FK: z.number(),
  })
  .transform((raw): CertificadoSelloDto => ({
    idCertificado: raw.ID_CERTIFICADO_FK,
    idSello: raw.ID_SELLO_FK,
  }));

export const certificadoRawToDtoSchema = z
  .object({
    ID_CERTIFICADO: z.number(),
    CODIGO_CERTIFICADO: z.string(),
    ID_CALIBRACION_FK: z.number(),
    ID_DOCUMENTO_FK: z.number(),
    certificado_sellos: z.array(certificadoSelloRawToDtoSchema).nullish(),
  })
  .transform((raw): CertificadoDto => ({
    idCertificado: raw.ID_CERTIFICADO,
    codigo: raw.CODIGO_CERTIFICADO,
    idCalibracion: raw.ID_CALIBRACION_FK,
    idDocumento: raw.ID_DOCUMENTO_FK,
    sellos: raw.certificado_sellos ?? [],
  }));

export const calibracionRawToDtoSchema = z
  .object({
    ID_CALIBRACION: z.number(),
    ID_INSTRUMENTO_FK: z.number(),
    ID_TECNICO_FK: z.number(),
    DATOS_TECNICOS_JSON: z.unknown(),
    OBSERVACIONES: z.string().nullish(),
    CREATED_AT: z.coerce.date(),
  })
  .transform((raw): CalibracionDto => ({
    idCalibracion: raw.ID_CALIBRACION,
    idInstrumento: raw.ID_INSTRUMENTO_FK,
    idTecnico: raw.ID_TECNICO_FK,
    datosTecnicos: raw.DATOS_TECNICOS_JSON,
    observaciones: raw.OBSERVACIONES ?? null,
    createdAt: raw.CREATED_AT,
  }));

export const recepcionEquipoDetalleRawToDtoSchema = z
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
  })
  .transform((raw): RecepcionEquipoDetalleDto => ({
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
  }));

export const cotizacionRawToDtoSchema = z
  .object({
    ID_COTIZACION: z.number(),
    CODIGO_COTIZACION: z.string(),
    ID_CLIENTE_FK: z.number().nullish(),
    MONTO_TOTAL: z.coerce.number().nullish(),
    CREATED_AT: z.coerce.date(),
    UPDATED_AT: z.coerce.date().nullish(),
    viaticos: z.coerce.number().nullish(),
    ESTADO: z.string(),
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
    viaticos: raw.viaticos ?? null,
    estado: raw.ESTADO,
    enviar: raw.enviar,
    descuento: raw.descuento ?? null,
    cliente: raw.clientes ?? null,
  }));

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
    DECLARACION_CONFORMIDAD: z.boolean(),
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
    declaracionConformidad: raw.DECLARACION_CONFORMIDAD,
    limiteControlEMC: raw.LIMITE_CONTROL_EMC ?? null,
    docEspecificacion: raw.DOC_ESPECIFICACION ?? null,
    reglaDecision: raw.REGLA_DECISION ?? null,
  }));

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
    NIT: raw.NIT ?? null,
    dirrecion: raw.dirrecion ?? null,
    ciudad: raw.ciudad ?? null,
    esInternoUSC: raw.ES_INTERNO_USC ?? null,
    esEnSitio: raw.ES_EN_SITIO ?? null,
    esLabPermanente: raw.ES_LAB_PERMANENTE ?? null,
    personaContacto: raw.PERSONA_CONTACTO ?? null,
    telefonoContacto: raw.TELEFONO_CONTACTO ?? null,
    fechaCalibracion: raw.FECHA_CALIBRACION ?? null,
    hora: raw.hora ?? null,
    Razon_social: raw.Razon_social ?? null,
    dirrecion_solcitante: raw.dirrecion_solcitante ?? null,
    personaContacto_solicitante: raw.PERSONA_CONTACT_SOLCITANTE ?? null,
    ciudad_solcitante: raw.ciudad_solcitante ?? null,
    NIT_solicitante: raw.NIT_solicitante ?? null,
    telefonoContacto_solcitante: raw.TELEFONO_CONTACTO_SOLICITANTE ?? null,
    no_orden_trabajo: raw.no_orden_trabajo ?? null,
    no_cotizacion: raw.no_cotizacion ?? null,
    responsable: raw.RESPONSABLE ?? null,
    fecha_dilgenciamento: raw.FECHA_CALIBRACION_DILIGENCIAMENTO ?? null,
    requireAnexo: raw.REQUIERE_ANEXO ?? null,
    observaciones: raw.OBSERVACIONES ?? null,
    estado: raw.estado ?? null,
    estadoRevision: raw.ESTADO_REVISION ?? null,
    motivoRechazo: raw.MOTIVO_RECHAZO ?? null,
    createdAt: raw.CREATED_AT ?? null,
    estado_pago: raw.estado_pago ?? null,
    alertamessag: raw.alertamessag ?? null,
    cliente: raw.clientes ?? null,
    cotizacion: raw.cotizaciones ?? null,
    instrumentos: raw.orden_trabajo_detalles ?? [],
  }));

// ============================================================
// RESPONSES
// ============================================================
export const respuestaCertificadosSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    certificados: z.array(certificadoDtoSchema),
    calibraciones: z.array(calibracionDtoSchema),
    instrumentos: z.array(recepcionEquipoDetalleDtoSchema),
    ordenes: z.array(ordenTrabajoDtoSchema),
    clientes: z.array(clienteDtoSchema),
  }),
});
export type RespuestaCertificados = z.infer<typeof respuestaCertificadosSchema>;
