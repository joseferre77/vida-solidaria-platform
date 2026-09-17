import bcrypt from "bcryptjs"
import crypto from "node:crypto"
import jwt from "jsonwebtoken"
import { prisma } from "../../lib/prisma"
import { env } from "../../config/env"

const PASSWORD_SALT_ROUNDS = 12

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, PASSWORD_SALT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

export interface AccessTokenPayload {
  sub: string // user id
  roles: string[]
  permissions: string[]
}

export function signAccessToken(payload: AccessTokenPayload) {
  // env.JWT_ACCESS_TTL viene de zod como `string` genérico; jwt.sign espera
  // el tipo literal `StringValue` (ej. "15m"). El valor es válido en runtime
  // (se valida el formato en config/env.ts al arrancar), así que se castea
  // acá en el único punto de uso en vez de debilitar el tipo del env global.
  const options: jwt.SignOptions = { expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"] }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, options)
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
}

/**
 * Refresh tokens son opacos (no JWT): se genera un valor random, se persiste
 * SOLO su hash (nunca el valor en texto plano) en `refresh_tokens`, y el
 * valor real se manda como cookie httpOnly. Permite revocar sesiones
 * individuales (logout remoto) sin depender de la expiración del JWT.
 */
export async function issueRefreshToken(userId: string, meta: { userAgent?: string; ip?: string }) {
  const raw = crypto.randomBytes(48).toString("hex")
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex")
  const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000)

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt,
    },
  })

  return { raw, expiresAt }
}

export async function rotateRefreshToken(raw: string, meta: { userAgent?: string; ip?: string }) {
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex")
  const existing = await prisma.refreshToken.findFirst({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
  })

  if (!existing) return null

  // Rotación: se revoca el token usado y se emite uno nuevo (detecta reuse).
  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  })

  const next = await issueRefreshToken(existing.userId, meta)
  return { user: existing.user, refreshToken: next }
}

export async function revokeRefreshToken(raw: string) {
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex")
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Aplana roles + permisos de un usuario para embeber en el access token. */
export function flattenRolesAndPermissions(
  userRoles: { role: { slug: string; permissions: { permission: { slug: string } }[] } }[]
) {
  const roles = userRoles.map((ur) => ur.role.slug)
  const isAdmin = roles.includes("admin_general")
  const permissions = isAdmin
    ? ["*"] // admin_general: acceso total, resuelto explícitamente en el middleware
    : Array.from(new Set(userRoles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.slug))))

  return { roles, permissions }
}
