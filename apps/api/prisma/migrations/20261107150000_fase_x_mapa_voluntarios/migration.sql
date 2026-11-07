-- Fase X: mapa de voluntarios (pedido de Josecito 07/11/2026). Agrega
-- coordenadas a los usuarios (completadas por geocodificación automática de
-- su dirección ya cargada, gratis vía Nominatim/OpenStreetMap) y dos tablas
-- nuevas: puntos de operación de la ONG (acopio de ropa, cocina, etc. —
-- puede haber varios de cada categoría) y la configuración del punto donde
-- se cruzan las líneas que dividen el mapa en 4 cuadrantes visuales.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "lat" DOUBLE PRECISION,
                     ADD COLUMN "lng" DOUBLE PRECISION,
                     ADD COLUMN "geocoded_at" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "OperationalPointCategory" AS ENUM ('acopio_ropa', 'cocina', 'recepcion_comida', 'distribucion_ropa', 'feria', 'punto_encuentro', 'retiro_ropa', 'otro');

-- CreateTable
CREATE TABLE "operational_points" (
    "id" TEXT NOT NULL,
    "category" "OperationalPointCategory" NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "geocoded_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "center_lat" DOUBLE PRECISION NOT NULL,
    "center_lng" DOUBLE PRECISION NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_settings_pkey" PRIMARY KEY ("id")
);

-- Fila inicial de map_settings: mismo centro por defecto que ya usa el mapa
-- de Casos (CasosMap.tsx) para Mar del Plata — un punto de partida
-- razonable que Josecito puede mover arrastrando el pin hasta el punto de
-- encuentro real (Bv. Marítimo y Av. P. Peralta Ramos 2502) u otro que
-- prefiera, sin tocar código.
INSERT INTO "map_settings" ("id", "center_lat", "center_lng", "updated_at")
VALUES ('default', -38.0055, -57.5426, CURRENT_TIMESTAMP);
