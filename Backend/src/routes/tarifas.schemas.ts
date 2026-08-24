import { z } from 'zod';

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
    precioU: raw.PRECIO_U ? raw.PRECIO_U : 0,
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

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const crearTarifaBodySchema = z.object({
  magnitud: z.string(),
  tipoServicio: z.string(),
  instrumento: z.string(),
  precioInicial: z.coerce.number(),
  norma: z.string().optional(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().nullish(),
});
export type CrearTarifaBody = z.infer<typeof crearTarifaBodySchema>;

export const actualizarTarifaBodySchema = z.object({
  idTarifa: z.number(),
  magnitud: z.string().optional(),
  tipoServicio: z.string().optional(),
  instrumento: z.string().optional(),
  norma: z.string().optional(),
  precioVigente: z.coerce.number().optional(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().nullish(),
});
export type ActualizarTarifaBody = z.infer<typeof actualizarTarifaBodySchema>;

export const actualizarPrecioTarifaBodySchema = z.object({
  idTarifa: z.number(),
  nuevoPrecio: z.coerce.number(),
  fechaInicio: z.string().optional(),
  fechaFin: z.string().nullish(),
});
export type ActualizarPrecioTarifaBody = z.infer<typeof actualizarPrecioTarifaBodySchema>;

export const cambiarEstadoTarifaBodySchema = z.object({
  nuevoEstado: z.enum(['ACTIVO', 'INACTIVO']),
});
export type CambiarEstadoTarifaBody = z.infer<typeof cambiarEstadoTarifaBodySchema>;

export const respuestaTarifaSchema = z.object({
  ok: z.literal(true),
  data: tarifaDtoSchema,
});
export type RespuestaTarifa = z.infer<typeof respuestaTarifaSchema>;

export const respuestaListaTarifasSchema = z.object({
  ok: z.literal(true),
  data: z.array(tarifaDtoSchema),
});
export type RespuestaListaTarifas = z.infer<typeof respuestaListaTarifasSchema>;
