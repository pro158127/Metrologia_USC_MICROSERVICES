-- Identidad persistente por unidad física compartida por cotización, OT y recepción.
ALTER TABLE "cotizacion_detalles"
  ADD COLUMN "ID_UNIDADES" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

ALTER TABLE "orden_trabajo_detalles"
  ADD COLUMN "ID_UNIDAD_FK" UUID;

ALTER TABLE "recepcion_equipo_detalles"
  ADD COLUMN "ID_UNIDAD_FK" UUID;

-- Backfill de unidades cotizadas para que los registros existentes también
-- puedan enlazarse con los instrumentos que ya están en proceso.
UPDATE "cotizacion_detalles" d
SET "ID_UNIDADES" = ARRAY(
  SELECT gen_random_uuid()
  FROM generate_series(1, GREATEST(COALESCE(d."CANTIDAD", 1), 1))
)
WHERE cardinality(d."ID_UNIDADES") = 0;

-- Enlaza las líneas de OT con las unidades cotizadas usando servicio, nombre,
-- sitio y orden de ítem. Las cotizaciones mantienen una única fila por esa tupla.
WITH candidatos AS (
  SELECT
    ot_det."ID_DETALLE" AS id_detalle_ot,
    cot_det."ID_UNIDADES"[ROW_NUMBER() OVER (
      PARTITION BY ot_det."ID_ORDEN_TRABAJO_FK", cot_det."ID_DETALLE"
      ORDER BY ot_det."ITEM", ot_det."ID_DETALLE"
    )::int] AS id_unidad
  FROM "orden_trabajo_detalles" ot_det
  JOIN "ordenes_trabajo" ot ON ot."ID_ORDEN_TRABAJO" = ot_det."ID_ORDEN_TRABAJO_FK"
  JOIN "cotizacion_detalles" cot_det
    ON cot_det."ID_COTIZACION_FK" = ot."ID_COTIZACION_FK"
   AND lower(trim(cot_det."EQUIPO_DESCRIPCION")) = lower(trim(ot_det."INSTRUMENTO"))
   AND lower(trim(cot_det."TIPO_SERVICIO")) = lower(trim(ot_det."TIPO_SERVICIO"))
   AND COALESCE(cot_det."sitio"::text, 'LABORATORIO') = COALESCE(ot_det."sitio_calibracion"::text, 'LABORATORIO')
  WHERE ot_det."ID_UNIDAD_FK" IS NULL
    AND cot_det."activacion" = true
)
UPDATE "orden_trabajo_detalles" d
SET "ID_UNIDAD_FK" = c.id_unidad
FROM candidatos c
WHERE d."ID_DETALLE" = c.id_detalle_ot AND c.id_unidad IS NOT NULL;

-- La recepción ya se vincula a la OT y correlaciona los detalles por ITEM.
UPDATE "recepcion_equipo_detalles" rec_det
SET "ID_UNIDAD_FK" = ot_det."ID_UNIDAD_FK"
FROM "recepciones_equipo" rec, "orden_trabajo_detalles" ot_det
WHERE rec."ID_RECEPCION" = rec_det."ID_RECEPCION_FK"
  AND ot_det."ID_ORDEN_TRABAJO_FK" = rec."ID_ORDEN_TRABAJO_FK"
  AND ot_det."ITEM" = rec_det."ITEM"
  AND rec_det."ID_UNIDAD_FK" IS NULL
  AND ot_det."ID_UNIDAD_FK" IS NOT NULL;

-- Los registros independientes o con datos históricos incompletos reciben una
-- identidad propia; no se asume que coinciden con otra línea por su nombre.
UPDATE "orden_trabajo_detalles"
SET "ID_UNIDAD_FK" = gen_random_uuid()
WHERE "ID_UNIDAD_FK" IS NULL;

UPDATE "recepcion_equipo_detalles"
SET "ID_UNIDAD_FK" = gen_random_uuid()
WHERE "ID_UNIDAD_FK" IS NULL;

CREATE INDEX "orden_trabajo_detalles_ID_UNIDAD_FK_idx"
  ON "orden_trabajo_detalles"("ID_UNIDAD_FK");
CREATE INDEX "recepcion_equipo_detalles_ID_UNIDAD_FK_idx"
  ON "recepcion_equipo_detalles"("ID_UNIDAD_FK");
