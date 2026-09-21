-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CheckinType" ADD VALUE 'presente_punto_encuentro';
ALTER TYPE "CheckinType" ADD VALUE 'presente_zona';

-- AlterTable
ALTER TABLE "field_team_members" DROP CONSTRAINT "field_team_members_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "week_start_date" TIMESTAMP(3) NOT NULL,
ADD CONSTRAINT "field_team_members_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "weekly_availabilities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "will_attend" BOOLEAN NOT NULL,
    "reason" TEXT,
    "confirmed_present" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_availabilities_user_id_week_start_date_key" ON "weekly_availabilities"("user_id", "week_start_date");

-- CreateIndex
CREATE UNIQUE INDEX "field_team_members_team_id_user_id_week_start_date_key" ON "field_team_members"("team_id", "user_id", "week_start_date");

