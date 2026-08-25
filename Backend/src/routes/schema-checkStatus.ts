// 1. Definición del Esquema Zod para la validación de parámetros de ruta

import { boolean, string, z } from 'zod';
export const quoteIdSchema = z.object({
  id: z.string()
});
export const urls_schema = z.object({
  url_pdf: z.string().optional(),
    excel: z.string().optional(),
    imagenes:z.string().optional()
  // agrega aquí otras propiedades si existen en el JSON de 'data'
});
export const responseQuote=z.object({
error:z.string().optional(),
urls:urls_schema.optional(),
ok:boolean(),
estado:string().optional()
})
// Tipo inferido para TypeScript
export type QuoteIdParams = z.infer<typeof quoteIdSchema>;
export type responseQuote=z.infer<typeof responseQuote>;
export type  url=z.infer<typeof urls_schema>