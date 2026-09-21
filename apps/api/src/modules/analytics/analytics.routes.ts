/**
 * Fase K bloque G — Analítica e indicadores. Módulo nuevo, sin tablas
 * propias (ver comentario "7. ANALÍTICA" en schema.prisma): todo sale de
 * agregar sobre los modelos que ya alimentan los bloques anteriores —
 * mientras más bloques de Fase K estén cargando datos reales, más útil
 * sale este tablero. Permiso único para las tres rutas: `analytics.read`
 * (ya existía en rbac/permissions.ts, sin uso hasta ahora).
 *
 * Nota de schema (mismo criterio que cases/field-ops/logistics): ningún
 * `userId` de acá tiene @relation a User — se resuelve con `userMapFor`,
 * copiada tal cual del mismo helper en cases.routes.ts.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"

async function userMapFor(ids: (string | null | undefined)[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map<string, { id: string; name: string; email: string }>()
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

const weeksQuerySchema = z.object({
  weeks: z.coerce.number().int().positive().max(52).optional(),
})

// Domingo al que corresponde una fecha — trunca al domingo anterior (o el
// mismo día si ya cayó domingo). Mismo criterio de "semana = domingo" que
// WeeklyAvailability/ZoneAssignment en el resto del módulo de campo,
// calculado acá porque FieldDelivery no guarda su propio weekStartDate
// (solo llega a un domingo indirectamente, vía Checkin.createdAt).
function sundayKey(d: Date) {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  utc.setUTCDate(utc.getUTCDate() - utc.getUTCDay())
  return utc.toISOString().slice(0, 10)
}

export async function analyticsRoutes(app: FastifyInstance) {
  // ── Casos: edad promedio, sexo, permanencia, habilidades, contacto,
  // viabilidad. Todo sobre `Case` + `CaseSkill` + `CaseStatusHistory`.
  app.get("/analytics/casos", { preHandler: [requireAuth, requirePermission("analytics.read")] }, async () => {
    const cases = await prisma.case.findMany({
      select: { id: true, approxAge: true, sex: true, phone: true, viability: true, status: true, createdAt: true },
    })

    const ages = cases.map((c) => c.approxAge).filter((a): a is number => a != null)
    const averageAge = ages.length ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null

    const sexCounts = new Map<string, number>()
    for (const c of cases) {
      const key = c.sex?.trim() || "Sin dato"
      sexCounts.set(key, (sexCounts.get(key) ?? 0) + 1)
    }

    const withPhone = cases.filter((c) => c.phone && c.phone.trim()).length

    const byViability = { alta: 0, media: 0, baja: 0, sinDato: 0 }
    for (const c of cases) {
      if (c.viability) byViability[c.viability] += 1
      else byViability.sinDato += 1
    }

    // Tiempo de permanencia = días desde createdAt hasta la última
    // transición a "cerrado" (si el caso está cerrado) o hasta hoy (si
    // sigue activo/en_seguimiento/derivado) — pedido explícito del bloque G.
    const closedIds = cases.filter((c) => c.status === "cerrado").map((c) => c.id)
    const closeHistories = closedIds.length
      ? await prisma.caseStatusHistory.findMany({
          where: { caseId: { in: closedIds }, toStatus: "cerrado" },
          orderBy: { changedAt: "desc" },
          select: { caseId: true, changedAt: true },
        })
      : []
    const closedAtByCaseId = new Map<string, Date>()
    for (const h of closeHistories) {
      // Ordenado desc — la primera vez que aparece un caseId es su cierre
      // más reciente (por si se reabrió y volvió a cerrar más de una vez).
      if (!closedAtByCaseId.has(h.caseId)) closedAtByCaseId.set(h.caseId, h.changedAt)
    }
    const now = Date.now()
    const stayDaysList = cases.map((c) => {
      const endMs = c.status === "cerrado" ? (closedAtByCaseId.get(c.id)?.getTime() ?? now) : now
      return Math.max(0, (endMs - c.createdAt.getTime()) / 86_400_000)
    })
    const averageStayDays = stayDaysList.length
      ? Math.round((stayDaysList.reduce((s, d) => s + d, 0) / stayDaysList.length) * 10) / 10
      : null

    const skillRows = await prisma.caseSkill.groupBy({
      by: ["skillLabel"],
      _count: { skillLabel: true },
      orderBy: { _count: { skillLabel: "desc" } },
      take: 10,
    })

    return {
      totalCases: cases.length,
      averageAge,
      sexDistribution: Array.from(sexCounts.entries()).map(([sex, count]) => ({ sex, count })),
      averageStayDays,
      topSkills: skillRows.map((s) => ({ skillLabel: s.skillLabel, count: s._count.skillLabel })),
      withPhone,
      withoutPhone: cases.length - withPhone,
      byViability,
    }
  })

  // ── Presentismo: ranking de usuarios por asistencias CONFIRMADAS
  // (`WeeklyAvailability.confirmedPresent`) en los últimos N domingos
  // (default 8, ~2 meses).
  app.get(
    "/analytics/presentismo",
    { preHandler: [requireAuth, requirePermission("analytics.read")] },
    async (request) => {
      const { weeks } = weeksQuerySchema.parse(request.query)
      const weekCount = weeks ?? 8
      const cutoff = new Date(Date.now() - weekCount * 7 * 86_400_000)

      const rows = await prisma.weeklyAvailability.groupBy({
        by: ["userId"],
        where: { confirmedPresent: true, weekStartDate: { gte: cutoff } },
        _count: { confirmedPresent: true },
      })

      const users = await userMapFor(rows.map((r) => r.userId))
      const ranking = rows
        .map((r) => ({ user: users.get(r.userId) ?? null, userId: r.userId, confirmedCount: r._count.confirmedPresent }))
        .sort((a, b) => b.confirmedCount - a.confirmedCount)

      return { weeks: weekCount, ranking }
    },
  )

  // ── Producción: bandejas / litros entregados por domingo, sumando
  // `FieldDelivery` (ligado a Checkin tipo "entregando_viandas") agrupado
  // por semana e ítem.
  app.get(
    "/analytics/produccion",
    { preHandler: [requireAuth, requirePermission("analytics.read")] },
    async (request) => {
      const { weeks } = weeksQuerySchema.parse(request.query)
      const weekCount = weeks ?? 8
      const cutoff = new Date(Date.now() - weekCount * 7 * 86_400_000)

      const deliveries = await prisma.fieldDelivery.findMany({
        where: { checkin: { type: "entregando_viandas", createdAt: { gte: cutoff } } },
        select: { itemLabel: true, quantity: true, checkin: { select: { createdAt: true } } },
      })

      const byWeek = new Map<string, Map<string, number>>()
      for (const d of deliveries) {
        const week = sundayKey(d.checkin.createdAt)
        const itemMap = byWeek.get(week) ?? new Map<string, number>()
        itemMap.set(d.itemLabel, (itemMap.get(d.itemLabel) ?? 0) + Number(d.quantity))
        byWeek.set(week, itemMap)
      }

      const series = Array.from(byWeek.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([weekStartDate, items]) => ({
          weekStartDate,
          items: Array.from(items.entries()).map(([itemLabel, quantity]) => ({ itemLabel, quantity })),
        }))

      return { weeks: weekCount, series }
    },
  )
}
