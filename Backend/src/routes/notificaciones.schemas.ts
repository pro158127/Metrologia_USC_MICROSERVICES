import { z } from 'zod';

export const notificacionDtoSchema = z.object({
  idNotificacion: z.number(),
  idUsuario: z.number(),
  mensaje: z.string(),
  modulo: z.string(),
  visto: z.boolean(),
  nivelPrioridad: z.string(),
  createdAt: z.coerce.date(),
});
export type NotificacionDto = z.infer<typeof notificacionDtoSchema>;

export const notificacionRawToDtoSchema = z
  .object({
    ID_NOTIFICACION: z.number(),
    ID_USUARIO_FK: z.number(),
    MENSAJE: z.string(),
    MODULO: z.string(),
    VISTO: z.boolean(),
    NIVEL_PRIORIDAD: z.string(),
    CREATED_AT: z.coerce.date(),
  })
  .transform(
    (raw): NotificacionDto => ({
      idNotificacion: raw.ID_NOTIFICACION,
      idUsuario: raw.ID_USUARIO_FK,
      mensaje: raw.MENSAJE,
      modulo: raw.MODULO,
      visto: raw.VISTO,
      nivelPrioridad: raw.NIVEL_PRIORIDAD,
      createdAt: raw.CREATED_AT,
    })
  );
export type NotificacionRaw = z.input<typeof notificacionRawToDtoSchema>;

export const crearNotificacionBodySchema = z.object({
  idUsuario: z.number(),
  mensaje: z.string(),
  modulo: z.string(),
  nivelPrioridad: z.enum(['ALTA', 'MEDIA', 'BAJA']),
});
export type CrearNotificacionBody = z.infer<typeof crearNotificacionBodySchema>;

export const idUsuarioParamSchema = z.object({
  idUsuario: z.coerce.number(),
});
export type IdUsuarioParam = z.infer<typeof idUsuarioParamSchema>;

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const noVistasQuerySchema = z.object({
  noVistas: z.enum(['true', 'false']).optional(),
});
export type NoVistasQuery = z.infer<typeof noVistasQuerySchema>;

export const respuestaNotificacionSchema = z.object({
  ok: z.literal(true),
  data: notificacionDtoSchema,
});
export type RespuestaNotificacion = z.infer<typeof respuestaNotificacionSchema>;

export const respuestaListaNotificacionesSchema = z.object({
  ok: z.literal(true),
  data: z.array(notificacionDtoSchema),
});
export type RespuestaListaNotificaciones = z.infer<typeof respuestaListaNotificacionesSchema>;

export const respuestaNotificacionConMensajeSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
  data: notificacionDtoSchema,
});
export type RespuestaNotificacionConMensaje = z.infer<typeof respuestaNotificacionConMensajeSchema>;

export const respuestaConteoNotificacionesSchema = z.object({
  ok: z.literal(true),
  message: z.string(),
  count: z.number(),
});
export type RespuestaConteoNotificaciones = z.infer<typeof respuestaConteoNotificacionesSchema>;
