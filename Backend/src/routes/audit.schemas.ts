import { z } from 'zod';

export const filtrosExportarSchema = z.object({
  usuario: z.string().nullish(),
  modulo: z.string().nullish(),
  rol: z.string().nullish(),
  fecha: z.string().nullish(),
});
export type FiltrosExportar = z.infer<typeof filtrosExportarSchema>;
