import { PrismaClient } from "@prisma/client"
import { isProd } from "../config/env"

// Evita crear múltiples instancias en dev (hot-reload de tsx watch).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: isProd ? ["error", "warn"] : ["error", "warn", "query"],
  })

if (!isProd) global.__prisma = prisma
