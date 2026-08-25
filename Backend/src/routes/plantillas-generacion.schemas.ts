import { z } from 'zod';

export const generarExcelBodySchema = z.object({
  tipo: z.enum(['COTIZACION', 'ORDEN_TRABAJO', 'RECEPCION']),
  id: z.coerce.number().int().positive(),
  plantillaId: z.coerce.number().int().positive().optional(),
  version: z.coerce.number().int().positive().optional(),
  returnAs: z.enum(['stream', 'url']).default('stream'),
  fileName: z.string().min(1).optional(),
});
export type GenerarExcelBody = z.infer<typeof generarExcelBodySchema>;

export const generarExcelUrlDtoSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    outputKey: z.string(),
    url: z.string(),
    fileName: z.string(),
  }),
});
export type GenerarExcelUrlDto = z.infer<typeof generarExcelUrlDtoSchema>;
