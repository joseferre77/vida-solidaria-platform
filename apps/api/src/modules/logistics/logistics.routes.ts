/**
 * Módulo: Logística / cocina (permiso `logistics.read` / `logistics.write`).
 *
 * Cubre dos cosas:
 *
 * 1. **Stock** — catálogo de inventario (materia prima, descartables,
 *    equipamiento reusable) con código automático, unidad fija, valuación
 *    monetaria, punto de pedido/reposición y el ledger real de movimientos
 *    (`StockMovement`, ingreso/egreso — la cantidad actual SIEMPRE se
 *    deriva sumando el ledger, nunca es un campo mutable, misma convención
 *    del resto del repo). El equipamiento reusable (`isReusable: true`) no
 *    se consume, se PRESTA — eso lo cubre `StockCustody` (quién lo tiene
 *    ahora) en vez del ledger.
 *
 * 2. **Cocina** — lotes de comida (`KitchenBatch`) que avanzan por un
 *    estado fijo (preparación → cocción → cocina terminada → cargando
 *    conservadoras → camino al punto de encuentro → entregado), con un
 *    responsable, insumos y personas asignadas. Asignar/quitar un
 *    ingrediente de un lote genera automáticamente el movimiento de stock
 *    correspondiente (como si fuera una "venta" que descuenta inventario).
 *
 * Notificaciones: al cruzar el punto de pedido de un insumo hacia abajo, se
 * avisa (en el sistema + email si hay `RESEND_API_KEY`) a todos los
 * usuarios con permiso `logistics.write` — ver `lib/notify.ts`.
 *
 * Nota de schema: igual que en field-ops, varios campos (`createdBy`,
 * `KitchenBatchAssignee.userId`, `KitchenBatch.responsibleUserId`,
 * `StockCustody.holderUserId`/`checkedOutBy`, `StockMovement.createdBy`)
 * son campos sueltos sin relación de Prisma hacia `User` — se resuelven acá
 * con una consulta aparte en vez de `include`.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { notify, usersWithPermission } from "../../lib/notify"

const STOCK_UNITS = ["kg", "litros", "unidades", "paquetes", "cajas"] as const

const stockItemSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  unit: z.enum(STOCK_UNITS),
  category: z.string().trim().optional(),
  icon: z.string().trim().max(8).optional(),
  isReusable: z.boolean().optional(),
  unitCost: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional(),
  restockTarget: z.number().nonnegative().optional(),
  // Bloque "Stock — cantidad inicial al crear": solo se usa en el alta
  // (POST /stock-items) — dispara un StockMovement de ingreso automático
  // en vez de obligar a crear el insumo y después ir a "+ Movimiento"
  // aparte. Se ignora en PATCH (la cantidad siempre sale del ledger).
  initialQuantity: z.number().nonnegative().optional(),
})

const movementSchema = z.object({
  type: z.enum(["ingreso", "egreso"]),
  quantity: z.number().positive(),
  reason: z.string().trim().optional(),
})

const batchSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  targetServings: z.number().int().positive(),
  responsibleUserId: z.string().uuid().optional(),
})

const responsibleSchema = z.object({ responsibleUserId: z.string().uuid().nullable() })

const KITCHEN_STATUSES = [
  "preparacion",
  "coccion",
  "cocina_terminada",
  "listo_transporte",
  "camino_punto_encuentro",
  "entregado",
] as const

const statusSchema = z.object({ status: z.enum(KITCHEN_STATUSES) })

const ingredientSchema = z.object({
  stockItemId: z.string().uuid(),
  quantityAssigned: z.number().positive(),
})

const assigneeSchema = z.object({
  userId: z.string().uuid(),
  taskLabel: z.string().trim().optional(),
})

const custodySchema = z.object({
  holderUserId: z.string().uuid(),
  quantity: z.number().positive().optional(),
  notes: z.string().trim().optional(),
})

const returnCustodySchema = z.object({
  returnedNotes: z.string().trim().optional(),
})

const transferCustodySchema = z.object({
  holderUserId: z.string().uuid(),
  notes: z.string().trim().optional(),
})

// Fase L — "armar kit en un solo paso": sumar equipamiento reusable
// (conservadora, olla) a un lote de cocina crea una StockCustody linkeada
// al lote (ver equipmentSchema más abajo, junto a ingredientSchema).
const equipmentSchema = z.object({
  stockItemId: z.string().uuid(),
  quantity: z.number().positive().optional(),
  holderUserId: z.string().uuid().optional(),
  notes: z.string().trim().optional(),
})

async function userMapFor(ids: (string | null | undefined)[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map<string, { id: string; name: string; email: string }>()
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

async function nextStockCode() {
  const counter = await prisma.counter.upsert({
    where: { name: "stock_item_code" },
    update: { value: { increment: 1 } },
    create: { name: "stock_item_code", value: 1 },
  })
  return `ART-${String(counter.value).padStart(4, "0")}`
}

/** Cantidad actual = suma de ingresos - suma de egresos del ledger. Nunca se
 * guarda como campo mutable (convención del repo). */
