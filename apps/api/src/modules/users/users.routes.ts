/**
 * Gestión de usuarios y roles (permiso `users.manage`).
 *
 * `/users/basic` sigue siendo el listado liviano y público (para cualquier
 * usuario autenticado) que usan los pickers de miembros/responsables en
 * Proyectos — no requiere permiso especial a propósito, así cualquier
 * usuario puede ver "quién es quién" para asignar tareas.
 *
 * El resto de las rutas de este archivo (listar completo, crear, editar,
 * cambiar estado, asignar roles) requieren `users.manage` y son el panel de
 * administración de personas: alta de voluntarios/coordinadores y
 * asignación de rol, que hasta ahora solo existía vía `prisma/seed.ts`.
 */
import crypto from "node:crypto"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { hashPassword } from "../auth/auth.service"
import { GLOBAL_ROLES } from "../rbac/permissions"

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*"

function generateSecurePassword(length = 14) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("")
}

const roleSlugSchema = z.enum(GLOBAL_ROLES)

const createUserSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  email: z.string().email("Email inválido"),
  phone: z.string().trim().optional(),
  roleSlugs: z.array(roleSlugSchema).min(1, "Elegí al menos un rol"),
  password: z.string().min(8).optional(), // si no viene, se genera una automática
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().trim().nullable().optional(),
  status: z.enum(["active", "suspended"]).optional(),
})

const updateRolesSchema = z.object({
  roleSlugs: z.array(roleSlugSchema).min(1, "Un usuario necesita al menos un rol"),
})

function serializeUser(user: {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  status: string
  createdAt: Date
  roles: { role: { slug: string; label: string; rank: number } }[]
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt,
    roles: user.roles
      .map((ur) => ur.role)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ slug: r.slug, label: r.label })),
  }
}

const USER_WITH_ROLES_INCLUDE = { roles: { include: { role: true } } } as const

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users/basic", { preHandler: requireAuth }, async () => {
    const users = await prisma.user.findMany({
      where: { status: "active" },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: "asc" },
    })
    return users
  })

  // ── Catálogo de roles (para el selector en el alta/edición) ──
  app.get("/roles", { preHandler: [requireAuth, requirePermission("users.manage")] }, async () => {
    const roles = await prisma.role.findMany({ orderBy: { rank: "asc" } })
    return roles.map((r) => ({ slug: r.slug, label: r.label, rank: r.rank }))
  })

  // ── Listado completo (panel de administración) ──
  app.get("/users", { preHandler: [requireAuth, requirePermission("users.manage")] }, async () => {
    const users = await prisma.user.findMany({
      include: USER_WITH_ROLES_INCLUDE,
      orderBy: { createdAt: "desc" },
    })
    return users.map(serializeUser)
  })

  // ── Alta de usuario (voluntario, coordinador, etc.) ──
  app.post("/users", { preHandler: [requireAuth, requirePermission("users.manage")] }, async (request, reply) => {
    const body = createUserSchema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      return reply.code(409).send({ error: "Ya existe un usuario con ese email" })
    }

    const roles = await prisma.role.findMany({ where: { slug: { in: body.roleSlugs } } })
    if (roles.length !== body.roleSlugs.length) {
      return reply.code(400).send({ error: "Alguno de los roles enviados no existe" })
    }

    const generatedPassword = body.password ?? generateSecurePassword()
    const passwordHash = await hashPassword(generatedPassword)

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        passwordHash,
        status: "active",
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
      include: USER_WITH_ROLES_INCLUDE,
    })

    return reply.code(201).send({
      user: serializeUser(user),
      // Solo se devuelve cuando el admin no puso una contraseña propia — es
      // la única vez que viaja en texto plano, para poder compartirla con
      // la persona recién dada de alta. No queda guardada en ningún lado.
      generatedPassword: body.password ? undefined : generatedPassword,
    })
  })

  // ── Edición de datos básicos / estado (activar-suspender) ──
  app.patch("/users/:id", { preHandler: [requireAuth, requirePermission("users.manage")] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = updateUserSchema.parse(request.body)

    if (id === request.user!.sub && body.status === "suspended") {
      return reply.code(400).send({ error: "No podés suspender tu propio usuario" })
    }

    const user = await prisma.user.update({
      where: { id },
      data: body,
      include: USER_WITH_ROLES_INCLUDE,
    })
    return serializeUser(user)
  })

  // ── Asignación de roles (reemplaza el set completo) ──
  app.patch(
    "/users/:id/roles",
    { preHandler: [requireAuth, requirePermission("users.manage")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = updateRolesSchema.parse(request.body)

      const target = await prisma.user.findUnique({ where: { id }, include: USER_WITH_ROLES_INCLUDE })
      if (!target) return reply.code(404).send({ error: "Usuario no encontrado" })

      const wasAdmin = target.roles.some((ur) => ur.role.slug === "admin_general")
      const staysAdmin = body.roleSlugs.includes("admin_general")
      if (id === request.user!.sub && wasAdmin && !staysAdmin) {
        return reply.code(400).send({ error: "No podés quitarte a vos mismo el rol Admin General" })
      }

      const roles = await prisma.role.findMany({ where: { slug: { in: body.roleSlugs } } })
      if (roles.length !== body.roleSlugs.length) {
        return reply.code(400).send({ error: "Alguno de los roles enviados no existe" })
      }

      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId: id } }),
        prisma.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) }),
      ])

      const updated = await prisma.user.findUniqueOrThrow({ where: { id }, include: USER_WITH_ROLES_INCLUDE })
      return serializeUser(updated)
    },
  )
}
