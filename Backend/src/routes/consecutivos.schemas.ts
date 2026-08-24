import { z } from 'zod';

export const generarConsecutivoBodySchema = z.object({
  tipo: z.string(),
  codigoBaseExistente: z.string().optional(),
});
export type GenerarConsecutivoBody = z.infer<typeof generarConsecutivoBodySchema>;

export const respuestaConsecutivoSchema = z.object({
  codigo: z.string(),
});
export type RespuestaConsecutivo = z.infer<typeof respuestaConsecutivoSchema>;
