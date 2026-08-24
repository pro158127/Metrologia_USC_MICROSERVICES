import { z } from 'zod';

export const metaListaSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type MetaLista = z.infer<typeof metaListaSchema>;
