-- Fase Q: autorregistro con confirmación de email desde /login.
-- Nullable a propósito: cuentas activas creadas antes de este campo
-- quedan con NULL y el login no depende de esta columna, solo de status.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);
