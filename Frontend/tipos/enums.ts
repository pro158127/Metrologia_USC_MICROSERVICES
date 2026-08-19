// ============================================================
// enums.ts
// Enums y uniones de tipos locales (espejo del schema Prisma)
// para desacoplar el frontend de `@prisma/client`.
// ============================================================

export enum Estados {
  BORRADOR = 'BORRADOR',
  ENVIADA = 'ENVIADA',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  EN_SEGUIMIENTO = 'EN_SEGUIMIENTO',
}

export type statuscliente = 'ACTIVO' | 'INACTIVO';

export type tipocliente = 'NATURAL' | 'JURIDICO';

export type ProveedorAlmacenamiento = 'LOCAL' | 'AWS_S3' | 'GOOGLE_DRIVE';

export type FrecuenciaEjecucion = 'UNA_VEZ' | 'DIARIA' | 'SEMANAL' | 'PROGRAMADA_CRON';

export type EstadoOT =
  | 'Creada'
  | 'En_recepción'
  | 'Asignada'
  | 'En_calibración'
  | 'Certificado_en_revisión'
  | 'Certificado_aprobado'
  | 'Certificado_enviado';

export type estadopay = 'PAGADO' | 'PENDINDE' | 'VENCIDA';
