/**
 * Módulo: Operaciones de campo (permiso `field_ops.read` / `field_ops.write`).
 *
 * Cubre "equipos" (FieldTeam), "zonas" (Zone/ZoneAssignment), presentismo
 * semanal (WeeklyAvailability) y el registro de check-ins en terreno
 * (Checkin) — que sirve tanto para Extracción de calle (en_camino /
 * presente_punto_encuentro / presente_zona / entregando_viandas) como para
 * Relevamiento (relevando_caso), ya que ambas "secciones" comparten el
 * mismo modelo de check-in con distinto `type`. No hay edición/borrado de
 * check-ins a propósito: es un registro de lo que pasó en terreno, no un
 * formulario a corregir después.
 *
 * Nota de schema: `FieldTeamMember.userId`, `WeeklyAvailability.userId` y
 * `Checkin.userId` son campos sueltos (no hay relación de Prisma declarada
 * hacia `User` en el schema actual, a diferencia de `team`/`case`/
 * `kitchenBatch` que sí la tienen). Por eso acá se resuelven los nombres
 * con una consulta aparte a `User` en vez de un `include` — evita tener
 * que tocar el schema/migraciones hoy.
 *
 * Fase K bloque B: `FieldTeamMember` pasó de ser fijo a estar atado a una
 * semana (`weekStartDate`) — un equipo se arma de nuevo cada domingo según
 * quién confirmó asistencia. `weekStartDate` es una fecha "opaca" elegida
 * por quien la carga (igual que en `ZoneAssignment`, que ya era semanal):
 * el backend no calcula "qué domingo es hoy", solo guarda/filtra por la
 * fecha que le llega. Presentismo en dos etapas: 1) el usuario carga su
 * intención semanal (`WeeklyAvailability.willAttend`), 2) coordinación
 * confirma quién vino de verdad (`confirmedPresent`) y arma los equipos con
 * los endpoints de miembros de abajo, 3) en el terreno, dos check-ins
 * (`presente_punto_encuentro` y `presente_zona`) marcan la asistencia real.
 *
 * No se integra Socket.IO todavía (mencionado como pendiente en
 * server.ts) — queda para cuando se necesite ver check-ins en vivo en un
 * mapa; por ahora la lista se refresca por polling desde el frontend.
 *
 * Fase X (07/11/2026) — Mapa de voluntarios: agrega al mismo módulo (mismo
 * permiso field_ops.read/write) un mapa de solo visualización con dos
 * capas de pines: voluntarios geolocalizados (`User.lat/lng`, completados
 * geocodificando `User.address` vía Nominatim/OSM — ver lib/geocoding.ts)
 * y "puntos de operación" (`OperationalPoint`: acopio de ropa, cocina,
 * recepción de comida, distribución de ropa, feria física, punto de
 * encuentro, retiro de ropa — categorías abiertas, puede haber varios de
 * cada una, a diferencia del punto de encuentro fijo de presentismo de
 * arriba). `MapSettings` guarda el punto donde se cruzan las dos líneas
 * que dividen el mapa en 4 cuadrantes visuales — Josecito lo mueve
 * arrastrando un pin en el mapa, no es el centro geográfico fijo de la
 * ciudad. Todavía no se integra con asignación de casos/equipos.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { logActivity } from "../../lib/audit"
import { geocodeAddress } from "../../lib/geocoding"

const teamSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  vehicleLabel: z.string().trim().optional(),
  // Fase L: a quién reportan los demás miembros del equipo (jerarquía
  // plana — un coordinador por equipo, sin sub-jefes, confirmado con
  // Josecito 23/09/2026).
  coordinatorUserId: z.string().uuid().nullable().optional(),
})

const TEAM_FUNCTIONS = ["relevo", "extraccion", "despacho_comida", "despacho_bebida", "despacho_infusion", "general"] as const

const zoneSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
})

const zoneAssignmentSchema = z.object({
  zoneId: z.string().uuid(),
  teamId: z.string().uuid(),
  weekStartDate: z.string().min(8),
  weekEndDate: z.string().min(8),
})

const teamMemberSchema = z.object({
  userId: z.string().uuid(),
  weekStartDate: z.string().min(8),
  functions: z.array(z.enum(TEAM_FUNCTIONS)).optional(),
})

const availabilitySchema = z.object({
  weekStartDate: z.string().min(8),
  willAttend: z.boolean(),
  reason: z.string().trim().max(300).optional(),
})

const confirmAvailabilitySchema = z.object({
  confirmedPresent: z.boolean(),
})

const CHECKIN_TYPES = [
  "en_camino",
  "llegamos",
  "presente_punto_encuentro",
  "presente_zona",
  "entregando_viandas",
  "relevando_caso",
] as const

const checkinSchema = z.object({
  teamId: z.string().uuid().optional(),
  type: z.enum(CHECKIN_TYPES),
  caseId: z.string().uuid().optional(),
  kitchenBatchId: z.string().uuid().optional(),
  lat: z.number(),
  lng: z.number(),
  deliveries: z.array(z.object({ itemLabel: z.string().min(1), quantity: z.number().positive() })).optional(),
})

// ── Fase X: Mapa de voluntarios ──
const OPERATIONAL_POINT_CATEGORIES = [
  "acopio_ropa",
  "cocina",
  "recepcion_comida",
  "distribucion_ropa",
  "feria",
  "punto_encuentro",
  "retiro_ropa",
  "otro",
] as const

const operationalPointSchema = z.object({
  category: z.enum(OPERATIONAL_POINT_CATEGORIES),
  name: z.string().min(2, "El nombre es obligatorio"),
  address: z.string().trim().optional(),
  // Si no vienen, se geocodifica `address` — pensado para cuando el
  // admin arrastra el pin a mano en vez de tipear una dirección exacta.
  lat: z.number().optional(),
  lng: z.number().optional(),
  active: z.boolean().optional(),
})

const mapSettingsSchema = z.object({
  centerLat: z.number(),
  centerLng: z.number(),
})

const geocodeVolunteersSchema = z.object({
  // Por default solo geocodifica a quien todavía no tiene lat/lng — con
  // force:true re-geocodifica a todos los que tengan dirección cargada
  // (ej. si alguien corrigió su dirección y hace falta recalcular).
  force: z.boolean().optional(),
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
  // Devuelve TODAS las membresías (de cualquier semana), igual que
  // GET /zones con sus ZoneAssignment — el frontend agrupa/filtra por
  // weekStartDate según la semana que esté mirando (por defecto, la más
  // próxima). Evita tener que adivinar en el backend "qué domingo es hoy".
  app.get("/field-teams", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async () => {
    const teams = await prisma.fieldTeam.findMany({
      include: { members: true },
      orderBy: { name: "asc" },
    })
    const users = await userMapFor([
      ...teams.flatMap((t) => t.members.map((m) => m.userId)),
      ...teams.map((t) => t.coordinatorUserId),
    ])
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      vehicleLabel: t.vehicleLabel,
      coordinatorUserId: t.coordinatorUserId,
      coordinator: t.coordinatorUserId ? users.get(t.coordinatorUserId) ?? null : null,
      members: t.members
        .map((m) => {
          const user = users.get(m.userId)
          return user ? { ...user, weekStartDate: m.weekStartDate, functions: m.functions } : null
        })
        .filter(Boolean),
    }))
  })

  app.post("/field-teams", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request, reply) => {
    const body = teamSchema.parse(request.body)
    const team = await prisma.fieldTeam.create({
      data: { name: body.name, vehicleLabel: body.vehicleLabel || null, coordinatorUserId: body.coordinatorUserId || null },
    })
    await logActivity(request.user!.sub, "field_team", team.id, "created", body)
    return reply.code(201).send({ ...team, coordinator: null, members: [] })
  })

  app.patch(
    "/field-teams/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = teamSchema.partial().parse(request.body)
      const team = await prisma.fieldTeam.update({
        where: { id },
        data: {
          ...body,
          vehicleLabel: body.vehicleLabel === undefined ? undefined : body.vehicleLabel || null,
          coordinatorUserId: body.coordinatorUserId === undefined ? undefined : body.coordinatorUserId || null,
        },
      })
      await logActivity(request.user!.sub, "field_team", id, "updated", body)
      return team
    },
  )

  app.delete(
    "/field-teams/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.fieldTeam.delete({ where: { id } })
      await logActivity(request.user!.sub, "field_team", id, "deleted")
      return reply.code(204).send()
    },
  )

  app.post(
    "/field-teams/:id/members",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { userId, weekStartDate, functions } = teamMemberSchema.parse(request.body)
      const weekStart = new Date(weekStartDate)
      await prisma.fieldTeamMember.upsert({
        where: { teamId_userId_weekStartDate: { teamId: id, userId, weekStartDate: weekStart } },
        update: { functions: functions ?? undefined },
        create: { teamId: id, userId, weekStartDate: weekStart, functions: functions ?? [] },
      })
      await logActivity(request.user!.sub, "field_team", id, "member_added", { userId, weekStartDate, functions })
      // Devuelve solo los integrantes de ESA semana (no todo el historial
      // del equipo) — es lo que necesita la pantalla de armado semanal.
      const members = await prisma.fieldTeamMember.findMany({ where: { teamId: id, weekStartDate: weekStart } })
      const users = await userMapFor(members.map((m) => m.userId))
      return reply.code(201).send(
        members
          .map((m) => {
            const user = users.get(m.userId)
            return user ? { ...user, functions: m.functions } : null
          })
          .filter(Boolean),
      )
    },
  )

  app.delete(
    "/field-teams/:id/members/:userId",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      const { weekStartDate } = z.object({ weekStartDate: z.string().min(8) }).parse(request.query)
      await prisma.fieldTeamMember.delete({
        where: { teamId_userId_weekStartDate: { teamId: id, userId, weekStartDate: new Date(weekStartDate) } },
      })
      await logActivity(request.user!.sub, "field_team", id, "member_removed", { userId, weekStartDate })
      return reply.code(204).send()
    },
  )

  // ── Presentismo semanal (WeeklyAvailability) ──
  // Paso 1: cualquier usuario logueado carga su propia intención para el
  // domingo que viene (no requiere field_ops.* — es autogestionado, mismo
  // criterio que /notifications). Paso 2: coordinación (field_ops.write)
  // ve la lista completa de la semana y confirma quién vino de verdad.
  app.get("/weekly-availability/me", { preHandler: requireAuth }, async (request) => {
    const { weekStartDate } = z.object({ weekStartDate: z.string().min(8) }).parse(request.query)
    const availability = await prisma.weeklyAvailability.findUnique({
      where: { userId_weekStartDate: { userId: request.user!.sub, weekStartDate: new Date(weekStartDate) } },
    })
    return { availability }
  })

  app.put("/weekly-availability/me", { preHandler: requireAuth }, async (request) => {
    const body = availabilitySchema.parse(request.body)
    const weekStart = new Date(body.weekStartDate)
    // Upsert por (userId, weekStartDate): si ya había cargado intención
    // para este domingo, la actualiza en vez de duplicar. `confirmedPresent`
    // nunca se toca acá — es exclusivo de coordinación (ver abajo).
    const availability = await prisma.weeklyAvailability.upsert({
      where: { userId_weekStartDate: { userId: request.user!.sub, weekStartDate: weekStart } },
      update: { willAttend: body.willAttend, reason: body.willAttend ? null : body.reason || null },
      create: {
        userId: request.user!.sub,
        weekStartDate: weekStart,
        willAttend: body.willAttend,
        reason: body.willAttend ? null : body.reason || null,
      },
    })
    await logActivity(request.user!.sub, "weekly_availability", availability.id, "updated", body)
    return availability
  })

  app.get(
    "/weekly-availability",
    { preHandler: [requireAuth, requirePermission("field_ops.read")] },
    async (request) => {
      const { weekStartDate } = z.object({ weekStartDate: z.string().min(8) }).parse(request.query)
      const items = await prisma.weeklyAvailability.findMany({
        where: { weekStartDate: new Date(weekStartDate) },
        orderBy: { createdAt: "asc" },
      })
      const users = await userMapFor(items.map((i) => i.userId))
      return items.map((i) => ({
        id: i.id,
        user: users.get(i.userId) ?? null,
        weekStartDate: i.weekStartDate,
        willAttend: i.willAttend,
        reason: i.reason,
        confirmedPresent: i.confirmedPresent,
      }))
    },
  )

  app.patch(
    "/weekly-availability/:id/confirm",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = confirmAvailabilitySchema.parse(request.body)
      const existing = await prisma.weeklyAvailability.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: "Registro no encontrado" })
      const updated = await prisma.weeklyAvailability.update({
        where: { id },
        data: { confirmedPresent: body.confirmedPresent },
      })
      await logActivity(request.user!.sub, "weekly_availability", id, "confirmed", body)
      return updated
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
    await logActivity(request.user!.sub, "zone", zone.id, "created", body)
    return reply.code(201).send({ ...zone, assignments: [] })
  })

  app.patch("/zones/:id", { preHandler: [requireAuth, requirePermission("field_ops.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = zoneSchema.partial().parse(request.body)
    const zone = await prisma.zone.update({ where: { id }, data: body })
    await logActivity(request.user!.sub, "zone", id, "updated", body)
    return zone
  })

  app.delete(
    "/zones/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.zone.delete({ where: { id } })
      await logActivity(request.user!.sub, "zone", id, "deleted")
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
      await logActivity(request.user!.sub, "zone_assignment", assignment.id, "created", body)
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
      await logActivity(request.user!.sub, "zone_assignment", id, "deleted")
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
    await logActivity(request.user!.sub, "checkin", checkin.id, "created", body)
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

  // ── Mapa de voluntarios (Fase X) ──
  // Configuración del cruce de las 4 líneas de cuadrante.
  app.get("/map/settings", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async () => {
    const settings = await prisma.mapSettings.findUnique({ where: { id: "default" } })
    // No debería pasar (la migración inserta la fila inicial), pero por si
    // alguna vez se borra a mano, devuelve un default sensato en vez de 404.
    return settings ?? { id: "default", centerLat: -38.0055, centerLng: -57.5426, updatedBy: null, updatedAt: null }
  })

  app.patch(
    "/map/settings",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request) => {
      const body = mapSettingsSchema.parse(request.body)
      const settings = await prisma.mapSettings.upsert({
        where: { id: "default" },
        update: { centerLat: body.centerLat, centerLng: body.centerLng, updatedBy: request.user!.sub },
        create: { id: "default", centerLat: body.centerLat, centerLng: body.centerLng, updatedBy: request.user!.sub },
      })
      await logActivity(request.user!.sub, "map_settings", "default", "updated", body)
      return settings
    },
  )

  // Voluntarios ya geocodificados (para pintar en el mapa) + contadores
  // para que el frontend muestre "12 de 15 ubicados" y el botón de
  // geocodificar tenga sentido.
  app.get("/map/volunteers", { preHandler: [requireAuth, requirePermission("field_ops.read")] }, async () => {
    const [items, totalWithAddress, totalUsers] = await Promise.all([
      prisma.user.findMany({
        where: { status: "active", lat: { not: null }, lng: { not: null } },
        select: { id: true, name: true, email: true, address: true, lat: true, lng: true, geocodedAt: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.count({ where: { status: "active", address: { not: null }, NOT: { address: "" } } }),
      prisma.user.count({ where: { status: "active" } }),
    ])
    return { items, stats: { geocoded: items.length, totalWithAddress, totalUsers } }
  })

  // Geocodifica en lote las direcciones de usuarios activos. Secuencial
  // (respeta el límite de Nominatim de 1 req/seg vía lib/geocoding.ts) — con
  // pocos usuarios reales (~14 coordinadores) tarda unos segundos; si el
  // lote fuera grande algún día y el request tardara demasiado, un segundo
  // click retoma donde quedó (solo reintenta los que sigan sin lat/lng).
  app.post(
    "/map/volunteers/geocode",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request) => {
      const { force } = geocodeVolunteersSchema.parse(request.body ?? {})
      const candidates = await prisma.user.findMany({
        where: {
          status: "active",
          address: { not: null },
          NOT: { address: "" },
          ...(force ? {} : { lat: null }),
        },
        select: { id: true, address: true },
      })
      let geocoded = 0
      let failed = 0
      for (const u of candidates) {
        const geo = await geocodeAddress(u.address)
        if (geo) {
          await prisma.user.update({ where: { id: u.id }, data: { lat: geo.lat, lng: geo.lng, geocodedAt: new Date() } })
          geocoded++
        } else {
          failed++
        }
      }
      await logActivity(request.user!.sub, "map_volunteers", "batch", "geocoded", {
        attempted: candidates.length,
        geocoded,
        failed,
      })
      return { attempted: candidates.length, geocoded, failed }
    },
  )

  // ── Puntos de operación (Fase X) ──
  app.get(
    "/operational-points",
    { preHandler: [requireAuth, requirePermission("field_ops.read")] },
    async () => {
      const points = await prisma.operationalPoint.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] })
      const users = await userMapFor(points.map((p) => p.createdBy))
      return points.map((p) => ({ ...p, createdByUser: users.get(p.createdBy) ?? null }))
    },
  )

  app.post(
    "/operational-points",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const body = operationalPointSchema.parse(request.body)
      let lat = body.lat
      let lng = body.lng
      let geocodedAt: Date | null = null
      if (lat === undefined || lng === undefined) {
        const geo = await geocodeAddress(body.address)
        if (!geo) {
          return reply.code(400).send({
            error: "No pudimos ubicar esa dirección en el mapa. Probá con una más precisa, o agregá el punto y arrastrá el pin a mano.",
          })
        }
        lat = geo.lat
        lng = geo.lng
        geocodedAt = new Date()
      }
      const point = await prisma.operationalPoint.create({
        data: {
          category: body.category,
          name: body.name,
          address: body.address || null,
          lat,
          lng,
          geocodedAt,
          active: body.active ?? true,
          createdBy: request.user!.sub,
        },
      })
      await logActivity(request.user!.sub, "operational_point", point.id, "created", body)
      return reply.code(201).send({ ...point, createdByUser: null })
    },
  )

  app.patch(
    "/operational-points/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = operationalPointSchema.partial().parse(request.body)
      const existing = await prisma.operationalPoint.findUnique({ where: { id } })
      if (!existing) return reply.code(404).send({ error: "Punto no encontrado" })

      let lat = body.lat
      let lng = body.lng
      let geocodedAt = existing.geocodedAt
      const addressChanged = body.address !== undefined && body.address !== existing.address
      if (lat !== undefined || lng !== undefined) {
        // Coordenadas puestas a mano (arrastrando el pin) — no se
        // re-geocodifica, se respeta la posición elegida.
        lat = lat ?? existing.lat
        lng = lng ?? existing.lng
      } else if (addressChanged) {
        const geo = await geocodeAddress(body.address)
        if (!geo) {
          return reply.code(400).send({
            error: "No pudimos ubicar esa dirección en el mapa. Probá con una más precisa, o arrastrá el pin a mano.",
          })
        }
        lat = geo.lat
        lng = geo.lng
        geocodedAt = new Date()
      }

      const point = await prisma.operationalPoint.update({
        where: { id },
        data: {
          category: body.category,
          name: body.name,
          address: body.address === undefined ? undefined : body.address || null,
          lat,
          lng,
          geocodedAt,
          active: body.active,
        },
      })
      await logActivity(request.user!.sub, "operational_point", id, "updated", body)
      return point
    },
  )

  app.delete(
    "/operational-points/:id",
    { preHandler: [requireAuth, requirePermission("field_ops.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.operationalPoint.delete({ where: { id } })
      await logActivity(request.user!.sub, "operational_point", id, "deleted")
      return reply.code(204).send()
    },
  )
}