async function currentQuantity(stockItemId: string) {
  const [ingresos, egresos] = await Promise.all([
    prisma.stockMovement.aggregate({ where: { stockItemId, type: "ingreso" }, _sum: { quantity: true } }),
    prisma.stockMovement.aggregate({ where: { stockItemId, type: "egreso" }, _sum: { quantity: true } }),
  ])
  const inQty = Number(ingresos._sum.quantity ?? 0)
  const outQty = Number(egresos._sum.quantity ?? 0)
  return inQty - outQty
}

/** Si el insumo tiene punto de pedido y la cantidad ACABA de cruzarlo hacia
 * abajo (antes estaba arriba, ahora está en o por debajo), avisa a logística
 * — en el sistema siempre, por email si hay `RESEND_API_KEY` configurada. */
async function maybeAlertLowStock(stockItemId: string, qtyBefore: number, qtyAfter: number) {
  const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } })
  if (!item || item.reorderPoint === null) return
  const reorderPoint = Number(item.reorderPoint)
  const wasAbove = qtyBefore > reorderPoint
  const isAtOrBelowNow = qtyAfter <= reorderPoint
  if (!(wasAbove && isAtOrBelowNow)) return

  const recipients = await usersWithPermission("logistics.write")
  const title = `Stock bajo: ${item.name}`
  const body = `Quedan ${qtyAfter} ${item.unit} de "${item.name}" (código ${item.code}) — punto de pedido: ${reorderPoint} ${item.unit}.`
  await notify(
    recipients.map((u) => u.id),
    {
      title,
      body,
      type: "stock_low",
      link: "/equipos?tab=stock",
      email: { subject: title, html: `<p>${body}</p>` },
    },
  )
}

const BATCH_INCLUDE = {
  ingredients: { include: { stockItem: true } },
  assignees: true,
  statusHistory: { orderBy: { changedAt: "desc" } as const },
  // Fase L — equipamiento reusable sumado al kit (activo + histórico, para
  // que el remito del voluntario muestre qué se le dio aunque ya lo haya
  // devuelto o traspasado).
  custodies: { include: { stockItem: true }, orderBy: { checkedOutAt: "desc" } as const },
} as const

async function serializeBatch(batch: {
  id: string
  name: string
  targetServings: number
  status: string
  createdBy: string
  responsibleUserId: string | null
  createdAt: Date
  ingredients: { stockItemId: string; quantityAssigned: unknown; stockItem: { id: string; name: string; unit: string } }[]
  assignees: { userId: string; taskLabel: string | null }[]
  statusHistory: { id: string; toStatus: string; changedBy: string; changedAt: Date }[]
  custodies: {
    id: string
    stockItemId: string
    holderUserId: string
    quantity: unknown
    checkedOutAt: Date
    returnedAt: Date | null
    stockItem: { id: string; name: string; unit: string }
  }[]
}) {
  const users = await userMapFor([
    batch.createdBy,
    batch.responsibleUserId,
    ...batch.assignees.map((a) => a.userId),
    ...batch.statusHistory.map((h) => h.changedBy),
    ...batch.custodies.map((c) => c.holderUserId),
  ])
  return {
    id: batch.id,
    name: batch.name,
    targetServings: batch.targetServings,
    status: batch.status,
    createdAt: batch.createdAt,
    createdBy: users.get(batch.createdBy) ?? null,
    responsible: batch.responsibleUserId ? (users.get(batch.responsibleUserId) ?? null) : null,
    ingredients: batch.ingredients.map((i) => ({
      stockItemId: i.stockItemId,
      stockItemName: i.stockItem.name,
      unit: i.stockItem.unit,
      quantityAssigned: i.quantityAssigned,
    })),
    assignees: batch.assignees.map((a) => ({ ...users.get(a.userId), taskLabel: a.taskLabel })),
    statusHistory: batch.statusHistory.map((h) => ({
      toStatus: h.toStatus,
      changedAt: h.changedAt,
      changedBy: users.get(h.changedBy) ?? null,
    })),
    equipment: batch.custodies.map((c) => ({
      custodyId: c.id,
      stockItemId: c.stockItemId,
      stockItemName: c.stockItem.name,
      unit: c.stockItem.unit,
      quantity: c.quantity,
      holder: users.get(c.holderUserId) ?? null,
      checkedOutAt: c.checkedOutAt,
      returnedAt: c.returnedAt,
    })),
  }
}

