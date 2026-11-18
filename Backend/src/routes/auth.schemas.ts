import { z } from 'zod';

export const loginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
  ip: z.string().nullish(),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export const usuarioLoginDtoSchema = z.object({
  id_user: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  permissions: z.unknown(),
});
export type UsuarioLoginDto = z.infer<typeof usuarioLoginDtoSchema>;

export const usuarioLoginRawToDtoSchema = z
  .object({
    ID_USUARIO_AUTO_INCREMENT: z.number(),
    NOMBRE_COMPLETO: z.string(),
    CORREO_INSTITUCION: z.string(),
    NOMBRE_ROL: z.string(),
    PERMISOS_JSON: z.unknown(),
  })
  .transform((raw): UsuarioLoginDto => ({
    id_user: raw.ID_USUARIO_AUTO_INCREMENT,
    name: raw.NOMBRE_COMPLETO,
    email: raw.CORREO_INSTITUCION,
    role: raw.NOMBRE_ROL,
    permissions: raw.PERMISOS_JSON,
  }));
export type UsuarioLoginRaw = z.input<typeof usuarioLoginRawToDtoSchema>;

export const respuestaLoginSchema = z.object({
  user: usuarioLoginDtoSchema,
});
export type RespuestaLogin = z.infer<typeof respuestaLoginSchema>;

export const solicitarRecuperacionBodySchema = z.object({
  email: z.string(),
});
export type SolicitarRecuperacionBody = z.infer<typeof solicitarRecuperacionBodySchema>;

export const recuperarContrasenaBodySchema = z.object({
  email: z.string(),
  codigo: z.string(),
  nuevaContrasena: z.string().min(8),
});
export type RecuperarContrasenaBody = z.infer<typeof recuperarContrasenaBodySchema>;

export const respuestaRecuperacionSchema = z.object({
  success: z.literal(true),
});
export type RespuestaRecuperacion = z.infer<typeof respuestaRecuperacionSchema>;
