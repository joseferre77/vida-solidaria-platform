-- Fase P: tabla de configuración clave/valor.
-- IMPORTANTE: usa IF NOT EXISTS porque esta tabla ya existe en la base de
-- producción (creada por una migración de un intento anterior que nunca se
-- comiteó al repo — ver notas en schema.prisma). Columnas idénticas a las
-- que ya tiene la tabla real hoy (introspectadas directo de producción).
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
