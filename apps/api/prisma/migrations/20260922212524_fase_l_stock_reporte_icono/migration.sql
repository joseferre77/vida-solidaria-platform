-- Bloque "Stock — reporte y grilla visual": ícono/emoji opcional por
-- insumo, para la vista rápida tipo TPV (tarjetas con ícono en vez de
-- solo texto).

ALTER TABLE "stock_items" ADD COLUMN "icon" TEXT;
