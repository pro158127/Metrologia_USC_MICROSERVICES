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

export const clienteResumenDtoSchema = z.object({
  idCliente: z.number(),
  razonSocial: z.string(),
  correo: z.string(),
});
export type ClienteResumenDto = z.infer<typeof clienteResumenDtoSchema>;

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
});
export type DocumentoDto = z.infer<typeof documentoDtoSchema>;

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
  estadoIBC: z.unknown().nullable(),
  estampilla: z.string().nullable(),
  observaciones: z.string().nullable(),
});
export type RecepcionDetalleDto = z.infer<typeof recepcionDetalleDtoSchema>;

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

export const cotizacionConDetallesDtoSchema = z.object({
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
  cliente: clienteResumenDtoSchema.nullable(),
  detalles: z.array(cotizacionDetalleDtoSchema),
});
export type CotizacionConDetallesDto = z.infer<typeof cotizacionConDetallesDtoSchema>;

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
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

export const ordenTrabajoResumenDtoSchema = z.object({
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
  cliente: clienteResumenDtoSchema.nullable(),
  cotizacion: z
    .object({
      idCotizacion: z.number(),
      codigo: z.string(),
    })
    .nullable(),
});
export type OrdenTrabajoResumenDto = z.infer<typeof ordenTrabajoResumenDtoSchema>;

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
  documentos: z.array(documentoDtoSchema),
  instrumentos: z.array(recepcionDetalleDtoSchema),
  cotizacion: cotizacionDtoSchema.nullable(),
  ordenTrabajo: ordenTrabajoDtoSchema.nullable(),
});
export type RecepcionEquipoDto = z.infer<typeof recepcionEquipoDtoSchema>;

export const recepcionEnriquecidaDtoSchema = z.object({
  idRecepcion: z.number(),
  codigo: z.string(),
  clienteNombre: z.string(),
  fecha: z.string(),
  cantidadInstrumentos: z.number(),
  codigoCotizacion: z.string(),
  codigoOT: z.string(),
  raw: recepcionEquipoDtoSchema,
});
export type RecepcionEnriquecidaDto = z.infer<typeof recepcionEnriquecidaDtoSchema>;

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

export const clienteResumenRawToDtoSchema = z
  .object({
    ID_CLIENTE: z.number(),
    RAZON_SOCIAL: z.string(),
    CORREO: z.string(),
  })
  .transform((raw): ClienteResumenDto => ({
    idCliente: raw.ID_CLIENTE,
    razonSocial: raw.RAZON_SOCIAL,
    correo: raw.CORREO,
  }));
export type ClienteResumenRaw = z.input<typeof clienteResumenRawToDtoSchema>;

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
  }));
export type DocumentoRaw = z.input<typeof documentoRawToDtoSchema>;

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
  }));
export type RecepcionDetalleRaw = z.input<typeof recepcionDetalleRawToDtoSchema>;

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

export const cotizacionConDetallesRawToDtoSchema = z
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
    clientes: clienteResumenRawToDtoSchema.nullish(),
    cotizacion_detalles: z.array(cotizacionDetalleRawToDtoSchema).nullish(),
  })
  .transform((raw): CotizacionConDetallesDto => ({
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
    detalles: raw.cotizacion_detalles ?? [],
  }));
export type CotizacionConDetallesRaw = z.input<typeof cotizacionConDetallesRawToDtoSchema>;

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
  }));
export type OrdenTrabajoRaw = z.input<typeof ordenTrabajoRawToDtoSchema>;

export const ordenTrabajoResumenRawToDtoSchema = z
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
    clientes: clienteResumenRawToDtoSchema.nullish(),
    cotizaciones: z
      .object({
        ID_COTIZACION: z.number(),
        CODIGO_COTIZACION: z.string(),
      })
      .nullish(),
  })
  .transform((raw): OrdenTrabajoResumenDto => ({
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
    cotizacion: raw.cotizaciones
      ? { idCotizacion: raw.cotizaciones.ID_COTIZACION, codigo: raw.cotizaciones.CODIGO_COTIZACION }
      : null,
  }));
export type OrdenTrabajoResumenRaw = z.input<typeof ordenTrabajoResumenRawToDtoSchema>;

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
    documentos: z.array(documentoRawToDtoSchema).nullish(),
    recepcion_equipo_detalles: z.array(recepcionDetalleRawToDtoSchema).nullish(),
    cotizaciones: cotizacionRawToDtoSchema.nullish(),
    ordenes_trabajo: ordenTrabajoRawToDtoSchema.nullish(),
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
    documentos: raw.documentos ?? [],
    instrumentos: raw.recepcion_equipo_detalles ?? [],
    cotizacion: raw.cotizaciones ?? null,
    ordenTrabajo: raw.ordenes_trabajo ?? null,
  }));
export type RecepcionEquipoRaw = z.input<typeof recepcionEquipoRawToDtoSchema>;

export const recepcionesEnriquecidasResponseSchema = z.array(recepcionEnriquecidaDtoSchema);
export type RecepcionesEnriquecidasResponse = z.infer<typeof recepcionesEnriquecidasResponseSchema>;

export const datosInicialesResponseSchema = z.object({
  recepciones: z.array(recepcionEquipoDtoSchema),
  clientes: z.array(clienteDtoSchema),
  cotizaciones: z.array(cotizacionConDetallesDtoSchema),
  ordenes: z.array(ordenTrabajoResumenDtoSchema),
  tarifas: z.array(tarifaDtoSchema),
});
export type DatosInicialesResponse = z.infer<typeof datosInicialesResponseSchema>;