const STOCK_ITEM_INCLUDE = {
  custodies: { where: { returnedAt: null }, orderBy: { checkedOutAt: "desc" as const } },
} as const

async function serializeStockItem(item: {
  id: string
  code: string
  name: string
  unit: string
  category: string | null
  icon: string | null
  isReusable: boolean
  unitCost: unknown
  reorderPoint: unknown
  restockTarget: unknown
  createdAt: Date
  custodies: { id: string; holderUserId: string; quantity: unknown; notes: string | null; checkedOutAt: Date }[]
}) {
  const active = item.custodies[0] ?? null
  const users = active ? await userMapFor([active.holderUserId]) : null
  const qty = item.isReusable ? null : await currentQuantity(item.id)
  const unitCost = item.unitCost === null ? null : Number(item.unitCost)
  const reorderPoint = item.reorderPoint === null ? null : Number(item.reorderPoint)
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    category: item.category,
    icon: item.icon,
    isReusable: item.isReusable,
    unitCost,
    reorderPoint,
    restockTarget: item.restockTarget === null ? null : Number(item.restockTarget),
    createdAt: item.createdAt,
    currentQuantity: qty,
    totalValue: qty !== null && unitCost !== null ? qty * unitCost : null,
    belowReorderPoint: qty !== null && reorderPoint !== null ? qty <= reorderPoint : false,
    activeCustody: active
      ? {
          id: active.id,
          holder: users?.get(active.holderUserId) ?? null,
          quantity: active.quantity,
          notes: active.notes,
          checkedOutAt: active.checkedOutAt,
        }
      : null,
  }
}

/**
 * Serializa TODO el catálogo de una sola pasada, sin N+1.
 *
 * `serializeStockItem` (arriba) hace 2 queries de `aggregate` por insumo
 * más una de `userMapFor` por cada custodia activa — perfecto para los
 * endpoints de UN insumo (crear/editar/movimiento), pero /stock-items y
 * /stock-summary lo aplicaban con `Promise.all(items.map(...))` sobre TODO
 * el catálogo: con ~100 insumos (lo que quedó después de Fase L — catálogo
 * inicial + kit semanal + equipamiento) eso son ~400 queries concurrentes
 * contra el pooler de Supabase en cada uno de los dos endpoints, que la
 * pantalla de Stock pide en paralelo al entrar — de ahí que se quedara
 * "cargando" sin terminar de traer nada. Acá se resuelve todo el catálogo
 * con 2 queries en total: un `groupBy` de movimientos (para la cantidad
 * neta de cada insumo) y un `userMapFor` con todos los holders de una vez.
 */
