-- Fase M — chat de coordinadores: un solo canal interno.
CREATE TABLE "coordinator_messages" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coordinator_messages_created_at_idx" ON "coordinator_messages"("created_at");

ALTER TABLE "coordinator_messages"
  ADD CONSTRAINT "coordinator_messages_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
