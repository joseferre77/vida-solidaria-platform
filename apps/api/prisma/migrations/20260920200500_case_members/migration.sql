-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- AlterTable
ALTER TABLE "case_needs" ADD COLUMN     "case_member_id" TEXT;

-- AlterTable
ALTER TABLE "case_skills" ADD COLUMN     "case_member_id" TEXT;

-- CreateTable
CREATE TABLE "case_members" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "alias" TEXT,
    "approx_age" INTEGER,
    "dni" TEXT,
    "sex" TEXT,
    "health_status" TEXT,
    "wants_to_work" BOOLEAN,
    "work_aptitude" TEXT,
    "legal_situation" TEXT,
    "substance_use" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_members_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "case_members" ADD CONSTRAINT "case_members_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_skills" ADD CONSTRAINT "case_skills_case_member_id_fkey" FOREIGN KEY ("case_member_id") REFERENCES "case_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_needs" ADD CONSTRAINT "case_needs_case_member_id_fkey" FOREIGN KEY ("case_member_id") REFERENCES "case_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

