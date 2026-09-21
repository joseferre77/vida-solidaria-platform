import path from "node:path"
import fs from "node:fs"
import Fastify, { type FastifyError } from "fastify"
import { ZodError } from "zod"
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
import { casesRoutes } from "./modules/cases/cases.routes"
import { notificationsRoutes } from "./modules/notifications/notifications.routes"
import { publicRoutes } from "./modules/public/public.routes"

async function main() {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
    // Hostinger sirve la app Node detrás de un proxy propio — sin esto,
    // request.ip siempre sería el del proxy (127.0.0.1), inutilizando el
    // rate-limit por IP del alta pública de voluntarios (public.routes.ts).
    trustProxy: true,
  })

  // CORS_ORIGIN admite una lista separada por comas (por si hace falta sumar
  // un origen que no sea *.vidasolidariamdp.com). OJO: en Hostinger el env
  // var configurado desde hPanel (Node.js App → Environment variables) pisa
  // lo que tenga el .env del repo — dotenv no sobreescribe una variable que
  // el proceso ya trae seteada. Por eso este chequeo NO depende solo del
  // env var: cualquier subdominio (o el dominio raíz) de vidasolidariamdp.com
  // queda permitido siempre, aunque a alguien se le olvide actualizar el env
  // var en el panel — es la única fuente de la verdad para "es nuestro sitio".
  const VIDASOLIDARIA_APEX = "vidasolidariamdp.com"
  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
  function isAllowedOrigin(origin: string): boolean {
    if (allowedOrigins.includes(origin)) return true
    try {
      const host = new URL(origin).hostname
      return host === VIDASOLIDARIA_APEX || host.endsWith(`.${VIDASOLIDARIA_APEX}`)
    } catch {
      return false
    }
  }
  await app.register(cors, {
    origin: (origin, callback) => {
      // Sin header Origin (ej. curl, apps nativas) o origen permitido: ok.
      if (!origin || isAllowedOrigin(origin)) return callback(null, true)
      callback(new Error("Origen no permitido por CORS"), false)
    },
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

  // IMPORTANTE: setErrorHandler tiene que registrarse ACÁ, antes de los
  // app.register(...) de las rutas de abajo. En Fastify v5, un handler
  // seteado en la instancia raíz DESPUÉS de registrar los plugins hijos
  // (cada `register` crea su propio contexto encapsulado) no siempre
  // llega a interceptar los errores lanzados dentro de esos plugins —
  // se probó en un repro aislado: con el registro en este orden (antes
  // de los `register`) los ZodError de cualquier ruta llegan acá; en el
  // orden viejo (después), Fastify devolvía su 500 crudo por defecto.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Bug arrastrado desde el Módulo 1: TODAS las rutas validan el body con
    // `xxxSchema.parse(request.body)` (Zod), no con el validador de schema
    // nativo de Fastify — así que un dato inválido (ej. email mal formado o
    // contraseña corta al hacer login) tira un ZodError, que `error.validation`
    // (que es la propiedad de Fastify, no de Zod) nunca detecta. Sin este
    // chequeo, cualquier dato inválido en cualquier endpoint caía derecho al
    // 500 de abajo — un error de VALIDACIÓN (culpa de quien carga el dato)
    // devuelto como si fuera una falla interna del servidor.
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: error.issues[0]?.message ?? "Datos inválidos",
        details: error.issues,
      })
    }
    if (error.validation) {
      return reply.code(400).send({ error: "Datos inválidos", details: error.validation })
    }
    request.log.error(error)
    return reply.code(500).send({ error: "Error interno" })
  })

  await app.register(authRoutes, { prefix: "/api" })
  await app.register(usersRoutes, { prefix: "/api" })
  await app.register(projectsRoutes, { prefix: "/api" })
  await app.register(uploadsRoutes, { prefix: "/api" })
  await app.register(fieldOpsRoutes, { prefix: "/api" })
  await app.register(logisticsRoutes, { prefix: "/api" })
  await app.register(casesRoutes, { prefix: "/api" })
  await app.register(notificationsRoutes, { prefix: "/api" })
  await app.register(publicRoutes, { prefix: "/api" })

  // TODO (Módulo 4+): registrar acá finance.routes (donaciones/compras/rendición).
  // logistics/field-ops/cases todavía sin Socket.IO (ver notas en esos módulos).

  await app.listen({ port: env.PORT, host: "0.0.0.0" })
  console.log(`✅ API escuchando en http://0.0.0.0:${env.PORT}`)
}

main().catch((err) => {
  console.error("❌ Error al iniciar el servidor:", err)
  process.exit(1)
})
