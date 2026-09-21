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
  // Antes en 15m: en el uso real de campo (Fase J) un voluntario puede
  // tardar 5-10 min hablando con la persona antes de guardar el caso, y el
  // access token vencía a mitad de carga ("sesión cerrada" al guardar).
  // 2h + el refresh automático agregado en el frontend (ver lib/api-client.ts)
  // hacen que esto ya no dependa de cuánto tarde una sola carga.
  JWT_ACCESS_TTL: z.string().default("2h"),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().default(30),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().optional(),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_DOMAIN: z.string().optional(),
  // En Hostinger cada redeploy clona a una carpeta de versión NUEVA
  // (hbuilds/versions/<uuid>/) — un valor relativo quedaría adentro y se
  // perdería en el próximo deploy. En producción tiene que ser una ruta
  // ABSOLUTA fuera de hbuilds/current (ver .env.example). server.ts hace
  // path.resolve(UPLOADS_DIR) contra el cwd del proceso, así que un valor
  // relativo en local sigue funcionando sin sorpresas.
  UPLOADS_DIR: z.string().default("./uploads"),
  // Base pública de ESTE backend, para armar URLs absolutas de archivos
  // subidos (ver modules/uploads/uploads.routes.ts). No confundir con
  // NEXT_PUBLIC_API_URL del frontend, que apunta a lo mismo desde afuera.
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),

  // Fase K: envío de emails (bienvenida de voluntarios, alertas de stock
  // bajo, notificaciones de casos). Opcional a propósito — sin esta clave el
  // helper de `lib/email.ts` solo loguea y no rompe nada (ver ese archivo).
  // Cuando Josecito cree la cuenta en Resend, esto se completa en el .env.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Vida Solidaria <notificaciones@vidasolidariamdp.com>"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas o faltantes:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export const isProd = env.NODE_ENV === "production"
