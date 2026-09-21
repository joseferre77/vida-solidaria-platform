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
  isReusable: z.boolean().optional(),
  unitCost: z.number().nonnegative().optional(),
  reorderPoint: z.number().nonnegative().optional(),
  restockTarget: z.number().nonnegative().optional(),
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
}) {
  const users = await userMapFor([
    batch.createdBy,
    batch.responsibleUserId,
    ...batch.assignees.map((a) => a.userId),
    ...batch.statusHistory.map((h) => h.changedBy),
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

export async function logisticsRoutes(app: FastifyInstance) {
  // ── Insumos (catálogo: materia prima, descartables, equipamiento
  // reusable con `isReusable: true`) ──
  app.get("/stock-items", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const items = await prisma.stockItem.findMany({ include: STOCK_ITEM_INCLUDE, orderBy: { name: "asc" } })
    return Promise.all(items.map(serializeStockItem))
  })

  // ── KPIs de stock para el panel (valuación total, insumos bajo punto de
  // pedido, equipamiento reusable actualmente prestado) ──
  app.get("/stock-summary", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    const items = await prisma.stockItem.findMany({ include: STOCK_ITEM_INCLUDE })
    const serialized = await Promise.all(items.map(serializeStockItem))
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
        isReusable: body.isReusable ?? false,
        unitCost: body.unitCost,
        reorderPoint: body.reorderPoint,
        restockTarget: body.restockTarget,
      },
      include: STOCK_ITEM_INCLUDE,
    })
    return reply.code(201).send(await serializeStockItem(item))
  })

  app.patch("/stock-items/:id", { preHandler: [requireAuth, requirePermission("logistics.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = stockItemSchema.partial().parse(request.body)
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
