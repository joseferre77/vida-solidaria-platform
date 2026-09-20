-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('individual', 'pareja', 'grupo_familiar');

-- CreateEnum
CREATE TYPE "StayType" AS ENUM ('calle', 'parador_temporal');

-- CreateEnum
CREATE TYPE "CaseViability" AS ENUM ('alta', 'media', 'baja');

-- CreateEnum
CREATE TYPE "CaseFeasibility" AS ENUM ('factible', 'no_factible', 'en_pausa');

-- AlterTable
ALTER TABLE "cases" ADD COLUMN     "case_type" "CaseType" NOT NULL DEFAULT 'individual',
ADD COLUMN     "close_reason" TEXT,
ADD COLUMN     "day_zone" TEXT,
ADD COLUMN     "dni" TEXT,
ADD COLUMN     "feasibility" "CaseFeasibility",
ADD COLUMN     "legal_situation" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "sex" TEXT,
ADD COLUMN     "stay_type" "StayType",
ADD COLUMN     "substance_use" TEXT,
ADD COLUMN     "viability" "CaseViability",
ADD COLUMN     "wants_to_work" BOOLEAN,
ADD COLUMN     "work_aptitude" TEXT;

