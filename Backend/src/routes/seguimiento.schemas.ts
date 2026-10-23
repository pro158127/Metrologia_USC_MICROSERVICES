import { z } from 'zod';
import { metaListaSchema } from '../schemas/comunes.js';

// ============================================================
// ENUMS / CONSTANTES
// ============================================================
export const tipoSeguimientoEnum = z.enum(['LLAMADA', 'CORREO', 'REUNION', 'OTRO']);
export type TipoSeguimientoZod = z.infer<typeof tipoSeguimientoEnum>;

// ============================================================
// INPUTS
// ============================================================
export const crearSeguimientoBodySchema = z.object({
  idCotizacion: z.number(),
  tipo: tipoSeguimientoEnum,
  descripcion: z.string().min(1, 'La descripción es requerida'),
  fechaGestion: z.coerce.date().optional(),
  proximaGestion: z.coerce.date().nullish(),
  resultado: z.string().nullish(),
  idUsuario: z.number().nullish(),
});
export type CrearSeguimientoBody = z.infer<typeof crearSeguimientoBodySchema>;

export const actualizarSeguimientoBodySchema = z.object({
  tipo: tipoSeguimientoEnum.optional(),
  descripcion: z.string().min(1).optional(),
  fechaGestion: z.coerce.date().optional(),
  proximaGestion: z.coerce.date().nullish(),
  resultado: z.string().nullish(),
  idUsuario: z.number().nullish(),
});
export type ActualizarSeguimientoBody = z.infer<typeof actualizarSeguimientoBodySchema>;

export const listarSeguimientosQuerySchema = z.object({
  idCotizacion: z.coerce.number().nullish(),
  page: z.coerce.number().nullish(),
  limit: z.coerce.number().nullish(),
});
export type ListarSeguimientosQuery = z.infer<typeof listarSeguimientosQuerySchema>;

export const idParamSchema = z.object({
  id: z.coerce.number(),
});
export type IdParam = z.infer<typeof idParamSchema>;

// ============================================================
// OUTPUT DTO (camelCase)
// ============================================================
export const usuarioDtoSchema = z.object({
  idUsuario: z.number(),
  nombreCompleto: z.string(),
  correo: z.string(),
});
export type UsuarioDto = z.infer<typeof usuarioDtoSchema>;

export const seguimientoDtoSchema = z.object({
  idSeguimiento: z.number(),
  idCotizacion: z.number(),
  tipo: z.string(),
  descripcion: z.string(),
  fechaGestion: z.coerce.date(),
  proximaGestion: z.coerce.date().nullable(),
  resultado: z.string().nullable(),
  idUsuario: z.number().nullable(),
  createdAt: z.coerce.date(),
  usuario: usuarioDtoSchema.nullable(),
});
export type SeguimientoDto = z.infer<typeof seguimientoDtoSchema>;

// ============================================================
// TRANSFORMS (RAW DB -> DTO)
// ============================================================
export const usuarioRawToDtoSchema = z
  .object({
    ID_USUARIO_AUTO_INCREMENT: z.number(),
    NOMBRE_COMPLETO: z.string(),
    CORREO_INSTITUCION: z.string(),
  })
  .transform((raw): UsuarioDto => ({
    idUsuario: raw.ID_USUARIO_AUTO_INCREMENT,
    nombreCompleto: raw.NOMBRE_COMPLETO,
    correo: raw.CORREO_INSTITUCION,
  }));

export const seguimientoRawToDtoSchema = z
  .object({
    ID_SEGUIMIENTO: z.number(),
    ID_COTIZACION_FK: z.number(),
    TIPO: z.string(),
    DESCRIPCION: z.string(),
    FECHA_GESTION: z.coerce.date(),
    PROXIMA_GESTION: z.coerce.date().nullish(),
    RESULTADO: z.string().nullish(),
    ID_USUARIO_FK: z.number().nullish(),
    CREATED_AT: z.coerce.date(),
    usuarios: usuarioRawToDtoSchema.nullish(),
  })
  .transform((raw): SeguimientoDto => ({
    idSeguimiento: raw.ID_SEGUIMIENTO,
    idCotizacion: raw.ID_COTIZACION_FK,
    tipo: raw.TIPO,
    descripcion: raw.DESCRIPCION,
    fechaGestion: raw.FECHA_GESTION,
    proximaGestion: raw.PROXIMA_GESTION ?? null,
    resultado: raw.RESULTADO ?? null,
    idUsuario: raw.ID_USUARIO_FK ?? null,
    createdAt: raw.CREATED_AT,
    usuario: raw.usuarios ?? null,
  }));

// ============================================================
// RESPONSES
// ============================================================
export const respuestaSeguimientoSchema = z.object({
  ok: z.literal(true),
  data: seguimientoDtoSchema,
});
export type RespuestaSeguimiento = z.infer<typeof respuestaSeguimientoSchema>;

export const respuestaListaSeguimientosSchema = z.object({
  ok: z.literal(true),
  data: z.array(seguimientoDtoSchema),
  meta: metaListaSchema,
});
export type RespuestaListaSeguimientos = z.infer<typeof respuestaListaSeguimientosSchema>;
