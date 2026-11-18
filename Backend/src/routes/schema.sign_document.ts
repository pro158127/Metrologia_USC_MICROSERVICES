import { url } from 'inspector';
import { json, string, z } from 'zod';

// Esquema de entrada (Lo que envía el Frontend)
export const generarUrlBodySchema = z.object({
  s3Key: z.string().min(1, 'El s3Key no puede estar vacío (ej. cotizaciones_generadas/archivo.xlsx)'),
});

// Schema para parsear el JSON interno de la cotización

// Esquema de salida (Lo que responde el Backend)
export const generarUrlResponseSchema = z.object({
  ok: z.boolean().optional(),
  url:string().optional(),
  error:string().optional()
});

// Tipos inferidos de TypeScript (Útiles para usar en tus servicios o controladores)
export type GenerarUrlBody = z.infer<typeof generarUrlBodySchema>;
export type generarUrlResponseSchema = z.infer<typeof generarUrlResponseSchema>;
