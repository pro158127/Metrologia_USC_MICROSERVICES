import { z } from 'zod';

// 1. Esquema para los Headers (Seguridad)
export const internalHeadersSchema = z.object({
  // Usamos .min(1) para garantizar que exista y no esté vacío
  'x-worker-secret': z.string().min(1, "El header de seguridad es obligatorio"), 
});

// 2. Esquema para el Body
export const emitirSocketBodySchema = z.object({
  evento: z.string().min(1, "El nombre del evento es obligatorio"),
  payload: z.any(), // Acepta cualquier objeto JSON que envíe el Worker
  room: z.string().optional(), // Opcional, por si se quiere hacer broadcast global
});
export type EmitirSocketBody = z.infer<typeof emitirSocketBodySchema>;

// 3. Esquemas de Respuesta
export const successResponseSchema = z.object({
  success: z.boolean(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});