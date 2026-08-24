import { z } from 'zod';

// ============================================================
// ENUMS
// ============================================================
export const tipoClienteEnum = z.enum(['NATURAL', 'JURIDICO']);
export type TipoClienteZod = z.infer<typeof tipoClienteEnum>;

export const statusClienteEnum = z.enum(['ACTIVO', 'INACTIVO']);
export type StatusClienteZod = z.infer<typeof statusClienteEnum>;

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
});
export type OrdenTrabajoDto = z.infer<typeof ordenTrabajoDtoSchema>;

export const facturaDtoSchema = z.object({
  idFactura: z.number(),
  numero: z.string(),
  idOrdenTrabajo: z.number().nullable(),
  idCliente: z.number().nullable(),
  fecha: z.coerce.date(),
  valor: z.number(),
  estado: z.string(),
  observacion: z.string().nullable(),
  ordenTrabajo: ordenTrabajoDtoSchema.nullable(),
  cliente: clienteDtoSchema.nullable(),
});
export type FacturaDto = z.infer<typeof facturaDtoSchema>;

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
  }));
export type OrdenTrabajoRaw = z.input<typeof ordenTrabajoRawToDtoSchema>;

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
    ordenes_trabajo: ordenTrabajoRawToDtoSchema.nullish(),
    clientes: clienteRawToDtoSchema.nullish(),
  })
  .transform((raw): FacturaDto => ({
    idFactura: raw.ID_FACTURA,
    numero: raw.NUMERO_FACTURA,
    idOrdenTrabajo: raw.ID_ORDEN_TRABAJO_FK ?? null,
    idCliente: raw.ID_CLIENTE_FK ?? null,
    fecha: raw.FECHA,
    valor: raw.VALOR ? Number(raw.VALOR) : 0,
    estado: raw.ESTADO,
    observacion: raw.OBSERVACION ?? null,
    ordenTrabajo: raw.ordenes_trabajo ?? null,
    cliente: raw.clientes ?? null,
  }));
export type FacturaRaw = z.input<typeof facturaRawToDtoSchema>;

// ============================================================
// RESPONSES
// ============================================================
export const respuestaFacturasSchema = z.object({
  ok: z.literal(true),
  data: z.array(facturaDtoSchema),
});
export type RespuestaFacturas = z.infer<typeof respuestaFacturasSchema>;
