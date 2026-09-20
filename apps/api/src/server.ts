import path from "node:path"
import fs from "node:fs"
import Fastify, { type FastifyError } from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import fastifyStatic from "@fastify/static"
import { env, isProd } from "./config/env"
import { attachUser } from "./middleware/auth.middleware"
import { authRoutes } from "./modules/auth/auth.routes"
import { projectsRoutes } from "./modules/projects/projects.routes"
import { usersRoutes } from "./modules/users/users.routes"
import { uploadsRoutes } from "./modules/uploads/uploads.routes"
import { fieldOpsRoutes } from "./modules/field-ops/field-ops.routes"
import { logisticsRoutes } from "./modules/logistics/logistics.routes"

async function main() {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
  await app.register(cookie)
  await app.register(multipart)

  // UPLOADS_DIR puede ser relativo (ej. "./uploads") — se resuelve una sola
  // vez acá contra el cwd del proceso, así uploads.routes.ts y este bloque
  // de static siempre apuntan exactamente a la misma carpeta absoluta.
  const uploadsDir = path.resolve(env.UPLOADS_DIR)
  fs.mkdirSync(uploadsDir, { recursive: true })
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/uploads/",
    // No hace falta index ni listado de directorio: es solo un bucket de
    // archivos subidos, cada uno referenciado por su URL exacta.
    index: false,
    list: false,
  })

  app.addHook("preHandler", attachUser)

  app.get("/health", async () => ({ ok: true, service: "vida-solidaria-api" }))

  await app.register(authRoutes, { prefix: "/api" })
  await app.register(usersRoutes, { prefix: "/api" })
  await app.register(projectsRoutes, { prefix: "/api" })
  await app.register(uploadsRoutes, { prefix: "/api" })
  await app.register(fieldOpsRoutes, { prefix: "/api" })
  await app.register(logisticsRoutes, { prefix: "/api" })

  // TODO (Módulo 3+): registrar acá cases.routes, finance.routes.
  // logistics/field-ops todavía sin Socket.IO (ver notas en esos módulos).

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({ error: "Datos inválidos", details: error.validation })
    }
    request.log.error(error)
    return reply.code(500).send({ error: "Error interno" })
  })

  await app.listen({ port: env.PORT, host: "0.0.0.0" })
  console.log(`✅ API escuchando en http://0.0.0.0:${env.PORT}`)
}

main().catch((err) => {
  console.error("❌ Error al iniciar el servidor:", err)
  process.exit(1)
})
