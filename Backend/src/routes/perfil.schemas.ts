import { z } from 'zod';

export const perfilDtoSchema = z.object({
  nombre: z.string(),
  correo: z.string(),
  rol: z.string(),
});
export type PerfilDto = z.infer<typeof perfilDtoSchema>;

export const respuestaPerfilSchema = z.object({
  success: z.literal(true),
  data: perfilDtoSchema,
});
export type RespuestaPerfil = z.infer<typeof respuestaPerfilSchema>;

export const confirmarCambioContrasenaBodySchema = z.object({
  codigo: z.string(),
  nuevaContrasena: z.string().min(8),
});
export type ConfirmarCambioContrasenaBody = z.infer<typeof confirmarCambioContrasenaBodySchema>;

export const respuestaOkSchema = z.object({
  success: z.literal(true),
});
export type RespuestaOk = z.infer<typeof respuestaOkSchema>;
