import { z } from 'zod';

export const parametroSistemaDtoSchema = z.object({
  idParametro: z.number(),
  clave: z.string(),
  codigoScript: z.string().nullable(),
  frecuencia: z.string(),
  expresionCron: z.string().nullable(),
  proximaEjecucion: z.coerce.date().nullable(),
  ultimaEjecucion: z.coerce.date().nullable(),
});
export type ParametroSistemaDto = z.infer<typeof parametroSistemaDtoSchema>;

export const parametroSistemaRawToDtoSchema = z
  .object({
    ID_PARAMETRO: z.number(),
    CLAVE: z.string(),
    CODIGO_SCRIPT: z.string().nullish(),
    FRECUENCIA: z.string(),
    EXPRESION_CRON: z.string().nullish(),
    PROXIMA_EJECUCION: z.coerce.date().nullish(),
    ULTIMA_EJECUCION: z.coerce.date().nullish(),
  })
  .transform(
    (raw): ParametroSistemaDto => ({
      idParametro: raw.ID_PARAMETRO,
      clave: raw.CLAVE,
      codigoScript: raw.CODIGO_SCRIPT ?? null,
      frecuencia: raw.FRECUENCIA,
      expresionCron: raw.EXPRESION_CRON ?? null,
      proximaEjecucion: raw.PROXIMA_EJECUCION ?? null,
      ultimaEjecucion: raw.ULTIMA_EJECUCION ?? null,
    })
  );
export type ParametroSistemaRaw = z.input<typeof parametroSistemaRawToDtoSchema>;

export const respuestaListaParametrosSchema = z.object({
  ok: z.literal(true),
  data: z.array(parametroSistemaDtoSchema),
});
export type RespuestaListaParametros = z.infer<typeof respuestaListaParametrosSchema>;
