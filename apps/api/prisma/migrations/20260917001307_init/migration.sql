-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'active', 'paused', 'done');

-- CreateEnum
CREATE TYPE "ProjectRole" AS ENUM ('creador', 'editor', 'visor', 'admin');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('baja', 'media', 'alta');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('activo', 'en_seguimiento', 'derivado', 'cerrado');

-- CreateEnum
CREATE TYPE "NeedCategory" AS ENUM ('salud', 'documentacion', 'abrigo', 'alimentacion', 'vivienda', 'laboral', 'otro');

-- CreateEnum
CREATE TYPE "NeedUrgency" AS ENUM ('inmediata', 'urgente', 'normal');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "KitchenBatchStatus" AS ENUM ('preparacion', 'coccion', 'listo_transporte', 'entregado');

-- CreateEnum
CREATE TYPE "CheckinType" AS ENUM ('en_camino', 'llegamos', 'entregando_viandas', 'relevando_caso');

-- CreateEnum
CREATE TYPE "FundTransactionType" AS ENUM ('ingreso', 'egreso');

-- CreateEnum
CREATE TYPE "FundMethod" AS ENUM ('transferencia', 'efectivo');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_url" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "diff" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "area" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_role" "ProjectRole" NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_columns" (
    "id" TEXT NOT NULL,
    "board_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "board_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "board_column_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'media',
    "due_date" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignees" (
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "task_assignees_pkey" PRIMARY KEY ("task_id","user_id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "case_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "alias" TEXT,
    "approx_age" INTEGER,
    "main_photo_url" TEXT,
    "health_status" TEXT,
    "current_sleep_spot" TEXT,
    "status" "CaseStatus" NOT NULL DEFAULT 'activo',
    "created_by" TEXT NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_contacts_history" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "mood_observed" TEXT,
    "contacted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_contacts_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_locations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recorded_by" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_photos" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploaded_by" TEXT NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_skills" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "skill_label" TEXT NOT NULL,
    "level" TEXT,

    CONSTRAINT "case_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_needs" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "category" "NeedCategory" NOT NULL,
    "urgency" "NeedUrgency" NOT NULL,
    "notes" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_status_history" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "from_status" "CaseStatus",
    "to_status" "CaseStatus" NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors_in_kind" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "type" TEXT NOT NULL,

    CONSTRAINT "donors_in_kind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_intakes" (
    "id" TEXT NOT NULL,
    "donor_id" TEXT,
    "received_by" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "destination_note" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "category" TEXT,
    "min_stock_alert" DECIMAL(65,30),

    CONSTRAINT "stock_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "reason" TEXT,
    "related_entity_type" TEXT,
    "related_entity_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_servings" INTEGER NOT NULL,
    "status" "KitchenBatchStatus" NOT NULL DEFAULT 'preparacion',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_batch_ingredients" (
    "batch_id" TEXT NOT NULL,
    "stock_item_id" TEXT NOT NULL,
    "quantity_assigned" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "kitchen_batch_ingredients_pkey" PRIMARY KEY ("batch_id","stock_item_id")
);

-- CreateTable
CREATE TABLE "kitchen_batch_assignees" (
    "batch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "task_label" TEXT,

    CONSTRAINT "kitchen_batch_assignees_pkey" PRIMARY KEY ("batch_id","user_id")
);

-- CreateTable
CREATE TABLE "kitchen_batch_status_history" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "to_status" "KitchenBatchStatus" NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_batch_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicle_label" TEXT,

    CONSTRAINT "field_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_team_members" (
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "field_team_members_pkey" PRIMARY KEY ("team_id","user_id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone_assignments" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "week_start_date" TIMESTAMP(3) NOT NULL,
    "week_end_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zone_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_id" TEXT,
    "type" "CheckinType" NOT NULL,
    "case_id" TEXT,
    "kitchen_batch_id" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_deliveries" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "item_label" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "field_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "payload" JSONB,
    "converted_to_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donors_monetary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "is_company" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "donors_monetary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_transactions" (
    "id" TEXT NOT NULL,
    "type" "FundTransactionType" NOT NULL,
    "method" "FundMethod" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "donor_id" TEXT,
    "origin_note" TEXT,
    "destination_project_id" TEXT,
    "executed_by" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fund_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_reports" (
    "id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "totals" JSONB NOT NULL,
    "generated_by" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "public_url" TEXT,

    CONSTRAINT "financial_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_slug_key" ON "permissions"("slug");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "cases_case_number_key" ON "cases"("case_number");

-- CreateIndex
CREATE INDEX "stock_movements_stock_item_id_idx" ON "stock_movements"("stock_item_id");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_board_column_id_fkey" FOREIGN KEY ("board_column_id") REFERENCES "board_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_contacts_history" ADD CONSTRAINT "case_contacts_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_locations" ADD CONSTRAINT "case_locations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_photos" ADD CONSTRAINT "case_photos_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_skills" ADD CONSTRAINT "case_skills_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_needs" ADD CONSTRAINT "case_needs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_status_history" ADD CONSTRAINT "case_status_history_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_intakes" ADD CONSTRAINT "donation_intakes_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors_in_kind"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_batch_ingredients" ADD CONSTRAINT "kitchen_batch_ingredients_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "kitchen_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_batch_ingredients" ADD CONSTRAINT "kitchen_batch_ingredients_stock_item_id_fkey" FOREIGN KEY ("stock_item_id") REFERENCES "stock_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_batch_assignees" ADD CONSTRAINT "kitchen_batch_assignees_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "kitchen_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_batch_status_history" ADD CONSTRAINT "kitchen_batch_status_history_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "kitchen_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_team_members" ADD CONSTRAINT "field_team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "field_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zone_assignments" ADD CONSTRAINT "zone_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "field_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "field_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_kitchen_batch_id_fkey" FOREIGN KEY ("kitchen_batch_id") REFERENCES "kitchen_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_deliveries" ADD CONSTRAINT "field_deliveries_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_donor_id_fkey" FOREIGN KEY ("donor_id") REFERENCES "donors_monetary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_transactions" ADD CONSTRAINT "fund_transactions_destination_project_id_fkey" FOREIGN KEY ("destination_project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