async function serializeStockItemsBatch(
  items: {
    id: string
    code: string
    name: string
    unit: string
    category: string | null
    icon: string | null
    isReusable: boolean
    unitCost: unknown
    reorderPoint: unknown
    restockTarget: unknown
    createdAt: Date
    custodies: { id: string; holderUserId: string; quantity: unknown; notes: string | null; checkedOutAt: Date }[]
  }[],
) {
  const nonReusableIds = items.filter((i) => !i.isReusable).map((i) => i.id)
  const [movementSums, users] = await Promise.all([
    nonReusableIds.length > 0
      ? prisma.stockMovement.groupBy({
          by: ["stockItemId", "type"],
          where: { stockItemId: { in: nonReusableIds } },
          _sum: { quantity: true },
        })
      : Promise.resolve([]),
    userMapFor(items.flatMap((i) => (i.custodies[0] ? [i.custodies[0].holderUserId] : []))),
  ])

  const qtyMap = new Map<string, number>()
  for (const row of movementSums) {
    const amount = Number(row._sum.quantity ?? 0)
    const delta = row.type === "ingreso" ? amount : -amount
    qtyMap.set(row.stockItemId, (qtyMap.get(row.stockItemId) ?? 0) + delta)
  }

  return items.map((item) => {
    const active = item.custodies[0] ?? null
    const qty = item.isReusable ? null : (qtyMap.get(item.id) ?? 0)
    const unitCost = item.unitCost === null ? null : Number(item.unitCost)
    const reorderPoint = item.reorderPoint === null ? null : Number(item.reorderPoint)
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      icon: item.icon,
      isReusable: item.isReusable,
      unitCost,
      reorderPoint,
      restockTarget: item.restockTarget === null ? null : Number(item.restockTarget),
      createdAt: item.createdAt,
      currentQuantity: qty,
      totalValue: qty !== null && unitCost !== null ? qty * unitCost : null,
      belowReorderPoint: qty !== null && reorderPoint !== null ? qty <= reorderPoint : false,
      activeCustody: active
        ? {
            id: active.id,
            holder: users.get(active.holderUserId) ?? null,
            quantity: active.quantity,
            notes: active.notes,
            checkedOutAt: active.checkedOutAt,
          }
        : null,
    }
  })
}

