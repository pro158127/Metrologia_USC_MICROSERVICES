import { z } from 'zod';

export const documentoDtoSchema = z.object({
  idDocumento: z.number(),
  nombre: z.string(),
  rutaUrl: z.string(),
  proveedor: z.string(),
  mimeType: z.string(),
});
export type DocumentoDto = z.infer<typeof documentoDtoSchema>;

export const documentoConFechaDtoSchema = documentoDtoSchema.extend({
  createdAt: z.coerce.date(),
});
export type DocumentoConFechaDto = z.infer<typeof documentoConFechaDtoSchema>;

export const documentoRawToDtoSchema = z
  .object({
    ID_DOCUMENTO: z.number(),
    NOMBRE: z.string(),
    RUTA_URL: z.string(),
    PROVEEDOR: z.string(),
    MIME_TYPE: z.string(),
  })
  .transform(
    (raw): DocumentoDto => ({
      idDocumento: raw.ID_DOCUMENTO,
      nombre: raw.NOMBRE,
      rutaUrl: raw.RUTA_URL,
      proveedor: raw.PROVEEDOR,
      mimeType: raw.MIME_TYPE,
    })
  );

export const documentoConFechaRawToDtoSchema = z
  .object({
    ID_DOCUMENTO: z.number(),
    NOMBRE: z.string(),
    RUTA_URL: z.string(),
    PROVEEDOR: z.string(),
    MIME_TYPE: z.string(),
    CREATED_AT: z.coerce.date(),
  })
  .transform(
    (raw): DocumentoConFechaDto => ({
      idDocumento: raw.ID_DOCUMENTO,
      nombre: raw.NOMBRE,
      rutaUrl: raw.RUTA_URL,
      proveedor: raw.PROVEEDOR,
      mimeType: raw.MIME_TYPE,
      createdAt: raw.CREATED_AT,
    })
  );

export const versionActualDtoSchema = z.object({
  idVersionPlantilla: z.number(),
  version: z.number(),
  mapeoExcelJson: z.unknown().nullable(),
  inputSchema: z.unknown().nullable(),
  mappingConfig: z.unknown().nullable(),
  createdAt: z.coerce.date(),
  documento: documentoDtoSchema.nullable(),
});
export type VersionActualDto = z.infer<typeof versionActualDtoSchema>;

export const versionActualRawToDtoSchema = z
  .object({
    ID_VERSION_PLANTILLA: z.number(),
    VERSION: z.number(),
    MAPEO_EXCEL_JSON: z.unknown().nullish(),
    INPUT_SCHEMA: z.unknown().nullish(),
    MAPPING_CONFIG: z.unknown().nullish(),
    CREATED_AT: z.coerce.date(),
    documentos: documentoRawToDtoSchema.nullish(),
  })
  .transform(
    (raw): VersionActualDto => ({
      idVersionPlantilla: raw.ID_VERSION_PLANTILLA,
      version: raw.VERSION,
      mapeoExcelJson: raw.MAPEO_EXCEL_JSON ?? null,
      inputSchema: raw.INPUT_SCHEMA ?? null,
      mappingConfig: raw.MAPPING_CONFIG ?? null,
      createdAt: raw.CREATED_AT,
      documento: raw.documentos ?? null,
    })
  );

export const plantillaConDocumentoDtoSchema = z.object({
  idPlantilla: z.number(),
  nombre: z.string(),
  modulo: z.string(),
  activa: z.boolean(),
  versionActual: versionActualDtoSchema.nullable(),
});
export type PlantillaConDocumentoDto = z.infer<typeof plantillaConDocumentoDtoSchema>;

export const plantillaConDocumentoRawToDtoSchema = z
  .object({
    ID_PLANTILLA: z.number(),
    NOMBRE: z.string(),
    MODULO: z.string(),
    ACTIVA: z.boolean(),
    version_plantillas: z.array(versionActualRawToDtoSchema),
  })
  .transform(
    (raw): PlantillaConDocumentoDto => ({
      idPlantilla: raw.ID_PLANTILLA,
      nombre: raw.NOMBRE,
      modulo: raw.MODULO,
      activa: raw.ACTIVA,
      versionActual: raw.version_plantillas[0] ?? null,
    })
  );

export const versionCompletaDtoSchema = z.object({
  idVersionPlantilla: z.number(),
  idPlantilla: z.number(),
  version: z.number(),
  mapeoExcelJson: z.unknown().nullable(),
  inputSchema: z.unknown().nullable(),
  mappingConfig: z.unknown().nullable(),
  createdby: z.object({ nombre: z.string() }),
  createdAt: z.coerce.date(),
  iddocumentos: z.number().nullable(),
  documento: documentoConFechaDtoSchema.nullable(),
});
export type VersionCompletaDto = z.infer<typeof versionCompletaDtoSchema>;

export const versionCompletaRawToDtoSchema = z
  .object({
    ID_VERSION_PLANTILLA: z.number(),
    ID_PLANTILLA_FK: z.number(),
    VERSION: z.number(),
    MAPEO_EXCEL_JSON: z.unknown().nullish(),
    INPUT_SCHEMA: z.unknown().nullish(),
    MAPPING_CONFIG: z.unknown().nullish(),
    CREATED_AT: z.coerce.date(),
    ID_DOCUMENTOS_FK: z.number().nullish(),
    documentos: documentoConFechaRawToDtoSchema.nullish(),
    usuarios: z.object({ NOMBRE_COMPLETO: z.string() }).nullish(),
  })
  .transform(
    (raw): VersionCompletaDto => ({
      idVersionPlantilla: raw.ID_VERSION_PLANTILLA,
      idPlantilla: raw.ID_PLANTILLA_FK,
      version: raw.VERSION,
      mapeoExcelJson: raw.MAPEO_EXCEL_JSON ?? null,
      inputSchema: raw.INPUT_SCHEMA ?? null,
      mappingConfig: raw.MAPPING_CONFIG ?? null,
      createdby: { nombre: raw.usuarios?.NOMBRE_COMPLETO || '' },
      createdAt: raw.CREATED_AT,
      iddocumentos: raw.ID_DOCUMENTOS_FK ?? null,
      documento: raw.documentos ?? null,
    })
  );

