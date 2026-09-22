-- CreateEnum
CREATE TYPE "TeamFunction" AS ENUM ('relevo', 'extraccion', 'despacho_comida', 'despacho_bebida', 'despacho_infusion', 'general');

-- AlterTable
ALTER TABLE "field_team_members" ADD COLUMN     "functions" "TeamFunction"[] DEFAULT ARRAY[]::"TeamFunction"[];

-- AlterTable
ALTER TABLE "field_teams" ADD COLUMN     "coordinator_user_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "available_days" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "available_hours" TEXT,
ADD COLUMN     "birth_date" TIMESTAMP(3),
ADD COLUMN     "cv_url" TEXT,
ADD COLUMN     "phone_alt" TEXT,
ADD COLUMN     "sex" TEXT,
ADD COLUMN     "skills" TEXT;
