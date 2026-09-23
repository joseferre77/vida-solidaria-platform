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
import { Prisma } from "@prisma/client"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { hashPassword } from "../auth/auth.service"
import { GLOBAL_ROLES } from "../rbac/permissions"
import { sendEmail } from "../../lib/email"

const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*"

function generateSecurePassword(length = 14) {
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join("")
}

const roleSlugSchema = z.enum(GLOBAL_ROLES)

// Fase L: perfil extendido — pedido de Josecito al notar que los 14
// coordinadores reales no estaban cargados. Todo opcional a propósito: el
// alta rápida (solo nombre+email+rol) sigue andando igual que siempre.
const profileFieldsSchema = z.object({
  birthDate: z.string().datetime().nullable().optional(),
  sex: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phoneAlt: z.string().trim().max(40).nullable().optional(),
  skills: z.string().trim().max(1000).nullable().optional(),
  cvUrl: z.string().url().nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  availableDays: z.array(z.enum(["lun", "mar", "mie", "jue", "vie", "sab", "dom"])).optional(),
  availableHours: z.string().trim().max(200).nullable().optional(),
})

const createUserSchema = z
  .object({
    name: z.string().min(2, "El nombre es obligatorio"),
    email: z.string().email("Email inválido"),
    phone: z.string().trim().optional(),
    roleSlugs: z.array(roleSlugSchema).min(1, "Elegí al menos un rol"),
    password: z.string().min(8).optional(), // si no viene, se genera una automática
  })
  .merge(profileFieldsSchema)

