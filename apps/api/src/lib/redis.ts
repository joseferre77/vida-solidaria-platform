import Redis from "ioredis"
import { env } from "../config/env"

/**
 * `redis` es null si REDIS_URL no está configurado (caso normal en hosting
 * compartido/Business de Hostinger, que no ofrece Redis — ver DEPLOY.md).
 * Nada del Módulo 1 lo usa. Cuando un módulo futuro lo necesite (ej.
 * Socket.IO con más de una instancia), debe chequear `if (redis) { ... }`
 * en vez de asumir que existe.
 */
export const redis = env.REDIS_URL
  ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false })
  : null

redis?.on("error", (err) => {
  console.error("[redis] connection error:", err.message)
})
