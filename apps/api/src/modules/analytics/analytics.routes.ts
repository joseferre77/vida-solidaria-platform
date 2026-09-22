/**
 * Fase K bloque G — Analítica e indicadores. Módulo nuevo, sin tablas
 * propias (ver comentario "7. ANALÍTICA" en schema.prisma): todo sale de
 * agregar sobre los modelos que ya alimentan los bloques anteriores —
 * mientras más bloques de Fase K estén cargando datos reales, más útil
 * sale este tablero. Permiso único para todas las rutas: `analytics.read`
 * (ya existía en rbac/permissions.ts, sin uso hasta el bloque G).
 *
 * Nota de schema (mismo criterio que cases/field-ops/logistics): ningún
 * `userId` de acá tiene @relation a User — se resuelve con `userMapFor`,
 * copiada tal cual del mismo helper en cases.routes.ts.
 *
 * Post-Fase-K (pedido de Josecito 21/09/2026): se agregan acá — todavía
 * bajo el único permiso `analytics.read`, a propósito, para que dirección
 * (que tiene analytics.read pero no necesariamente logistics.read o
 * finance.read) pueda ver y exportar todo desde un solo lugar:
 *   - /analytics/resumen: usuarios totales, proyectos por estado, stock.
 *   - /analytics/mapa-casos: casos con última ubicación GPS conocida, para
 *     el mapa interactivo.
 *   - /analytics/export/*: listados "planos" (sin paginar) pensados para
 *     bajar como CSV/PDF desde el frontend — no para uso interactivo.
 * El stock se recalcula acá con una versión "en lote" de la misma cuenta
 * que usa logistics.routes.ts (`currentQuantity` ahí es por-ítem, N+1;
 * acá se agrupa una sola vez con `groupBy` porque puede ser un catálogo
 * grande y este endpoint no tiene el filtro/paginado que sí tiene
 * logística) — mismo resultado, sin reimplementar el modelo de negocio.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { listProjects } from "../projects/projects.service"

// Labels en español para las columnas de los exports CSV/PDF — copiados
// tal cual de `CASE_STATUS_LABEL`/`VIABILITY_LABEL` en apps/web/lib/cases.ts
// (no se puede importar del frontend desde acá, son paquetes separados).
const CASE_STATUS_LABEL_ES: Record<string, string> = {
  activo: "Activo (sin clasificar)",
  en_seguimiento: "En seguimiento (en tratamiento)",
  derivado: "Derivado (clasificado)",
  cerrado: "Cerrado (extraído)",
}
const CASE_VIABILITY_LABEL_ES: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" }
const PROJECT_STATUS_LABEL_ES: Record<string, string> = {
  planning: "Planificación",
  active: "En proceso",
  paused: "Pausado",
  done: "Terminado",
}

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

    // Casos por estado — mismos 4 valores de CaseStatus que usa el mapa
    // (bloque post-Fase-K): activo/en_seguimiento/derivado/cerrado.
    const byStatus = { activo: 0, en_seguimiento: 0, derivado: 0, cerrado: 0 }
    for (const c of cases) byStatus[c.status] += 1

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
      byStatus,
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

  // ── Resumen (post-Fase-K): usuarios totales, proyectos por estado,
  // stock — los tres KPI que pidió Josecito para completar el tablero
  // además de lo que ya cubrían casos/presentismo/producción.
  app.get("/analytics/resumen", { preHandler: [requireAuth, requirePermission("analytics.read")] }, async () => {
    const [totalUsers, projectsByStatusRows, stockItems, movementSums] = await Promise.all([
      prisma.user.count(),
      prisma.project.groupBy({ by: ["status"], _count: { status: true } }),
      prisma.stockItem.findMany({
        select: { id: true, unitCost: true, reorderPoint: true, isReusable: true },
      }),
      prisma.stockMovement.groupBy({ by: ["stockItemId", "type"], _sum: { quantity: true } }),
    ])

    const projectsByStatus = { planning: 0, active: 0, paused: 0, done: 0 }
    for (const row of projectsByStatusRows) projectsByStatus[row.status] = row._count.status

    // Cantidad actual por ítem = suma de ingresos - suma de egresos, todo
    // en un solo `groupBy` (evita N+1 sobre el catálogo completo — acá no
    // hace falta el detalle de custodia que sí calcula logistics.routes.ts).
    const qtyByItem = new Map<string, number>()
    for (const row of movementSums) {
      const sum = Number(row._sum.quantity ?? 0)
      const delta = row.type === "ingreso" ? sum : -sum
      qtyByItem.set(row.stockItemId, (qtyByItem.get(row.stockItemId) ?? 0) + delta)
    }

    let totalValuation = 0
    let belowReorderPoint = 0
    for (const item of stockItems) {
      if (item.isReusable) continue // no se consume, no aplica valuación/reposición
      const qty = qtyByItem.get(item.id) ?? 0
      if (item.unitCost !== null) totalValuation += qty * Number(item.unitCost)
      if (item.reorderPoint !== null && qty <= Number(item.reorderPoint)) belowReorderPoint += 1
    }

    return {
      totalUsers,
      projectsByStatus,
      totalProjects: Object.values(projectsByStatus).reduce((a, b) => a + b, 0),
      stock: {
        totalItems: stockItems.length,
        totalValuation,
        belowReorderPoint,
        // Si todavía no se cargó ningún StockItem (el caso de "aunque no
        // esté cargado" que pidió Josecito), esto sale en 0 — el frontend
        // lo muestra igual, no lo oculta.
        loaded: stockItems.length > 0,
      },
    }
  })

  // ── Mapa de casos (post-Fase-K): última ubicación GPS conocida de cada
  // caso (tabla `CaseLocation`, puede tener varias filas por caso a lo
  // largo del tiempo — se toma la más reciente por `recordedAt`), con el
  // color de clasificación que pidió Josecito. Mapeo de color, documentado
  // también en PLAN_FASE_K.md porque Josecito no dio el campo exacto:
  // reusa el enum CaseStatus 1 a 1 (es el único campo de 4 valores que
  // tiene Case) → activo="sin clasificar"=rojo, derivado="clasificado"=
  // naranja, en_seguimiento="en tratamiento"=amarillo, cerrado="extraído"=
  // verde. El color en sí lo decide el frontend (CASE_MAP_COLOR en
  // lib/analytics.ts) — acá solo viaja el `status` crudo.
  app.get("/analytics/mapa-casos", { preHandler: [requireAuth, requirePermission("analytics.read")] }, async () => {
    const locations = await prisma.caseLocation.findMany({
      orderBy: { recordedAt: "desc" },
      select: {
        caseId: true,
        lat: true,
        lng: true,
        recordedAt: true,
        case: { select: { caseNumber: true, fullName: true, alias: true, status: true } },
      },
    })
    const seen = new Set<string>()
    const points: {
      caseId: string
      caseNumber: string
      fullName: string
      alias: string | null
      status: string
      lat: number
      lng: number
      recordedAt: Date
    }[] = []
    for (const loc of locations) {
      if (seen.has(loc.caseId)) continue // ya vimos una más reciente (ordenado desc)
      seen.add(loc.caseId)
      points.push({
        caseId: loc.caseId,
        caseNumber: loc.case.caseNumber,
        fullName: loc.case.fullName,
        alias: loc.case.alias,
        status: loc.case.status,
        lat: loc.lat,
        lng: loc.lng,
        recordedAt: loc.recordedAt,
      })
    }
    return { points }
  })

  // ── Exports "planos" para CSV/PDF (post-Fase-K) — un GET por reporte,
  // sin paginar (son para bajar, no para tabla interactiva). El formateo
  // final (CSV vs PDF, encabezado/pie de Vida Solidaria) lo hace el
  // frontend en lib/reports.ts; acá solo se arma el contenido.
  app.get(
    "/analytics/export/casos",
    { preHandler: [requireAuth, requirePermission("analytics.read")] },
    async () => {
      const cases = await prisma.case.findMany({
        orderBy: { caseNumber: "asc" },
        select: {
          caseNumber: true,
          fullName: true,
          alias: true,
          dni: true,
          approxAge: true,
          sex: true,
          phone: true,
          status: true,
          viability: true,
          caseType: true,
          createdAt: true,
        },
      })
      return {
        generatedAt: new Date().toISOString(),
        rows: cases.map((c) => ({
          caseNumber: c.caseNumber,
          fullName: c.fullName,
          alias: c.alias ?? "",
          dni: c.dni ?? "",
          approxAge: c.approxAge ?? "",
          sex: c.sex ?? "",
          phone: c.phone ?? "",
          status: CASE_STATUS_LABEL_ES[c.status] ?? c.status,
          viability: c.viability ? (CASE_VIABILITY_LABEL_ES[c.viability] ?? c.viability) : "",
          caseType: c.caseType,
          createdAt: c.createdAt.toISOString().slice(0, 10),
        })),
      }
    },
  )

  app.get(
    "/analytics/export/cocina",
    { preHandler: [requireAuth, requirePermission("analytics.read")] },
    async () => {
      const [items, movementSums] = await Promise.all([
        prisma.stockItem.findMany({ orderBy: { name: "asc" } }),
        prisma.stockMovement.groupBy({ by: ["stockItemId", "type"], _sum: { quantity: true } }),
      ])
      const qtyByItem = new Map<string, number>()
      for (const row of movementSums) {
        const sum = Number(row._sum.quantity ?? 0)
        const delta = row.type === "ingreso" ? sum : -sum
        qtyByItem.set(row.stockItemId, (qtyByItem.get(row.stockItemId) ?? 0) + delta)
      }
      return {
        generatedAt: new Date().toISOString(),
        rows: items.map((item) => {
          const qty = item.isReusable ? null : (qtyByItem.get(item.id) ?? 0)
          const unitCost = item.unitCost === null ? null : Number(item.unitCost)
          return {
            code: item.code,
            name: item.name,
            unit: item.unit,
            category: item.category ?? "",
            isReusable: item.isReusable ? "Sí (equipo)" : "No (insumo)",
            currentQuantity: qty ?? "",
            unitCost: unitCost ?? "",
            totalValue: qty !== null && unitCost !== null ? qty * unitCost : "",
            reorderPoint: item.reorderPoint === null ? "" : Number(item.reorderPoint),
          }
        }),
      }
    },
  )

  app.get(
    "/analytics/export/proyectos",
    { preHandler: [requireAuth, requirePermission("analytics.read")] },
    async (request) => {
      // seeAll: true — analytics.read es un permiso de dirección, con
      // visión de toda la organización (mismo criterio que canSeeAllProjects
      // en projects.routes.ts para projects.admin/direccion).
      const projects = await listProjects({ userId: request.user!.sub, seeAll: true })
      return {
        generatedAt: new Date().toISOString(),
        rows: projects.map((p) => ({
          code: p.code,
          name: p.name,
          area: p.area ?? "",
          status: PROJECT_STATUS_LABEL_ES[p.status] ?? p.status,
          priority: p.priority,
          owner: p.owner?.name ?? "",
          startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : "",
          endDate: p.endDate ? p.endDate.toISOString().slice(0, 10) : "",
          progressPct: p.progressPct,
          caseCount: p.caseCount,
          memberCount: p.memberCount,
        })),
      }
    },
  )
}
