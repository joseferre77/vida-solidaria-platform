-- Fase R: depósitos múltiples de stock (holder_user_id, NULL = depósito
-- central) + confirmación por email de quien es asignado a cocinar.
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "holder_user_id" TEXT;
CREATE INDEX IF NOT EXISTS "stock_movements_holder_user_id_idx" ON "stock_movements"("holder_user_id");

ALTER TABLE "kitchen_batch_assignees" ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3);
