-- ============================================================================
-- Migración: Split Engine de OTs (Master/hijas) y sitio por detalle.
-- 1. orden_trabajo_detalles.sitio_calibracion (enum nullable).
-- 2. ordenes_trabajo.ID_OT_PADRE_FK (self FK Master -> hijas).
-- ============================================================================

BEGIN;

-- 1. sitio_calibracion en detalles de OT.
ALTER TABLE "orden_trabajo_detalles"
  ADD COLUMN IF NOT EXISTS "sitio_calibracion" "sitio_calibracion" DEFAULT 'LABORATORIO';

-- 2. Vínculo auto-referenciado Master -> hijas.
ALTER TABLE "ordenes_trabajo"
  ADD COLUMN IF NOT EXISTS "ID_OT_PADRE_FK" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_trabajo_ID_OT_PADRE_FK_fkey'
  ) THEN
    ALTER TABLE "ordenes_trabajo"
      ADD CONSTRAINT "ordenes_trabajo_ID_OT_PADRE_FK_fkey"
      FOREIGN KEY ("ID_OT_PADRE_FK") REFERENCES "ordenes_trabajo" ("ID_ORDEN_TRABAJO")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ordenes_trabajo_ID_OT_PADRE_FK_idx"
  ON "ordenes_trabajo" ("ID_OT_PADRE_FK");

COMMIT;
