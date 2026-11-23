-- Fail without modifying data if legacy duplicates need review. Resolve each
-- duplicate using ID_UNIDAD_FK and calibration history before rerunning.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM recepciones_equipo
    WHERE "VIGENTE" IS TRUE AND COALESCE(activacion, TRUE) IS TRUE
      AND "ID_ORDEN_TRABAJO_FK" IS NOT NULL
    GROUP BY "ID_ORDEN_TRABAJO_FK", COALESCE("SITIO_CALIBRACION"::text, 'LABORATORIO')
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM recepciones_equipo
    WHERE "VIGENTE" IS TRUE AND COALESCE(activacion, TRUE) IS TRUE
      AND "ID_ORDEN_TRABAJO_FK" IS NULL AND "ID_COTIZACION_FK" IS NOT NULL
    GROUP BY "ID_COTIZACION_FK", COALESCE("SITIO_CALIBRACION"::text, 'LABORATORIO')
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Resolve duplicate active receptions by OT/site or quote/site first, preserving instrument/calibration links.';
  END IF;
END $$;

CREATE UNIQUE INDEX uq_recepcion_vigente_ot_sitio
  ON recepciones_equipo ("ID_ORDEN_TRABAJO_FK", (COALESCE("SITIO_CALIBRACION"::text, 'LABORATORIO')))
  WHERE "VIGENTE" IS TRUE AND COALESCE(activacion, TRUE) IS TRUE AND "ID_ORDEN_TRABAJO_FK" IS NOT NULL;

CREATE UNIQUE INDEX uq_recepcion_vigente_cotizacion_sitio
  ON recepciones_equipo ("ID_COTIZACION_FK", (COALESCE("SITIO_CALIBRACION"::text, 'LABORATORIO')))
  WHERE "VIGENTE" IS TRUE AND COALESCE(activacion, TRUE) IS TRUE
    AND "ID_ORDEN_TRABAJO_FK" IS NULL AND "ID_COTIZACION_FK" IS NOT NULL;
