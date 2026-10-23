import { z } from 'zod';

export const filtrosExportarSchema = z.object({
  usuario: z.string().nullish(),
  modulo: z.string().nullish(),
  rol: z.string().nullish(),
  fecha: z.string().nullish(),
});
export type FiltrosExportar = z.infer<typeof filtrosExportarSchema>;

export const consultarBitacoraQuerySchema = z.object({
  tableName: z.string().nullish(),
  recordId: z.string().nullish(),
  action: z.string().nullish(),
  userId: z.coerce.number().nullish(),
  desde: z.coerce.date().nullish(),
  hasta: z.coerce.date().nullish(),
  page: z.coerce.number().nullish(),
  limit: z.coerce.number().nullish(),
});
export type ConsultarBitacoraQuery = z.infer<typeof consultarBitacoraQuerySchema>;

export const bitacoraItemSchema = z.object({
  id: z.number(),
  action: z.string(),
  tableName: z.string(),
  recordId: z.string(),
  userId: z.number().nullable(),
  createdAt: z.coerce.date(),
  details: z.unknown(),
  ip: z.string(),
  usuario: z
    .object({
      idUsuario: z.number(),
      nombreCompleto: z.string(),
      rol: z.string().nullable(),
    })
    .nullable(),
});
export type BitacoraItem = z.infer<typeof bitacoraItemSchema>;

export const respuestaBitacoraSchema = z.object({
  ok: z.literal(true),
  data: z.array(bitacoraItemSchema),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    totalPages: z.number(),
  }),
});
export type RespuestaBitacora = z.infer<typeof respuestaBitacoraSchema>;

