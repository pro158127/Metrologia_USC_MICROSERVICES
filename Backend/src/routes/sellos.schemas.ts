import { z } from 'zod';

export const selloDtoSchema = z.object({
  idSello: z.number(),
  nombre: z.string(),
  idDocumento: z.number(),
  estado: z.boolean(),
});
export type SelloDto = z.infer<typeof selloDtoSchema>;

export const selloRawToDtoSchema = z
  .object({
    ID_SELLO: z.number(),
    NOMBRE: z.string(),
    ID_DOCUMENTO_FK: z.number(),
    ESTADO: z.boolean(),
  })
  .transform(
    (raw): SelloDto => ({
      idSello: raw.ID_SELLO,
      nombre: raw.NOMBRE,
      idDocumento: raw.ID_DOCUMENTO_FK,
      estado: raw.ESTADO,
    })
  );

export const plantillaSelloDtoSchema = z.object({
  id: z.number(),
  nombre: z.string(),
  descripcion: z.string().nullable(),
  templatePdfKey: z.string().nullable(),
  templatePdfUrl: z.string().nullable(),
  templatePdfWidth: z.number().nullable(),
  templatePdfHeight: z.number().nullable(),
  documentArea: z.unknown().nullable(),
  watermarkAreas: z.unknown(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type PlantillaSelloDto = z.infer<typeof plantillaSelloDtoSchema>;

export const plantillaSelloRawToDtoSchema = z
  .object({
    ID_PLANTILLA_SELLO: z.number(),
    NOMBRE: z.string(),
    DESCRIPCION: z.string().nullish(),
    TEMPLATE_PDF_KEY: z.string().nullish(),
    DOCUMENT_AREA: z.unknown().nullish(),
    WATERMARK_AREAS: z.unknown().nullish(),
    CREATED_AT: z.coerce.date(),
    UPDATED_AT: z.coerce.date(),
  })
  .transform(
    (raw): PlantillaSelloDto => ({
      id: raw.ID_PLANTILLA_SELLO,
      nombre: raw.NOMBRE,
      descripcion: raw.DESCRIPCION ?? null,
      templatePdfKey: raw.TEMPLATE_PDF_KEY ?? null,
      templatePdfUrl: null,
      templatePdfWidth: null,
      templatePdfHeight: null,
      documentArea: raw.DOCUMENT_AREA ?? null,
      watermarkAreas: raw.WATERMARK_AREAS ?? [],
      createdAt: raw.CREATED_AT,
      updatedAt: raw.UPDATED_AT,
    })
  );

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string(),
});
export type JobIdParam = z.infer<typeof jobIdParamSchema>;

export const jobStatusDtoSchema = z.object({
  status: z.string(),
  jobId: z.string().nullish(),
  outputKey: z.string().nullish(),
  error: z.string().nullish(),
});
export type JobStatusDto = z.infer<typeof jobStatusDtoSchema>;

export const respuestaSellosSchema = z.object({
  ok: z.literal(true),
  data: z.array(selloDtoSchema),
});
export type RespuestaSellos = z.infer<typeof respuestaSellosSchema>;

export const respuestaPlantillasSellosSchema = z.object({
  ok: z.literal(true),
  data: z.array(plantillaSelloDtoSchema),
});
export type RespuestaPlantillasSellos = z.infer<typeof respuestaPlantillasSellosSchema>;

export const respuestaPlantillaSelloSchema = z.object({
  ok: z.literal(true),
  data: plantillaSelloDtoSchema,
});
export type RespuestaPlantillaSello = z.infer<typeof respuestaPlantillaSelloSchema>;

export const respuestaEliminacionSchema = z.object({
  ok: z.literal(true),
  data: z.object({ id: z.number() }),
});
export type RespuestaEliminacion = z.infer<typeof respuestaEliminacionSchema>;

export const respuestaStampSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    status: z.string(),
    jobId: z.string().nullish(),
  }),
});
export type RespuestaStamp = z.infer<typeof respuestaStampSchema>;

export const respuestaJobStatusSchema = z.object({
  ok: z.literal(true),
  data: jobStatusDtoSchema,
});
export type RespuestaJobStatus = z.infer<typeof respuestaJobStatusSchema>;
