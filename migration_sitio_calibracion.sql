-- ============================================================================
-- Migración: sitio de calibración como enum nativo (LABORATORIO / CLIENTE)
-- Alinear `cotizacion_detalles.sitio`, `recepciones_equipo.SITIO_CALIBRACION`
-- y agregar `ordenes_trabajo.SITIO_CALIBRACION`.
-- ============================================================================

BEGIN;

-- 1. Crear el enum (idempotente).
DO $$
BEGIN
  CREATE TYPE "sitio_calibracion" AS ENUM ('LABORATORIO', 'CLIENTE');
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 2. cotizacion_detalles.sitio (TEXT -> enum).
ALTER TABLE "cotizacion_detalles" ALTER COLUMN "sitio" DROP DEFAULT;
UPDATE "cotizacion_detalles"
   SET "sitio" = CASE
                   WHEN UPPER("sitio") LIKE 'CLI%' THEN 'CLIENTE'
                   ELSE 'LABORATORIO'
                 END
 WHERE "sitio" IS NULL OR "sitio" NOT IN ('LABORATORIO', 'CLIENTE');
ALTER TABLE "cotizacion_detalles"
  ALTER COLUMN "sitio" TYPE "sitio_calibracion"
  USING ("sitio"::"sitio_calibracion");
ALTER TABLE "cotizacion_detalles" ALTER COLUMN "sitio" SET DEFAULT 'LABORATORIO';

-- 3. ordenes_trabajo: agregar clave canónica de sitio.
ALTER TABLE "ordenes_trabajo"
  ADD COLUMN IF NOT EXISTS "SITIO_CALIBRACION" "sitio_calibracion" DEFAULT 'LABORATORIO';
UPDATE "ordenes_trabajo"
   SET "SITIO_CALIBRACION" = CASE WHEN "ES_EN_SITIO" THEN 'CLIENTE' ELSE 'LABORATORIO' END;

-- 4. recepciones_equipo.SITIO_CALIBRACION (TEXT NOT NULL -> enum).
UPDATE "recepciones_equipo"
   SET "SITIO_CALIBRACION" = CASE
                               WHEN UPPER("SITIO_CALIBRACION") LIKE 'CLI%' THEN 'CLIENTE'
                               ELSE 'LABORATORIO'
                             END;
ALTER TABLE "recepciones_equipo"
  ALTER COLUMN "SITIO_CALIBRACION" TYPE "sitio_calibracion"
  USING ("SITIO_CALIBRACION"::"sitio_calibracion");
ALTER TABLE "recepciones_equipo" ALTER COLUMN "SITIO_CALIBRACION" SET DEFAULT 'LABORATORIO';

COMMIT;
