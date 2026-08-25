import { optional, z } from 'zod';
import { id } from 'zod/locales';

export const generarExcelBodySchema = z.object({
  tipo: z.number().int().positive(),
    id_registro: z.coerce.number().int().positive().optional(),
  codigo_actual: z.string().optional(), // 🔥 Opcional
  tipo_entry:z.enum(['test','prod']),
  id_job: z.string().optional(), // 🔥 Opcional
  action:z.enum(["cot_create,cot_update","ot_create"]).optional(),
  id_usuario:z.number().optional()
});
export type GenerarExcelBody = z.infer<typeof generarExcelBodySchema>;

// Respuesta del endpoint al encolar (HTTP 202)
export const respuestaGeneracionEncoladaSchema = z.object({
  ok: z.boolean(),
  id_job: z.string().optional(),
  mensaje: z.string(),
  error:z.string().optional()
});
export type RespuestaGeneracionEncolada = z.infer<typeof respuestaGeneracionEncoladaSchema>;

export type TemplateType = string;

export interface ScalarMapping {
  key: string;
  cell: string;
  dataType: string;
  sheet?: string;
}

export interface SubfieldMapping {
  key: string;
  column: string;
}

export interface ColumnMapping {
  key: string;
  column?: string;
  columnsList?: string[];
  dataType?: string;
  type?: 'OBJECT';
  subfields?: SubfieldMapping[];
}

export interface TableMapping {
  key: string;
  startRow: number;
  sheet?: string;
  star_header?: number;
  endRow?: number; // <-- Nueva variable
  columns: ColumnMapping[];
}

export interface MappingConfig {
  templateId: string | number;
  templateType: TemplateType | string;
  version: string;
  fileRef: string;
  mappings: {
    scalars: ScalarMapping[];
    tables: TableMapping[];
  };
}

// 2. Después los esquemas de Zod (ya reconocen 'ColumnMapping' sin problemas)
export const scalarMappingSchema = z.object({
  key: z.string(),
  cell: z.string(),
  dataType: z.string(),
  sheet: z.string().optional(),
});

export const subfieldMappingSchema = z.object({
  key: z.string(),
  column: z.string(),
});

export const columnMappingSchema: z.ZodType<ColumnMapping> = z.lazy(() => 
  z.object({
    key: z.string(),
    column: z.string().optional(),
    columnsList: z.array(z.string()).optional(),
    dataType: z.string().optional(),
    type: z.literal('OBJECT').optional(),
    subfields: z.array(subfieldMappingSchema).optional(),
  })
);

export const tableMappingSchema = z.object({
  key: z.string(),
  startRow: z.number(),
  sheet: z.string().optional(),
  star_header: z.number().optional(),
  columns: z.array(columnMappingSchema),
});

export const mappingConfigSchema = z.object({
  templateId: z.union([z.string(), z.number()]),
  templateType: z.string(),
  version: z.string(),
  fileRef: z.string(),
  mappings: z.object({
    scalars: z.array(scalarMappingSchema),
    tables: z.array(tableMappingSchema),
  }),
});