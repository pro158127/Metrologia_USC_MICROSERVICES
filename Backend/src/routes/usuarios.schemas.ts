import { z } from 'zod';

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
  rol: rolDtoSchema.optional(),
});
export type UsuarioDto = z.infer<typeof usuarioDtoSchema>;

export const bitacoraDtoSchema = z.object({
  fecha: z.string(),
  usuario: z.string(),
  rol: z.string(),
  accion: z.string(),
  modulo: z.string(),
  ip: z.string(),
});
export type BitacoraDto = z.infer<typeof bitacoraDtoSchema>;

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
    ...(raw.roles ? { rol: raw.roles } : {}),
  }));
export type UsuarioRaw = z.input<typeof usuarioRawToDtoSchema>;

export const bitacoraRawToDtoSchema = z
  .object({
    createdAt: z.coerce.date().nullish(),
    action: z.string(),
    tableName: z.string(),
    ip: z.string().nullish(),
    usuarios: z
      .object({
        NOMBRE_COMPLETO: z.string(),
        roles: z.object({ NOMBRE_ROL: z.string() }).nullish(),
      })
      .nullish(),
  })
  .transform((raw): BitacoraDto => ({
    fecha: raw.createdAt ? new Date(raw.createdAt).toISOString() : '',
    usuario: raw.usuarios?.NOMBRE_COMPLETO || 'Usuario Desconocido',
    rol: raw.usuarios?.roles?.NOMBRE_ROL || 'Sin Rol',
    accion: raw.action,
    modulo: raw.tableName,
    ip: raw.ip || '0.0.0.0',
  }));
export type BitacoraRaw = z.input<typeof bitacoraRawToDtoSchema>;

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const crearUsuarioBodySchema = z
  .object({
    nombre: z.string(),
    correo: z.string(),
    idRol: z.number(),
    estado: z.boolean().optional(),
  })
  .strict();
export type CrearUsuarioBody = z.infer<typeof crearUsuarioBodySchema>;

export const actualizarUsuarioBodySchema = z.record(z.string(), z.unknown());
export type ActualizarUsuarioBody = z.infer<typeof actualizarUsuarioBodySchema>;

export const respuestaOkSchema = z.object({
  success: z.literal(true),
});
export type RespuestaOk = z.infer<typeof respuestaOkSchema>;

export const respuestaOkConMensajeSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});
export type RespuestaOkConMensaje = z.infer<typeof respuestaOkConMensajeSchema>;

export const respuestaOkConWarningSchema = z.object({
  success: z.literal(true),
  warning: z.string().optional(),
});
export type RespuestaOkConWarning = z.infer<typeof respuestaOkConWarningSchema>;

export const respuestaListaUsuariosSchema = z.object({
  success: z.literal(true),
  data: z.array(usuarioDtoSchema),
});
export type RespuestaListaUsuarios = z.infer<typeof respuestaListaUsuariosSchema>;

export const respuestaListaRolesSchema = z.object({
  success: z.literal(true),
  data: z.array(rolDtoSchema),
});
export type RespuestaListaRoles = z.infer<typeof respuestaListaRolesSchema>;

export const respuestaListaBitacoraSchema = z.object({
  success: z.literal(true),
  data: z.array(bitacoraDtoSchema),
});
export type RespuestaListaBitacora = z.infer<typeof respuestaListaBitacoraSchema>;
