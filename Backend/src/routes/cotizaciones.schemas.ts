import { z } from 'zod';
import { metaListaSchema } from '../schemas/comunes.js';

// ============================================================
// ENUMS
// ============================================================
export const estadosEnum = z.enum(['BORRADOR', 'ENVIADA', 'APROBADA', 'RECHAZADA', 'EN_SEGUIMIENTO']);
export type EstadosZod = z.infer<typeof estadosEnum>;

// ============================================================
// INPUTS (body / params / query)
// ============================================================
export const detalleInputSchema = z.object({
  equipoDescripcion: z.string(),
  tipoServicio: z.string(),
  magnitud: z.string(),
  normaTecnica: z.string().nullish(),
  cantidad: z.number(),
  valorUnitario: z.number(),
});
export type DetalleInput = z.infer<typeof detalleInputSchema>;

export const crearCotizacionBodySchema = z.object({
  codigo: z.string(),
  idCliente: z.number(),
  viaticos: z.number().optional(),
  descuento: z.number().optional(),
  estado: estadosEnum.optional(),
  detalles: z.array(detalleInputSchema).min(1),
});
export type CrearCotizacionBody = z.infer<typeof crearCotizacionBodySchema>;

export const actualizarCotizacionBodySchema = z.object({
  idCotizacion: z.number(),
  codigo: z.string().optional(),
  idCliente: z.number().optional(),
  estado: estadosEnum.optional(),
  viaticos: z.number().optional(),
  descuento: z.number().optional(),
  detalles: z.array(detalleInputSchema).optional(),
});
export type ActualizarCotizacionBody = z.infer<typeof actualizarCotizacionBodySchema>;

export const cambiarEstadoBodySchema = z.object({
  nuevoEstado: estadosEnum,
});
export type CambiarEstadoBody = z.infer<typeof cambiarEstadoBodySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const listarCotizacionesQuerySchema = z.object({
  page: z.coerce.number().nullish(),
  limit: z.coerce.number().nullish(),
  estado: estadosEnum.nullish(),
  idCliente: z.coerce.number().nullish(),
  busqueda: z.string().nullish(),
});
export type ListarCotizacionesQuery = z.infer<typeof listarCotizacionesQuerySchema>;

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

export const detalleDtoSchema = z.object({
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
export type DetalleDto = z.infer<typeof detalleDtoSchema>;

export const historialEstadoDtoSchema = z.object({
  id: z.number(),
  idCotizacion: z.number(),
  estadoAnterior: estadosEnum.nullable(),
  estadoNuevo: estadosEnum,
  idUsuario: z.number(),
  createdAt: z.coerce.date(),
});
export type HistorialEstadoDto = z.infer<typeof historialEstadoDtoSchema>;

export const historialCambioDtoSchema = z.object({
  id: z.string(),
  numeroVersion: z.string(),
  fechaCambio: z.coerce.date(),
  descripcion: z.string(),
  requiereValidacionHoja: z.boolean(),
  observaciones: z.string().nullable(),
  aprobo: z.string(),
  idCotizacion: z.number(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type HistorialCambioDto = z.infer<typeof historialCambioDtoSchema>;

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
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

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
});
export type RecepcionEquipoDto = z.infer<typeof recepcionEquipoDtoSchema>;

export const countDtoSchema = z.object({
  ordenes: z.number(),
  recepciones: z.number(),
  documentos: z.number(),
  historialEstados: z.number(),
});
export type CountDto = z.infer<typeof countDtoSchema>;

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
  detalles: z.array(detalleDtoSchema).optional(),
  cliente: clienteDtoSchema.nullable().optional(),
  historialEstados: z.array(historialEstadoDtoSchema).optional(),
  Historiacambios: z.array(historialCambioDtoSchema).optional(),
  ordenes: z.array(ordenTrabajoDtoSchema).optional(),
  recepciones: z.array(recepcionEquipoDtoSchema).optional(),
  documentos: z.array(documentoDtoSchema).optional(),
  _count: countDtoSchema.optional(),
});
export type CotizacionDto = z.infer<typeof cotizacionDtoSchema>;

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

export const detalleRawToDtoSchema = z
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
  .transform((raw): DetalleDto => ({
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

export const historialCambioRawToDtoSchema = z
  .object({
    id: z.string(),
    numero_version: z.string(),
    fecha_cambio: z.coerce.date(),
    descripcion: z.string(),
    requiere_validacion_hoja: z.boolean(),
    observaciones: z.string().nullish(),
    aprobo: z.string(),
    id_cotizacion: z.number(),
    created_at: z.coerce.date(),
    updated_at: z.coerce.date(),
  })
  .transform((raw): HistorialCambioDto => ({
    id: raw.id,
    numeroVersion: raw.numero_version,
    fechaCambio: raw.fecha_cambio,
    descripcion: raw.descripcion,
    requiereValidacionHoja: raw.requiere_validacion_hoja,
    observaciones: raw.observaciones ?? null,
    aprobo: raw.aprobo,
    idCotizacion: raw.id_cotizacion,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }));

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
  }));

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
  }));

export const countRawToDtoSchema = z
  .object({
    ordenes_trabajo: z.number().nullish(),
    recepciones_equipo: z.number().nullish(),
    documentos: z.number().nullish(),
    historial_estado_cotizacion: z.number().nullish(),
  })
  .transform(
    (raw): CountDto => ({
      ordenes: raw.ordenes_trabajo ?? 0,
      recepciones: raw.recepciones_equipo ?? 0,
      documentos: raw.documentos ?? 0,
      historialEstados: raw.historial_estado_cotizacion ?? 0,
    })
  );

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
    cotizacion_detalles: z.array(detalleRawToDtoSchema).nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
    historial_estado_cotizacion: z.array(historialEstadoRawToDtoSchema).nullish(),
    historial_cambios: z.array(historialCambioRawToDtoSchema).nullish(),
    ordenes_trabajo: z.array(ordenTrabajoRawToDtoSchema).nullish(),
    recepciones_equipo: z.array(recepcionEquipoRawToDtoSchema).nullish(),
    documentos: z.array(documentoRawToDtoSchema).nullish(),
    _count: countRawToDtoSchema.nullish(),
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
    ...(raw.cotizacion_detalles && { detalles: raw.cotizacion_detalles }),
    ...(raw.clientes && { cliente: raw.clientes }),
    ...(raw.historial_estado_cotizacion && { historialEstados: raw.historial_estado_cotizacion }),
    ...(raw.historial_cambios && { Historiacambios: raw.historial_cambios }),
    ...(raw.ordenes_trabajo && { ordenes: raw.ordenes_trabajo }),
    ...(raw.recepciones_equipo && { recepciones: raw.recepciones_equipo }),
    ...(raw.documentos && { documentos: raw.documentos }),
    ...(raw._count && { _count: raw._count }),
  }));

// ============================================================
// RESPONSES
// ============================================================
export const respuestaCotizacionSchema = z.object({
  ok: z.literal(true),
  data: cotizacionDtoSchema,
});
export type RespuestaCotizacion = z.infer<typeof respuestaCotizacionSchema>;

export const respuestaListaCotizacionesSchema = z.object({
  ok: z.literal(true),
  data: z.array(cotizacionDtoSchema),
  meta: metaListaSchema,
});
export type RespuestaListaCotizaciones = z.infer<typeof respuestaListaCotizacionesSchema>;
