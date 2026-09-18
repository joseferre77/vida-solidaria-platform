import Fastify, { type FastifyError } from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { env, isProd } from "./config/env"
import { attachUser } from "./middleware/auth.middleware"
import { authRoutes } from "./modules/auth/auth.routes"
import { projectsRoutes } from "./modules/projects/projects.routes"
import { usersRoutes } from "./modules/users/users.routes"

async function main() {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
  await app.register(cookie)

  app.addHook("preHandler", attachUser)

  app.get("/health", async () => ({ ok: true, service: "vida-solidaria-api" }))

  await app.register(authRoutes, { prefix: "/api" })
  await app.register(usersRoutes, { prefix: "/api" })
  await app.register(projectsRoutes, { prefix: "/api" })

  // TODO (Módulo 3+): registrar acá cases.routes, logistics.routes,
  // field-ops.routes (con Socket.IO), finance.routes.

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
