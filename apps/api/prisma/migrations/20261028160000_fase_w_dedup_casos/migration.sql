-- Fase W: clave de reintento para evitar casos duplicados cuando se pierde
-- la respuesta de POST /cases (mala señal en la calle, sesión que vence a
-- mitad de un relevamiento largo). Columna nullable — los casos cargados
-- antes de este cambio no la tienen, y no hace falta backfill.
ALTER TABLE "cases" ADD COLUMN "client_submission_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "cases_client_submission_id_key" ON "cases"("client_submission_id");
