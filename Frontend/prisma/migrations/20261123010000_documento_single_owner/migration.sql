-- A documento can have only one direct owner/category FK. Certificates,
-- invoices and client RUTs use their owning tables' ID_DOCUMENTO_FK instead.
-- NOT VALID preserves existing development rows while enforcing all new writes.
ALTER TABLE "documentos"
  ADD CONSTRAINT "documentos_single_direct_owner_check"
  CHECK (num_nonnulls(
    "ID_COTIZACION_FK",
    "ID_ORDEN_TRABAJO_FK",
    "ID_RECEPCION_FK",
    "ID_PLANTILLA_FK",
    "ordenPagoId"
  ) <= 1) NOT VALID;

CREATE UNIQUE INDEX "certificados_ID_DOCUMENTO_FK_key"
  ON "certificados"("ID_DOCUMENTO_FK");