export async function logisticsRoutes(app: FastifyInstance) {
  // ── Insumos (catálogo: materia prima, descartables, equipamiento
  // reusable con `isReusable: true`) ──
  app.get("/stock-items", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const items = await prisma.stockItem.findMany({ include: STOCK_ITEM_INCLUDE, orderBy: { name: "asc" } })
    return serializeStockItemsBatch(items)
  })

  // ── KPIs de stock para el panel (valuación total, insumos bajo punto de
  // pedido, equipamiento reusable actualmente prestado) ──
  app.get("/stock-summary", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const items = await prisma.stockItem.findMany({ include: STOCK_ITEM_INCLUDE })
    const serialized = await serializeStockItemsBatch(items)
    return {
      totalItems: serialized.length,
      totalValuation: serialized.reduce((sum, i) => sum + (i.totalValue ?? 0), 0),
      belowReorderPoint: serialized.filter((i) => i.belowReorderPoint).length,
      reusableOnLoan: serialized.filter((i) => i.isReusable && i.activeCustody).length,
    }
  })

  app.post("/stock-items", { preHandler: [requireAuth, requirePermission("logistics.write")] }, async (request, reply) => {
    const body = stockItemSchema.parse(request.body)
    const code = await nextStockCode()
    const item = await prisma.stockItem.create({
      data: {
        code,
        name: body.name,
        unit: body.unit,
        category: body.category || null,
        icon: body.icon || null,
        isReusable: body.isReusable ?? false,
        unitCost: body.unitCost,
        reorderPoint: body.reorderPoint,
        restockTarget: body.restockTarget,
      },
      include: STOCK_ITEM_INCLUDE,
    })
    // Bloque "Stock — cantidad inicial al crear": si vino con existencia de
    // arranque (y no es equipamiento reusable, que no usa el ledger), se
    // registra como el primer ingreso — evita el paso extra de crear el
    // insumo y después ir a "+ Movimiento" a cargar lo mismo.
    if (!item.isReusable && body.initialQuantity && body.initialQuantity > 0) {
      await prisma.stockMovement.create({
        data: {
          stockItemId: item.id,
          type: "ingreso",
          quantity: body.initialQuantity,
          reason: "Existencia inicial",
          createdBy: request.user!.sub,
        },
      })
    }
    return reply.code(201).send(await serializeStockItem(item))
  })

  app.patch("/stock-items/:id", { preHandler: [requireAuth, requirePermission("logistics.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const { initialQuantity: _ignored, ...rest } = stockItemSchema.partial().parse(request.body)
    const body = {
      ...rest,
      category: rest.category === undefined ? undefined : rest.category || null,
      icon: rest.icon === undefined ? undefined : rest.icon || null,
    }
    const item = await prisma.stockItem.update({ where: { id }, data: body, include: STOCK_ITEM_INCLUDE })
    return serializeStockItem(item)
  })

  app.delete(
    "/stock-items/:id",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await prisma.stockItem.delete({ where: { id } })
      return reply.code(204).send()
    },
  )

  // Bloque "Stock — reporte y alertas": insumos sin stock o bajo punto de
  // pedido, para una pantalla dedicada en vez de que la única señal sea el
  // email de maybeAlertLowStock. No persiste un historial de alertas
  // (abierta/resuelta) todavía — se calcula en vivo desde la cantidad
  // actual; si más adelante hace falta rastrear "quién resolvió cuál y
  // cuándo" hay que sumar un modelo propio.
  app.get("/stock-alerts", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const items = await prisma.stockItem.findMany({ where: { isReusable: false }, include: STOCK_ITEM_INCLUDE })
    const serialized = await Promise.all(items.map(serializeStockItem))
    return {
      sinStock: serialized.filter((i) => (i.currentQuantity ?? 0) <= 0),
      bajo: serialized.filter((i) => i.belowReorderPoint && (i.currentQuantity ?? 0) > 0),
    }
  })

  // Bloque "Stock — historial de movimientos unificado": antes el
  // historial solo se veía insumo por insumo ("Ver historial" adentro de
  // cada tarjeta) — acá se ven todos los movimientos juntos, filtrables
  // por fecha/tipo/responsable/búsqueda, para auditar una semana entera.
  app.get(
    "/stock-movements",
    { preHandler: [requireAuth, requirePermission("logistics.read")] },
    async (request) => {
      const query = z
        .object({
          dateFrom: z.string().optional(),
          dateTo: z.string().optional(),
          type: z.enum(["ingreso", "egreso"]).optional(),
          createdBy: z.string().uuid().optional(),
          search: z.string().trim().optional(),
        })
        .parse(request.query)

      const movements = await prisma.stockMovement.findMany({
        where: {
          type: query.type,
          createdBy: query.createdBy,
          createdAt: {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
          },
        },
        include: { stockItem: { select: { id: true, name: true, code: true, unit: true } } },
        orderBy: { createdAt: "desc" },
        take: 500,
      })

      const search = query.search?.toLowerCase()
      const filtered = search
        ? movements.filter(
            (m) =>
              m.stockItem.name.toLowerCase().includes(search) ||
              m.stockItem.code.toLowerCase().includes(search) ||
              (m.reason ?? "").toLowerCase().includes(search),
          )
        : movements

      const users = await userMapFor(filtered.map((m) => m.createdBy))
      return {
        summary: {
          totalIngresos: filtered.filter((m) => m.type === "ingreso").reduce((s, m) => s + Number(m.quantity), 0),
          totalEgresos: filtered.filter((m) => m.type === "egreso").reduce((s, m) => s + Number(m.quantity), 0),
          count: filtered.length,
          distinctItems: new Set(filtered.map((m) => m.stockItemId)).size,
        },
        movements: filtered.map((m) => ({
          id: m.id,
          type: m.type,
          quantity: m.quantity,
          reason: m.reason,
          relatedEntityType: m.relatedEntityType,
          stockItem: { id: m.stockItem.id, name: m.stockItem.name, code: m.stockItem.code, unit: m.stockItem.unit },
          createdBy: users.get(m.createdBy) ?? null,
          createdAt: m.createdAt,
        })),
      }
    },
  )

  // ── Movimientos de stock (ledger: ingreso al comprar/recibir donación,
  // egreso por ajuste manual — el egreso automático al cocinar sale de
  // /kitchen-batches/:id/ingredients, más abajo) ──
  app.get(
    "/stock-items/:id/movements",
    { preHandler: [requireAuth, requirePermission("logistics.read")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const movements = await prisma.stockMovement.findMany({ where: { stockItemId: id }, orderBy: { createdAt: "desc" } })
      const users = await userMapFor(movements.map((m) => m.createdBy))
      return movements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        reason: m.reason,
        relatedEntityType: m.relatedEntityType,
        createdBy: users.get(m.createdBy) ?? null,
        createdAt: m.createdAt,
      }))
    },
  )

  app.post(
    "/stock-items/:id/movements",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = movementSchema.parse(request.body)
      const item = await prisma.stockItem.findUniqueOrThrow({ where: { id } })
      if (item.isReusable) {
        return reply.code(400).send({ error: "Este insumo es reusable: se presta (custodia), no se mueve por stock" })
      }
      const qtyBefore = await currentQuantity(id)
      await prisma.stockMovement.create({
        data: { stockItemId: id, type: body.type, quantity: body.quantity, reason: body.reason || null, createdBy: request.user!.sub },
      })
      const qtyAfter = await currentQuantity(id)
      if (body.type === "egreso") await maybeAlertLowStock(id, qtyBefore, qtyAfter)
      const updated = await prisma.stockItem.findUniqueOrThrow({ where: { id }, include: STOCK_ITEM_INCLUDE })
      return reply.code(201).send(await serializeStockItem(updated))
    },
  )

  // ── Custodia de equipamiento reusable (conservadoras, termos, ollas...) ──
  app.post(
    "/stock-items/:id/custody",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = custodySchema.parse(request.body)
      const stockItem = await prisma.stockItem.findUniqueOrThrow({ where: { id } })
      if (!stockItem.isReusable) {
        return reply.code(400).send({ error: "Este insumo no es reusable, no aplica préstamo/custodia" })
      }
      await prisma.stockCustody.create({
        data: {
          stockItemId: id,
          holderUserId: body.holderUserId,
          quantity: body.quantity ?? 1,
          notes: body.notes || null,
          checkedOutBy: request.user!.sub,
        },
      })
      const item = await prisma.stockItem.findUniqueOrThrow({ where: { id }, include: STOCK_ITEM_INCLUDE })
      return reply.code(201).send(await serializeStockItem(item))
    },
  )

  app.patch(
    "/stock-custody/:custodyId/return",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { custodyId } = request.params as { custodyId: string }
      const body = returnCustodySchema.parse(request.body)
      const custody = await prisma.stockCustody.update({
        where: { id: custodyId },
        data: { returnedAt: new Date(), returnedNotes: body.returnedNotes || null },
      })
      const item = await prisma.stockItem.findUniqueOrThrow({
        where: { id: custody.stockItemId },
        include: STOCK_ITEM_INCLUDE,
      })
      return serializeStockItem(item)
    },
  )

  // Traspaso directo de custodia (ej. cocinero → despachador) en un solo
  // paso: antes había que devolver y después prestarle a la próxima
  // persona (dos llamadas, y en el medio el ítem quedaba "sin dueño"). Acá
  // se cierra el préstamo viejo y se abre uno nuevo atómicamente,
  // conservando el link al lote de cocina si lo tenía (Fase L).
  app.post(
    "/stock-custody/:custodyId/transfer",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { custodyId } = request.params as { custodyId: string }
      const body = transferCustodySchema.parse(request.body)
      const current = await prisma.stockCustody.findUniqueOrThrow({ where: { id: custodyId } })
      if (current.returnedAt) {
        return reply.code(400).send({ error: "Este préstamo ya fue devuelto, no se puede traspasar" })
      }
      if (current.holderUserId === body.holderUserId) {
        return reply.code(400).send({ error: "Ya lo tiene esa persona" })
      }
      await prisma.$transaction([
        prisma.stockCustody.update({
          where: { id: custodyId },
          data: { returnedAt: new Date(), returnedNotes: body.notes || "Traspaso directo a otra persona" },
        }),
        prisma.stockCustody.create({
          data: {
            stockItemId: current.stockItemId,
            holderUserId: body.holderUserId,
            quantity: current.quantity,
            notes: current.notes,
            checkedOutBy: request.user!.sub,
            batchId: current.batchId,
          },
        }),
      ])
      const item = await prisma.stockItem.findUniqueOrThrow({
        where: { id: current.stockItemId },
        include: STOCK_ITEM_INCLUDE,
      })
      return reply.code(201).send(await serializeStockItem(item))
    },
  )

  app.get(
    "/stock-items/:id/custody-history",
    { preHandler: [requireAuth, requirePermission("logistics.read")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const history = await prisma.stockCustody.findMany({ where: { stockItemId: id }, orderBy: { checkedOutAt: "desc" } })
      const users = await userMapFor([...history.map((h) => h.holderUserId), ...history.map((h) => h.checkedOutBy)])
      return history.map((h) => ({
        id: h.id,
        holder: users.get(h.holderUserId) ?? null,
        checkedOutBy: users.get(h.checkedOutBy) ?? null,
        quantity: h.quantity,
        notes: h.notes,
        checkedOutAt: h.checkedOutAt,
        returnedAt: h.returnedAt,
        returnedNotes: h.returnedNotes,
      }))
    },
  )

  // ── Lotes de cocina ──
  app.get("/kitchen-batches", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const batches = await prisma.kitchenBatch.findMany({ include: BATCH_INCLUDE, orderBy: { createdAt: "desc" } })
    return Promise.all(batches.map(serializeBatch))
  })

  // Fase L — "tablero del voluntario": el propio asignado (responsable o
  // ayudante) ve sus lotes acá, sin requerir logistics.read — mismo
  // criterio que /weekly-availability/me: autogestión de lo propio. Es lo
  // que alimenta el widget "Te toca cocinar" del dashboard.
  app.get("/kitchen-batches/mine", { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.sub
    const batches = await prisma.kitchenBatch.findMany({
      where: { OR: [{ responsibleUserId: userId }, { assignees: { some: { userId } } }] },
      include: BATCH_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    return Promise.all(batches.map(serializeBatch))
  })

  app.get("/kitchen-batches/:id", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async (request) => {
    const { id } = request.params as { id: string }
    const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
    return serializeBatch(batch)
  })

  app.post(
    "/kitchen-batches",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const body = batchSchema.parse(request.body)
      const batch = await prisma.kitchenBatch.create({
        data: {
          name: body.name,
          targetServings: body.targetServings,
          createdBy: request.user!.sub,
          responsibleUserId: body.responsibleUserId || null,
          statusHistory: { create: { toStatus: "preparacion", changedBy: request.user!.sub } },
        },
        include: BATCH_INCLUDE,
      })
      return reply.code(201).send(await serializeBatch(batch))
    },
  )

  app.patch(
    "/kitchen-batches/:id/responsible",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const { responsibleUserId } = responsibleSchema.parse(request.body)
      const batch = await prisma.kitchenBatch.update({
        where: { id },
        data: { responsibleUserId },
        include: BATCH_INCLUDE,
      })
      return serializeBatch(batch)
    },
  )

  app.patch(
    "/kitchen-batches/:id/status",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const { status } = statusSchema.parse(request.body)
      const batch = await prisma.kitchenBatch.update({
        where: { id },
        data: {
          status,
          statusHistory: { create: { toStatus: status, changedBy: request.user!.sub } },
        },
        include: BATCH_INCLUDE,
      })
      return serializeBatch(batch)
    },
  )

  // Asignar un ingrediente a un lote descuenta stock automáticamente (como
  // una venta): se registra el egreso por la cantidad asignada. Si ya había
  // una cantidad asignada antes, solo se mueve la DIFERENCIA (ledger nunca
  // se pisa, siempre se agrega un movimiento nuevo).
  app.post(
    "/kitchen-batches/:id/ingredients",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = ingredientSchema.parse(request.body)
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id } })
      const stockItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: body.stockItemId } })
      if (stockItem.isReusable) {
        return reply.code(400).send({ error: "Este insumo es reusable (equipamiento), no es un ingrediente consumible" })
      }
      const existing = await prisma.kitchenBatchIngredient.findUnique({
        where: { batchId_stockItemId: { batchId: id, stockItemId: body.stockItemId } },
      })
      const previousQty = existing ? Number(existing.quantityAssigned) : 0
      const delta = body.quantityAssigned - previousQty

      await prisma.kitchenBatchIngredient.upsert({
        where: { batchId_stockItemId: { batchId: id, stockItemId: body.stockItemId } },
        update: { quantityAssigned: body.quantityAssigned },
        create: { batchId: id, stockItemId: body.stockItemId, quantityAssigned: body.quantityAssigned },
      })

      if (delta !== 0) {
        const qtyBefore = await currentQuantity(body.stockItemId)
        await prisma.stockMovement.create({
          data: {
            stockItemId: body.stockItemId,
            type: delta > 0 ? "egreso" : "ingreso",
            quantity: Math.abs(delta),
            reason: `Ingrediente ${delta > 0 ? "asignado a" : "reducido de"} lote de cocina "${batch.name}"`,
            relatedEntityType: "kitchen_batch",
            relatedEntityId: id,
            createdBy: request.user!.sub,
          },
        })
        if (delta > 0) {
          const qtyAfter = await currentQuantity(body.stockItemId)
          await maybeAlertLowStock(body.stockItemId, qtyBefore, qtyAfter)
        }
      }

      const updatedBatch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(updatedBatch)
    },
  )

  // Quitar un ingrediente devuelve al stock lo que se le había asignado
  // (movimiento de ingreso, reversión — nunca se borra el egreso original).
  app.delete(
    "/kitchen-batches/:id/ingredients/:stockItemId",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id, stockItemId } = request.params as { id: string; stockItemId: string }
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id } })
      const existing = await prisma.kitchenBatchIngredient.findUnique({
        where: { batchId_stockItemId: { batchId: id, stockItemId } },
      })
      await prisma.kitchenBatchIngredient.delete({ where: { batchId_stockItemId: { batchId: id, stockItemId } } })
      if (existing && Number(existing.quantityAssigned) > 0) {
        await prisma.stockMovement.create({
          data: {
            stockItemId,
            type: "ingreso",
            quantity: existing.quantityAssigned,
            reason: `Se quitó el ingrediente del lote de cocina "${batch.name}"`,
            relatedEntityType: "kitchen_batch",
            relatedEntityId: id,
            createdBy: request.user!.sub,
          },
        })
      }
      const updatedBatch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(updatedBatch)
    },
  )

  // Fase L — "armar kit en un solo paso desde Cocina": sumar equipamiento
  // reusable (conservadora, olla) al lote no descuenta stock — abre un
  // préstamo (StockCustody) linkeado al lote, a nombre del responsable de
  // esta cocina (o de quien se indique explícitamente). Junto con
  // /ingredients de arriba, la pantalla de detalle del lote arma el kit
  // completo (insumos + equipamiento) desde un solo modal.
  app.post(
    "/kitchen-batches/:id/equipment",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = equipmentSchema.parse(request.body)
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id } })
      const stockItem = await prisma.stockItem.findUniqueOrThrow({ where: { id: body.stockItemId } })
      if (!stockItem.isReusable) {
        return reply.code(400).send({ error: "Este insumo no es reusable, no aplica como equipamiento del kit" })
      }
      const holderUserId = body.holderUserId || batch.responsibleUserId
      if (!holderUserId) {
        return reply
          .code(400)
          .send({ error: "Asigná un responsable a este lote antes de sumar equipamiento, o indicá quién lo lleva" })
      }
      await prisma.stockCustody.create({
        data: {
          stockItemId: body.stockItemId,
          holderUserId,
          quantity: body.quantity ?? 1,
          notes: body.notes || null,
          checkedOutBy: request.user!.sub,
          batchId: id,
        },
      })
      const updatedBatch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return reply.code(201).send(await serializeBatch(updatedBatch))
    },
  )

  // Quitar equipamiento del kit no borra el préstamo (queda como historial,
  // misma convención que /stock-custody/:id/return) — lo marca devuelto.
  app.delete(
    "/kitchen-batches/:id/equipment/:custodyId",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request, reply) => {
      const { id, custodyId } = request.params as { id: string; custodyId: string }
      const custody = await prisma.stockCustody.findUniqueOrThrow({ where: { id: custodyId } })
      if (custody.batchId !== id) {
        return reply.code(400).send({ error: "Ese préstamo no pertenece a este lote" })
      }
      if (!custody.returnedAt) {
        await prisma.stockCustody.update({
          where: { id: custodyId },
          data: { returnedAt: new Date(), returnedNotes: "Quitado del kit" },
        })
      }
      const updatedBatch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(updatedBatch)
    },
  )

  app.post(
    "/kitchen-batches/:id/assignees",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = assigneeSchema.parse(request.body)
      await prisma.kitchenBatchAssignee.upsert({
        where: { batchId_userId: { batchId: id, userId: body.userId } },
        update: { taskLabel: body.taskLabel || null },
        create: { batchId: id, userId: body.userId, taskLabel: body.taskLabel || null },
      })
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(batch)
    },
  )

  app.delete(
    "/kitchen-batches/:id/assignees/:userId",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await prisma.kitchenBatchAssignee.delete({ where: { batchId_userId: { batchId: id, userId } } })
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(batch)
    },
  )
}
