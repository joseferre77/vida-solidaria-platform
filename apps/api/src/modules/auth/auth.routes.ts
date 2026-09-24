import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { env, isProd } from "../../config/env"
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  flattenRolesAndPermissions,
} from "./auth.service"
import { requireAuth } from "../../middleware/auth.middleware"

const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
})

const COOKIE_OPTS = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax" as const,
  domain: env.COOKIE_DOMAIN,
  path: "/",
}

async function loadUserWithRoles(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
    },
  })
}

async function issueSessionCookies(reply: any, userId: string, meta: { userAgent?: string; ip?: string }) {
  const user = await loadUserWithRoles(userId)
  if (!user) throw new Error("Usuario no encontrado al emitir sesión")

  const { roles, permissions } = flattenRolesAndPermissions(user.roles as any)
  const accessToken = signAccessToken({ sub: user.id, roles, permissions })
  const { raw: refreshToken, expiresAt } = await issueRefreshToken(user.id, meta)

  reply.setCookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 })
  reply.setCookie("refresh_token", refreshToken, { ...COOKIE_OPTS, expires: expiresAt })

  return { id: user.id, name: user.name, email: user.email, roles }
}

export async function authRoutes(app: FastifyInstance) {
  // ── Login nativo (email + password) ──
  // Fase Q: además del alta manual desde /administracion, ahora existe
  // autorregistro público con contraseña propia desde /login (ver
  // modules/public/public.routes.ts, POST /public/register) con
  // verificación de email y aprobación de la comisión antes de poder
  // entrar — por eso el orden acá importa: primero se valida la
  // contraseña (si es válida, sabemos que no es un desconocido adivinando
  // emails al azar) y RECIÉN DESPUÉS se da un mensaje específico del
  // estado de la cuenta. Dar el detalle antes de validar la contraseña
  // permitiría a cualquiera confirmar si un email tiene cuenta registrada.
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body)
    const user = await prisma.user.findUnique({ where: { email: body.email } })

    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Credenciales inválidas" })
    }

    const valid = await verifyPassword(body.password, user.passwordHash)
    if (!valid) {
      return reply.code(401).send({ error: "Credenciales inválidas" })
    }

    if (user.status === "active") {
      const session = await issueSessionCookies(reply, user.id, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      })
      return reply.send({ user: session })
    }

    if (user.status === "pending" && !user.emailVerifiedAt) {
      return reply.code(403).send({ error: "Confirmá tu email para continuar — te mandamos un link a tu casilla." })
    }
    if (user.status === "pending") {
      return reply.code(403).send({ error: "Tu cuenta está esperando la aprobación de la comisión." })
    }
    if (user.status === "rejected") {
      return reply.code(403).send({ error: "Tu solicitud no fue aprobada. Consultá con la comisión de Vida Solidaria." })
    }
    if (user.status === "suspended") {
      return reply.code(403).send({ error: "Tu cuenta está suspendida. Consultá con la comisión." })
    }

    return reply.code(401).send({ error: "Credenciales inválidas" })
  })

  // ── Refresh: rota el refresh token y emite un access token nuevo ──
  app.post("/auth/refresh", async (request, reply) => {
    const raw = request.cookies?.refresh_token
    if (!raw) return reply.code(401).send({ error: "Sin sesión" })

    const result = await rotateRefreshToken(raw, {
      userAgent: request.headers["user-agent"],
      ip: request.ip,
    })
    if (!result) return reply.code(401).send({ error: "Sesión inválida o expirada" })

    const { roles, permissions } = flattenRolesAndPermissions(result.user.roles as any)
    const accessToken = signAccessToken({ sub: result.user.id, roles, permissions })

    reply.setCookie("access_token", accessToken, { ...COOKIE_OPTS, maxAge: 2 * 60 * 60 })
    reply.setCookie("refresh_token", result.refreshToken.raw, {
      ...COOKIE_OPTS,
      expires: result.refreshToken.expiresAt,
    })
    return reply.send({ ok: true })
  })

  // ── Logout: revoca el refresh token y limpia cookies ──
  app.post("/auth/logout", async (request, reply) => {
    const raw = request.cookies?.refresh_token
    if (raw) await revokeRefreshToken(raw)
    reply.clearCookie("access_token", COOKIE_OPTS)
    reply.clearCookie("refresh_token", COOKIE_OPTS)
    return reply.send({ ok: true })
  })

  // ── Usuario actual (para que el frontend sepa rol/permisos al cargar) ──
  app.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const user = await loadUserWithRoles(request.user!.sub)
    if (!user) return reply.code(404).send({ error: "Usuario no encontrado" })
    const { roles, permissions } = flattenRolesAndPermissions(user.roles as any)
    return reply.send({
      id: user.id,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      roles,
      permissions,
    })
  })

  // ── Google OAuth: se registra acá si hay credenciales configuradas ──
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    const { registerGoogleOAuth } = await import("./google-strategy")
    await registerGoogleOAuth(app, issueSessionCookies)
  } else {
    app.log.warn("Google OAuth deshabilitado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env")
  }
}
