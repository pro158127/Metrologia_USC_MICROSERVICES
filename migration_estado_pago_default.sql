-- ============================================================================
-- Migración: estado de pago de la OT por defecto = PENDINDE.
-- El default anterior era PAGADO, lo que hacía que toda OT nueva naciera como
-- "pagada" y disparara prematuramente el estado "Certificado_enviado".
-- Se cambia el default para que el pago se marque de forma explícita.
-- ============================================================================

BEGIN;

ALTER TABLE "ordenes_trabajo"
  ALTER COLUMN "estado_pago" SET DEFAULT 'PENDINDE';

-- Normaliza los valores NULL heredados (nunca debieron quedar vacíos).
UPDATE "ordenes_trabajo"
   SET "estado_pago" = 'PENDINDE'
 WHERE "estado_pago" IS NULL;

COMMIT;
