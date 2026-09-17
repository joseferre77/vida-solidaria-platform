import type { FastifyReply, FastifyRequest } from "fastify"
import { verifyAccessToken, type AccessTokenPayload } from "../modules/auth/auth.service"

declare module "fastify" {
  interface FastifyRequest {
    user?: AccessTokenPayload
  }
}

/** Cuelga request.user si hay un access token válido; si no, sigue anónimo. */
export async function attachUser(request: FastifyRequest, _reply: FastifyReply) {
  const token = request.cookies?.access_token
  if (!token) return
  try {
    request.user = verifyAccessToken(token)
  } catch {
    // Token vencido o inválido: se ignora acá, requireAuth corta si hace falta.
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) {
    return reply.code(401).send({ error: "No autenticado" })
  }
}

export function requirePermission(permission: string) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.code(401).send({ error: "No autenticado" })
    }
    const { permissions } = request.user
    if (permissions.includes("*") || permissions.includes(permission)) return
    return reply.code(403).send({ error: `Falta el permiso: ${permission}` })
  }
}

export function requireRole(...roles: string[]) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) {
      return reply.code(401).send({ error: "No autenticado" })
    }
    const hasRole = request.user.roles.some((r) => roles.includes(r))
    if (!hasRole) {
      return reply.code(403).send({ error: `Requiere uno de estos roles: ${roles.join(", ")}` })
    }
  }
}
