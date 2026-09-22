/**
 * Aplica migraciones Prisma pendientes usando la conexión de Postgres YA
 * establecida por este mismo proceso, en vez de invocar `prisma migrate
 * deploy` (CLI) por SSH.
 *
 * Motivo (23/09/2026, Fase L): en este hosting compartido, un proceso node
 * nuevo lanzado ad-hoc por SSH (tanto `npx prisma migrate ...` como un
 * script node suelto usando @prisma/client) panickea al intentar conectar
 * a Postgres ("PANIC: timer has gone away" — típico de restricciones de
 * CageFS/LVE sobre timers en procesos recién lanzados fuera del
 * supervisor propio de la app), incluso cuando un `nc`/TCP connect crudo a
 * la misma base funciona sin problema. El proceso de la app en sí, una vez
 * arriba (vía Passenger/el "Node.js App" de Hostinger), nunca tuvo ese
 * problema — probablemente porque corre bajo un contexto de recursos
 * distinto al de una sesión SSH ad-hoc. Por eso las migraciones pendientes
 * se aplican ACÁ, al bootear el proceso real, con la conexión que ya se
 * sabe que funciona.
 *
 * Idempotente: cada migración se registra en `_prisma_migrations` (la
 * misma tabla que usa `prisma migrate deploy`), así no se reaplica en el
 * próximo boot — y convive bien con el flujo normal del CLI si en algún
 * momento se puede volver a usar desde un entorno sin esta restricción
 * (ej. corriendo `prisma migrate deploy` desde CI en vez de por SSH).
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { prisma } from "./prisma"

export async function ensurePendingMigrations() {
  const migrationsDir = path.join(__dirname, "../../prisma/migrations")
  if (!fs.existsSync(migrationsDir)) return

  const appliedRows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT migration_name FROM "_prisma_migrations"`,
  )
  const applied = new Set(appliedRows.map((r) => r.migration_name))

  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  for (const dir of dirs) {
    if (applied.has(dir)) continue
    const sqlPath = path.join(migrationsDir, dir, "migration.sql")
    if (!fs.existsSync(sqlPath)) continue

    const sql = fs.readFileSync(sqlPath, "utf8")
    const checksum = crypto.createHash("sha256").update(sql).digest("hex")
    // Las migraciones generadas por `prisma migrate dev --create-only` acá
    // son sentencias DDL simples (ALTER TABLE / CREATE TYPE) separadas por
    // ";" — no hay funciones/triggers con ";" interno, así que este split
    // ingenuo alcanza.
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)

    console.log(`[ensure-migrations] Aplicando migración pendiente: ${dir}`)
    const migrationId = crypto.randomUUID()
    const startedAt = new Date()
    await prisma.$transaction(async (tx) => {
      for (const stmt of statements) {
        await tx.$executeRawUnsafe(stmt)
      }
      await tx.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, $4, now(), 1)`,
        migrationId,
        checksum,
        dir,
        startedAt,
      )
    })
    console.log(`[ensure-migrations] OK: ${dir}`)
  }
}
