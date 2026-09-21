-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";
-- AlterTable
ALTER TABLE "case_photos" ADD COLUMN     "case_member_id" TEXT;
-- AddForeignKey
ALTER TABLE "case_photos" ADD CONSTRAINT "case_photos_case_member_id_fkey" FOREIGN KEY ("case_member_id") REFERENCES "case_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
