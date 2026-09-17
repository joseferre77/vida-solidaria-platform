import { z } from "zod"
import "dotenv/config"

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatorio"),
  // Opcional: el hosting compartido/Business de Hostinger no ofrece Redis
  // (mismo motivo que no ofrece Postgres — ver ARCHITECTURE.md §1). Nada en
  // el Módulo 1 depende de Redis todavía; se vuelve necesario recién si en
  // el futuro hace falta escalar Socket.IO a más de una instancia.
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET debe tener al menos 16 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET debe tener al menos 16 caracteres"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),
  UPLOADS_DIR: z.string().default("./uploads"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas o faltantes:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === "production"