const updateUserSchema = z
  .object({
    name: z.string().min(2).optional(),
    phone: z.string().trim().nullable().optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .merge(profileFieldsSchema)

const updateRolesSchema = z.object({
  roleSlugs: z.array(roleSlugSchema).min(1, "Un usuario necesita al menos un rol"),
})

const approveUserSchema = z.object({
  roleSlugs: z.array(roleSlugSchema).min(1, "Elegí al menos un rol"),
})

function serializeUser(user: {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  status: string
  volunteerMessage: string | null
  createdAt: Date
  birthDate: Date | null
  sex: string | null
  address: string | null
  phoneAlt: string | null
  skills: string | null
  cvUrl: string | null
  availableDays: string[]
  availableHours: string | null
  roles: { role: { slug: string; label: string; rank: number } }[]
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    volunteerMessage: user.volunteerMessage,
    createdAt: user.createdAt,
    birthDate: user.birthDate,
    sex: user.sex,
    address: user.address,
    phoneAlt: user.phoneAlt,
    skills: user.skills,
    cvUrl: user.cvUrl,
    availableDays: user.availableDays,
    availableHours: user.availableHours,
    roles: user.roles
      .map((ur) => ur.role)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({ slug: r.slug, label: r.label })),
  }
}

function welcomeApprovedEmailHtml(name: string, roleLabels: string[]) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#73038C;">¡Bienvenido/a al equipo, ${name}!</h2>
      <p>La comisión de <strong>Vida Solidaria Mar del Plata</strong> aprobó tu alta como voluntario/a.</p>
      <p>Tu rol: <strong>${roleLabels.join(", ")}</strong>.</p>
      <p>Ya podés entrar al sistema de gestión con tu email y la contraseña que te compartió quien te dio el alta.
      La vas a poder cambiar después desde tu perfil.</p>
      <p>¡Gracias por sumarte!</p>
    </div>
  `
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
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        sex: body.sex || null,
        address: body.address || null,
        phoneAlt: body.phoneAlt || null,
        skills: body.skills || null,
        cvUrl: body.cvUrl || null,
        avatarUrl: body.avatarUrl || null,
        availableDays: body.availableDays ?? [],
        availableHours: body.availableHours || null,
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

    const { birthDate, ...rest } = body
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...rest,
        birthDate: birthDate === undefined ? undefined : birthDate ? new Date(birthDate) : null,
      },
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

  // ── Aprobar alta de voluntario (viene de vidasolidariamdp.com, status
  // "pending") — elige rol(es), pasa a "active" y dispara el email real de
  // bienvenida. Mismo patrón de contraseña generada que el alta manual. ──
  app.patch(
    "/users/:id/approve",
    { preHandler: [requireAuth, requirePermission("users.manage")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = approveUserSchema.parse(request.body)

      const target = await prisma.user.findUnique({ where: { id } })
      if (!target) return reply.code(404).send({ error: "Usuario no encontrado" })
      if (target.status !== "pending") {
        return reply.code(400).send({ error: "Este usuario no está pendiente de aprobación" })
      }

      const roles = await prisma.role.findMany({ where: { slug: { in: body.roleSlugs } } })
      if (roles.length !== body.roleSlugs.length) {
        return reply.code(400).send({ error: "Alguno de los roles enviados no existe" })
      }

      const generatedPassword = generateSecurePassword()
      const passwordHash = await hashPassword(generatedPassword)

      const user = await prisma.user.update({
        where: { id },
        data: {
          status: "active",
          passwordHash,
          roles: { create: roles.map((r) => ({ roleId: r.id })) },
        },
        include: USER_WITH_ROLES_INCLUDE,
      })

      await sendEmail({
        to: user.email,
        subject: "¡Ya sos parte de Vida Solidaria MDP!",
        html: welcomeApprovedEmailHtml(
          user.name,
          roles.sort((a, b) => a.rank - b.rank).map((r) => r.label),
        ),
      })

      return reply.send({
        user: serializeUser(user),
        // Igual que en el alta manual: se devuelve una única vez para que
        // quien aprobó se la pueda compartir si el email todavía no llega
        // (ej. Resend sin configurar) — no queda guardada en ningún lado.
        generatedPassword,
      })
    },
  )

  // ── Rechazar alta de voluntario — pasa a "rejected", sin mail (para no
  // generar fricción; se puede agregar más adelante si hace falta). ──
  app.patch(
    "/users/:id/reject",
    { preHandler: [requireAuth, requirePermission("users.manage")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }

      const target = await prisma.user.findUnique({ where: { id } })
      if (!target) return reply.code(404).send({ error: "Usuario no encontrado" })
      if (target.status !== "pending") {
        return reply.code(400).send({ error: "Este usuario no está pendiente de aprobación" })
      }

      const user = await prisma.user.update({
        where: { id },
        data: { status: "rejected" },
        include: USER_WITH_ROLES_INCLUDE,
      })
      return serializeUser(user)
    },
  )

  // ── Baja definitiva (a pedido de Josecito: el ABM de usuarios necesitaba
  // un borrado real, no solo suspender). OJO — es intencionalmente un
  // borrado de verdad, no un soft-delete: cascadea (se pierden para
  // siempre) sus mensajes del chat de coordinadores, sus asignaciones de
  // rol, sus sesiones activas, su membresía en proyectos/tareas, sus
  // comentarios y registros de tiempo en tareas, y sus respuestas de
  // encuestas — eso lo puede hacer Postgres solo porque esas tablas tienen
  // FK con onDelete: Cascade. Lo que Postgres NO puede resolver solo son
  // los campos que guardan el id como texto plano sin FK (quién creó un
  // movimiento de stock, un caso, un lote de cocina, etc.) — esos quedan
  // intactos pero van a mostrar "—" en vez del nombre, porque el id ya no
  // resuelve a nadie. Y hay dos lugares con FK real pero SIN cascada
  // (gastos y notas de proyecto) que van a bloquear el borrado de punta:
  // ahí se atrapa el error de Postgres y se explica en criollo en vez de
  // devolver el 500 crudo de Prisma.
  app.delete("/users/:id", { preHandler: [requireAuth, requirePermission("users.manage")] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    if (id === request.user!.sub) {
      return reply.code(400).send({ error: "No podés eliminar tu propio usuario" })
    }

    try {
      await prisma.user.delete({ where: { id } })
      return reply.code(204).send()
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          return reply.code(404).send({ error: "Usuario no encontrado" })
        }
        if (err.code === "P2003") {
          return reply.code(409).send({
            error:
              "No se puede eliminar: esta persona tiene gastos o notas de proyecto registrados a su nombre (se preservan por auditoría contable). Usá \"Suspender\" en su lugar.",
          })
        }
      }
      throw err
    }
  })
}
