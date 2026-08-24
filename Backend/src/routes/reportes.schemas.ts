import { z } from 'zod';

// ============================================================
// ENUMS
// ============================================================
export const estadosEnum = z.enum(['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'EN_SEGUIMIENTO']);
export type EstadosZod = z.infer<typeof estadosEnum>;

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

export const historialEstadoDtoSchema = z.object({
  id: z.number(),
  idCotizacion: z.number(),
  estadoAnterior: estadosEnum.nullable(),
  estadoNuevo: estadosEnum,
  idUsuario: z.number(),
  createdAt: z.coerce.date(),
});
export type HistorialEstadoDto = z.infer<typeof historialEstadoDtoSchema>;

export const cotizacionDtoSchema = z.object({
  idCotizacion: z.number(),
  codigo: z.string(),
  idCliente: z.number().nullable(),
  montoTotal: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  viaticos: z.number().nullable(),
  estado: estadosEnum,
  enviar: z.boolean(),
  descuento: z.number().nullable(),
  cliente: clienteDtoSchema.nullable(),
  detalles: z.array(cotizacionDetalleDtoSchema),
  historialEstados: z.array(historialEstadoDtoSchema),
});
export type CotizacionDto = z.infer<typeof cotizacionDtoSchema>;

export const cotizacionOrdenDtoSchema = z.object({
  idCotizacion: z.number(),
  codigo: z.string(),
  idCliente: z.number().nullable(),
  montoTotal: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullable(),
  viaticos: z.number().nullable(),
  estado: estadosEnum,
  enviar: z.boolean(),
  descuento: z.number().nullable(),
  cliente: clienteDtoSchema.nullable(),
});
export type CotizacionOrdenDto = z.infer<typeof cotizacionOrdenDtoSchema>;

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
  cotizacion: cotizacionOrdenDtoSchema.nullable(),
  instrumentos: z.array(ordenTrabajoDetalleDtoSchema),
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

export const ordenTrabajoFacturaDtoSchema = z.object({
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
});
export type OrdenTrabajoFacturaDto = z.infer<typeof ordenTrabajoFacturaDtoSchema>;

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

export const facturaDtoSchema = z.object({
  idFactura: z.number(),
  numero: z.string(),
  idOrdenTrabajo: z.number().nullable(),
  idCliente: z.number().nullable(),
  fecha: z.coerce.date(),
  valor: z.number(),
  estado: z.string(),
  observacion: z.string().nullable(),
  ordenTrabajo: ordenTrabajoFacturaDtoSchema.nullable(),
  cliente: clienteDtoSchema.nullable(),
});
export type FacturaDto = z.infer<typeof facturaDtoSchema>;

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
});
export type UsuarioDto = z.infer<typeof usuarioDtoSchema>;

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

export const historialEstadoRawToDtoSchema = z
  .object({
    ID_HISTORIAL: z.number(),
    ID_COTIZACION_FK: z.number(),
    ESTADO_ANTERIOR: estadosEnum.nullish(),
    ESTADO_NUEVO: estadosEnum,
    ID_USUARIO_FK: z.number(),
    CREATED_AT: z.coerce.date(),
  })
  .transform((raw): HistorialEstadoDto => ({
    id: raw.ID_HISTORIAL,
    idCotizacion: raw.ID_COTIZACION_FK,
    estadoAnterior: raw.ESTADO_ANTERIOR ?? null,
    estadoNuevo: raw.ESTADO_NUEVO,
    idUsuario: raw.ID_USUARIO_FK,
    createdAt: raw.CREATED_AT,
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
    ESTADO: estadosEnum,
    enviar: z.boolean(),
    descuento: z.coerce.number().nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
    cotizacion_detalles: z.array(cotizacionDetalleRawToDtoSchema).nullish(),
    historial_estado_cotizacion: z.array(historialEstadoRawToDtoSchema).nullish(),
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
    detalles: raw.cotizacion_detalles ?? [],
    historialEstados: raw.historial_estado_cotizacion ?? [],
  }));

export const cotizacionOrdenRawToDtoSchema = z
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
  .transform((raw): CotizacionOrdenDto => ({
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
    cotizaciones: cotizacionOrdenRawToDtoSchema.nullish(),
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

export const ordenTrabajoFacturaRawToDtoSchema = z
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
  })
  .transform((raw): OrdenTrabajoFacturaDto => ({
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
  }));

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

export const facturaRawToDtoSchema = z
  .object({
    ID_FACTURA: z.number(),
    NUMERO_FACTURA: z.string(),
    ID_ORDEN_TRABAJO_FK: z.number().nullish(),
    ID_CLIENTE_FK: z.number().nullish(),
    FECHA: z.coerce.date(),
    VALOR: z.coerce.number(),
    ESTADO: z.string(),
    OBSERVACION: z.string().nullish(),
    ordenes_trabajo: ordenTrabajoFacturaRawToDtoSchema.nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
  })
  .transform((raw): FacturaDto => ({
    idFactura: raw.ID_FACTURA,
    numero: raw.NUMERO_FACTURA,
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO_FK ?? null,
    idCliente: raw.ID_CLIENTE_FK ?? null,
    fecha: raw.FECHA,
    valor: raw.VALOR,
    estado: raw.ESTADO,
    observacion: raw.OBSERVACION ?? null,
    ordenTrabajo: raw.ordenes_trabajo ?? null,
    cliente: raw.clientes ?? null,
  }));

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
  }));

// ============================================================
// RESPONSES
// ============================================================
export const respuestaReportesSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    cotizaciones: z.array(cotizacionDtoSchema),
    ordenes: z.array(ordenTrabajoDtoSchema),
    certificados: z.array(certificadoDtoSchema),
    facturas: z.array(facturaDtoSchema),
    usuarios: z.array(usuarioDtoSchema),
  }),
});
export type RespuestaReportes = z.infer<typeof respuestaReportesSchema>;
