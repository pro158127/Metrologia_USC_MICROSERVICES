ALTER TABLE "seguimientos_comerciales"
  ADD COLUMN IF NOT EXISTS "ORIGEN" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS "ELIMINADO_AT" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ELIMINADO_POR" INTEGER,
  ADD COLUMN IF NOT EXISTS "ELIMINACION_MOTIVO" TEXT;

-- Marcar solo los formatos emitidos por los productores automáticos conocidos.
-- El resto se conserva como MANUAL para evitar clasificaciones especulativas.
UPDATE "seguimientos_comerciales"
SET "ORIGEN" = 'SISTEMA'
WHERE ("RESULTADO" = 'RECHAZADO' AND "DESCRIPCION" LIKE 'Certificado % rechazado:%')
   OR ("RESULTADO" = 'VENCIDA' AND "DESCRIPCION" LIKE 'Pago vencido%')
   OR ("RESULTADO" = 'ENTREGA_COMPLETA' AND "DESCRIPCION" LIKE 'Cierre de entrega completado para la cotización%');
