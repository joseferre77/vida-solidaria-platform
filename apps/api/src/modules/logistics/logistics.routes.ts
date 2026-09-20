/**
 * Módulo: Logística / cocina (permiso `logistics.read` / `logistics.write`).
 *
 * Cubre la sección "Cocina": lotes de comida (KitchenBatch) que avanzan por
 * un estado fijo (preparación → cocción → listo para transporte →
 * entregado), con insumos (StockItem, un catálogo mínimo de inventario) y
 * personas asignadas. El movimiento de stock en sí (StockMovement,
 * ingresos/egresos de depósito) queda fuera de esta primera versión — acá
 * solo se cubre lo necesario para armar y trackear un lote de cocina.
 *
 * Nota de schema: igual que en field-ops, `KitchenBatch.createdBy` y
 * `KitchenBatchAssignee.userId` / `KitchenBatchStatusHistory.changedBy` son
 * campos sueltos sin relación de Prisma hacia `User` — se resuelven acá con
 * una consulta aparte en vez de `include`.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"

const stockItemSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  unit: z.string().min(1, "La unidad es obligatoria"),
  category: z.string().trim().optional(),
  minStockAlert: z.number().nonnegative().optional(),
})

const batchSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  targetServings: z.number().int().positive(),
})

const KITCHEN_STATUSES = ["preparacion", "coccion", "listo_transporte", "entregado"] as const

const statusSchema = z.object({ status: z.enum(KITCHEN_STATUSES) })

const ingredientSchema = z.object({
  stockItemId: z.string().uuid(),
  quantityAssigned: z.number().positive(),
})

const assigneeSchema = z.object({
  userId: z.string().uuid(),
  taskLabel: z.string().trim().optional(),
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
  createdAt: Date
  ingredients: { stockItemId: string; quantityAssigned: unknown; stockItem: { id: string; name: string; unit: string } }[]
  assignees: { userId: string; taskLabel: string | null }[]
  statusHistory: { id: string; toStatus: string; changedBy: string; changedAt: Date }[]
}) {
  const users = await userMapFor([
    batch.createdBy,
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

export async function logisticsRoutes(app: FastifyInstance) {
  // ── Insumos (catálogo mínimo, para poder cargar ingredientes de un lote) ──
  app.get("/stock-items", { preHandler: [requireAuth, requirePermission("logistics.read")] }, async () => {
    return prisma.stockItem.findMany({ orderBy: { name: "asc" } })
  })

  app.post("/stock-items", { preHandler: [requireAuth, requirePermission("logistics.write")] }, async (request, reply) => {
    const body = stockItemSchema.parse(request.body)
    const item = await prisma.stockItem.create({
      data: { name: body.name, unit: body.unit, category: body.category || null, minStockAlert: body.minStockAlert },
    })
    return reply.code(201).send(item)
  })

  app.patch("/stock-items/:id", { preHandler: [requireAuth, requirePermission("logistics.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = stockItemSchema.partial().parse(request.body)
    return prisma.stockItem.update({ where: { id }, data: body })
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
          statusHistory: { create: { toStatus: "preparacion", changedBy: request.user!.sub } },
        },
        include: BATCH_INCLUDE,
      })
      return reply.code(201).send(await serializeBatch(batch))
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

  app.post(
    "/kitchen-batches/:id/ingredients",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = ingredientSchema.parse(request.body)
      await prisma.kitchenBatchIngredient.upsert({
        where: { batchId_stockItemId: { batchId: id, stockItemId: body.stockItemId } },
        update: { quantityAssigned: body.quantityAssigned },
        create: { batchId: id, stockItemId: body.stockItemId, quantityAssigned: body.quantityAssigned },
      })
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(batch)
    },
  )

  app.delete(
    "/kitchen-batches/:id/ingredients/:stockItemId",
    { preHandler: [requireAuth, requirePermission("logistics.write")] },
    async (request) => {
      const { id, stockItemId } = request.params as { id: string; stockItemId: string }
      await prisma.kitchenBatchIngredient.delete({ where: { batchId_stockItemId: { batchId: id, stockItemId } } })
      const batch = await prisma.kitchenBatch.findUniqueOrThrow({ where: { id }, include: BATCH_INCLUDE })
      return serializeBatch(batch)
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