export const plantillaCompletaDtoSchema = z.object({
  idPlantilla: z.number(),
  nombre: z.string(),
  modulo: z.string(),
  activa: z.boolean(),
  versiones: z.array(versionCompletaDtoSchema),
});
export type PlantillaCompletaDto = z.infer<typeof plantillaCompletaDtoSchema>;

export const plantillaCompletaRawToDtoSchema = z
  .object({
    ID_PLANTILLA: z.number(),
    NOMBRE: z.string(),
    MODULO: z.string(),
    ACTIVA: z.boolean(),
    version_plantillas: z.array(versionCompletaRawToDtoSchema),
  })
  .transform(
    (raw): PlantillaCompletaDto => ({
      idPlantilla: raw.ID_PLANTILLA,
      nombre: raw.NOMBRE,
      modulo: raw.MODULO,
      activa: raw.ACTIVA,
      versiones: raw.version_plantillas,
    })
  );

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

export const snapshotParamsSchema = z.object({
  id: z.coerce.number(),
  versionId: z.coerce.number(),
});
export type SnapshotParams = z.infer<typeof snapshotParamsSchema>;

export const versionIdParamSchema = z.object({
  versionId: z.coerce.number(),
});
export type VersionIdParam = z.infer<typeof versionIdParamSchema>;

export const jobIdParamSchema = z.object({
  jobId: z.string(),
});
export type JobIdParam = z.infer<typeof jobIdParamSchema>;

export const detallePlantillaQuerySchema = z.object({
  version: z.coerce.number().nullish(),
});
export type DetallePlantillaQuery = z.infer<typeof detallePlantillaQuerySchema>;

export const actualizarMappingBodySchema = z.object({
  version: z.number().optional(),
  mappingConfig: z.unknown().optional(),
  inputSchema: z.unknown().optional(),
});
export type ActualizarMappingBody = z.infer<typeof actualizarMappingBodySchema>;

export const versionPlantillaRawSchema = z.object({
  ID_VERSION_PLANTILLA: z.number(),
  ID_PLANTILLA_FK: z.number(),
  VERSION: z.number(),
  MAPEO_EXCEL_JSON: z.unknown().nullable(),
  INPUT_SCHEMA: z.unknown().nullable(),
  MAPPING_CONFIG: z.unknown().nullable(),
  ID_USUARIO_CREADOR_FK: z.number(),
  CREATED_AT: z.coerce.date(),
  ID_DOCUMENTOS_FK: z.number().nullable(),
});
export type VersionPlantillaRaw = z.infer<typeof versionPlantillaRawSchema>;

export const nuevaVersionDtoSchema = z.object({
  idVersionPlantilla: z.number(),
  idPlantilla: z.number(),
  version: z.number(),
  inputSchema: z.unknown().nullable(),
  mappingConfig: z.unknown().nullable(),
  createdAt: z.coerce.date(),
  documento: documentoDtoSchema.nullable(),
});
export type NuevaVersionDto = z.infer<typeof nuevaVersionDtoSchema>;

export const snapshotDtoSchema = z.object({
  status: z.string(),
  snapshot: z.unknown().nullish(),
  jobId: z.string().nullish(),
});
export type SnapshotDto = z.infer<typeof snapshotDtoSchema>;

export const snapshotJobStatusDtoSchema = z.object({
  status: z.string(),
  jobId: z.string().nullish(),
  snapshot: z.unknown().nullish(),
  error: z.string().nullish(),
});
export type SnapshotJobStatusDto = z.infer<typeof snapshotJobStatusDtoSchema>;

export const respuestaPlantillaSchema = z.object({
  success: z.literal(true),
  data: plantillaConDocumentoDtoSchema,
});
export type RespuestaPlantilla = z.infer<typeof respuestaPlantillaSchema>;

export const respuestaListaPlantillasSchema = z.object({
  success: z.literal(true),
  data: z.array(plantillaCompletaDtoSchema),
});
export type RespuestaListaPlantillas = z.infer<typeof respuestaListaPlantillasSchema>;

export const respuestaSnapshotSchema = z.object({
  success: z.literal(true),
  data: snapshotDtoSchema,
});
export type RespuestaSnapshot = z.infer<typeof respuestaSnapshotSchema>;

export const respuestaSnapshotJobStatusSchema = z.object({
  success: z.literal(true),
  data: snapshotJobStatusDtoSchema,
});
export type RespuestaSnapshotJobStatus = z.infer<typeof respuestaSnapshotJobStatusSchema>;

export const respuestaMappingSchema = z.object({
  success: z.literal(true),
  data: versionPlantillaRawSchema,
});
export type RespuestaMapping = z.infer<typeof respuestaMappingSchema>;

export const respuestaNuevaVersionSchema = z.object({
  success: z.literal(true),
  data: nuevaVersionDtoSchema,
});
export type RespuestaNuevaVersion = z.infer<typeof respuestaNuevaVersionSchema>;
