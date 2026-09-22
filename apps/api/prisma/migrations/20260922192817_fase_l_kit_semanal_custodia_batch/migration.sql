-- Fase L — "Kit semanal": permite linkear un préstamo de equipamiento
-- reusable (StockCustody) a un lote de cocina (KitchenBatch), para armar el
-- kit (conservadora/olla + insumos) en un solo paso desde Cocina.

ALTER TABLE "stock_custody" ADD COLUMN "batch_id" TEXT;

CREATE INDEX "stock_custody_batch_id_idx" ON "stock_custody"("batch_id");

ALTER TABLE "stock_custody"
  ADD CONSTRAINT "stock_custody_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "kitchen_batches"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
