/**
 * Módulo: Operaciones de campo (permiso `field_ops.read` / `field_ops.write`).
 *
 * Cubre "equipos" (FieldTeam), "zonas" (Zone/ZoneAssignment) y el registro
 * de check-ins en terreno (Checkin) — que sirve tanto para Extracción de
 * calle (en_camino / llegamos / entregando_viandas) como para Relevamiento
 * (relevando_caso), ya que ambas "secciones" comparten el mismo modelo de
 * check-in con distinto `type`. No hay edición/borrado de check-ins a
 * propósito: es un registro de lo que pasó en terreno, no un formulario a
 * corregir después.
 *
 * Nota de schema: `FieldTeamMember.userId` y `Checkin.userId` son campos
 * sueltos (no hay relación de Prisma declarada hacia `User` en el schema
 * actual, a diferencia de `team`/`case`/`kitchenBatch` que sí la tienen).
 * Por eso acá se resuelven los nombres con una consulta aparte a `User` en
 * vez de un `include` — evita tener que tocar el schema/migraciones hoy.
 *
 * No se integra Socket.IO todavía (mencionado como pendiente en
 * server.ts) — queda para cuando se necesite ver check-ins en vivo en un
 * mapa; por ahora la lista se refresca por polling desde el frontend.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"

const teamSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  vehicleLabel: z.string().trim().optional(),
})

const zoneSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
})

const zoneAssignmentSchema = z.object({
  zoneId: z.string().uuid(),
  teamId: z.string().uuid(),
  weekStartDate: z.string().min(8),
  weekEndDate: z.string().min(8),
})

const CHECKIN_TYPES = ["en_camino", "llegamos", "entregando_viandas", "relevando_caso"] as const

const checkinSchema = z.object({
  teamId: z.string().uuid().optional(),
  type: z.enum(CHECKIN_TYPES),
  caseId: z.string().uuid().optional(),
  kitchenBatchId: z.string().uuid().optional(),
  lat: z.number(),
  lng: z.number(),
  deliveries: z.array(z.object({ itemLabel: z.string().min(1), quantity: z.number().positive() })).optional(),
})

/** Trae {id,name,email} para un set de userIds sueltos (sin relación Prisma). */
async function userMapFor(ids: (string | null | undefined)[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map<string, { id: string; name: string; email: string }>()
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

export async function fieldOpsRoutes(app: FastifyInstance) {
  // ── Equipos ──
  app.get("/field-teams", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async () => {
    const teams = await prisma.fieldTeam.findMany({ include: { members: true }, orderBy: { name: "asc" } })
    const users = await userMapFor(teams.flatMap((t) => t.members.map((m) => m.userId)))
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      vehicleLabel: t.vehicleLabel,
      members: t.members.map((m) => users.get(m.userId)).filter(Boolean),
    }))
  })

  app.post("/field-teams", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request, reply) => {
    const body = teamSchema.parse(request.body)
    const team = await prisma.fieldTeam.create({
      data: { name: body.name, vehicleLabel: body.vehicleLabel || null },
    })
    return reply.code(201).send({ ...team, members: [] })
  })

  app.patch(
    "/field-teams/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = teamSchema.partial().parse(request.body)
      return prisma.fieldTeam.update({
        where: { id },
        data: { ...body, vehicleLabel: body.vehicleLabel === undefined ? undefined : body.vehicleLabel || null },
      })
    },
  )

  app.delete(
    "/field-teams/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.fieldTeam.delete({ where: { id } })
      return reply.code(204).send()
    },
  )

  app.post(
    "/field-teams/:id/members",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { userId } = z.object({ userId: z.string().uuid() }).parse(request.body)
      await prisma.fieldTeamMember.upsert({
        where: { teamId_userId: { teamId: id, userId } },
        update: {},
        create: { teamId: id, userId },
      })
      const members = await prisma.fieldTeamMember.findMany({ where: { teamId: id } })
      const users = await userMapFor(members.map((m) => m.userId))
      return reply.code(201).send(members.map((m) => users.get(m.userId)).filter(Boolean))
    },
  )

  app.delete(
    "/field-teams/:id/members/:userId",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await prisma.fieldTeamMember.delete({ where: { teamId_userId: { teamId: id, userId } } })
      return reply.code(204).send()
    },
  )

  // ── Zonas y asignación semanal a un equipo ──
  app.get("/zones", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async () => {
    const zones = await prisma.zone.findMany({
      include: { assignments: { include: { team: { select: { id: true, name: true } } } } },
      orderBy: { name: "asc" },
    })
    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      assignments: z.assignments.map((a) => ({
        id: a.id,
        teamId: a.teamId,
        teamName: a.team.name,
        weekStartDate: a.weekStartDate,
        weekEndDate: a.weekEndDate,
      })),
    }))
  })

  app.post("/zones", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request, reply) => {
    const body = zoneSchema.parse(request.body)
    const zone = await prisma.zone.create({ data: body })
    return reply.code(201).send({ ...zone, assignments: [] })
  })

  app.patch("/zones/:id", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = zoneSchema.partial().parse(request.body)
    return prisma.zone.update({ where: { id }, data: body })
  })

  app.delete(
    "/zones/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.zone.delete({ where: { id } })
      return reply.code(204).send()
    },
  )

  app.post(
    "/zone-assignments",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const body = zoneAssignmentSchema.parse(request.body)
      const assignment = await prisma.zoneAssignment.create({
        data: {
          zoneId: body.zoneId,
          teamId: body.teamId,
          weekStartDate: new Date(body.weekStartDate),
          weekEndDate: new Date(body.weekEndDate),
        },
        include: { team: { select: { id: true, name: true } } },
      })
      return reply.code(201).send({
        id: assignment.id,
        teamId: assignment.teamId,
        teamName: assignment.team.name,
        weekStartDate: assignment.weekStartDate,
        weekEndDate: assignment.weekEndDate,
      })
    },
  )

  app.delete(
    "/zone-assignments/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.zoneAssignment.delete({ where: { id } })
      return reply.code(204).send()
    },
  )

  // ── Check-ins de terreno (Extracción de calle / Relevamiento) ──
  app.get("/checkins", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async (request) => {
    const { teamId, type } = request.query as { teamId?: string; type?: string }
    const checkins = await prisma.checkin.findMany({
      where: {
        teamId: teamId || undefined,
        type: (type as (typeof CHECKIN_TYPES)[number]) || undefined,
      },
      include: {
        team: { select: { id: true, name: true } },
        deliveries: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    })
    const users = await userMapFor(checkins.map((c) => c.userId))
    return checkins.map((c) => ({
      id: c.id,
      type: c.type,
      lat: c.lat,
      lng: c.lng,
      createdAt: c.createdAt,
      user: users.get(c.userId) ?? null,
      team: c.team,
      caseId: c.caseId,
      kitchenBatchId: c.kitchenBatchId,
      deliveries: c.deliveries.map((d) => ({ itemLabel: d.itemLabel, quantity: d.quantity })),
    }))
  })

  app.post("/checkins", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request, reply) => {
    const body = checkinSchema.parse(request.body)
    const checkin = await prisma.checkin.create({
      data: {
        userId: request.user!.sub,
        teamId: body.teamId,
        type: body.type,
        caseId: body.caseId,
        kitchenBatchId: body.kitchenBatchId,
        lat: body.lat,
        lng: body.lng,
        deliveries: body.deliveries ? { create: body.deliveries } : undefined,
      },
      include: {
        team: { select: { id: true, name: true } },
        deliveries: true,
      },
    })
    const users = await userMapFor([checkin.userId])
    return reply.code(201).send({
      id: checkin.id,
      type: checkin.type,
      lat: checkin.lat,
      lng: checkin.lng,
      createdAt: checkin.createdAt,
      user: users.get(checkin.userId) ?? null,
      team: checkin.team,
      caseId: checkin.caseId,
      kitchenBatchId: checkin.kitchenBatchId,
      deliveries: checkin.deliveries.map((d) => ({ itemLabel: d.itemLabel, quantity: d.quantity })),
    })
  })
}
