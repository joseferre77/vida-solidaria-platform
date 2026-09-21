-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('kg', 'litros', 'unidades', 'paquetes', 'cajas');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "KitchenBatchStatus" ADD VALUE 'cocina_terminada';
ALTER TYPE "KitchenBatchStatus" ADD VALUE 'camino_punto_encuentro';

-- AlterTable
ALTER TABLE "kitchen_batches" ADD COLUMN     "responsible_user_id" TEXT;

-- AlterTable
ALTER TABLE "stock_items" DROP COLUMN "min_stock_alert",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_reusable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reorder_point" DECIMAL(65,30),
ADD COLUMN     "restock_target" DECIMAL(65,30),
ADD COLUMN     "unit_cost" DECIMAL(65,30),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
DROP COLUMN "unit",
ADD COLUMN     "unit" "StockUnit" NOT NULL;

-- CreateTable
CREATE TABLE "stock_custody" (
    "id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "holder_user_id" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "checked_out_by" TEXT NOT NULL,
    "checked_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),
    "returned_notes" TEXT,

    CONSTRAINT "stock_custody_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "type" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_custody_stock_item_id_idx" ON "stock_custody"("stock_item_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_items_code_key" ON "stock_items"("code");

-- AddForeignKey
ALTER TABLE "stock_custody" ADD CONSTRAINT "stock_custody_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

