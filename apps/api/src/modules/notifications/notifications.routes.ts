/**
 * Fase K: notificaciones "en el sistema" (la campanita de la barra
 * superior). Genérico — cualquier módulo puede generar una acá (ver
 * `lib/notify.ts`); este archivo solo expone las rutas para que CADA
 * usuario vea/marque como leídas las SUYAS. No requiere un permiso
 * especial: cualquier usuario logueado ve sus propias notificaciones.
 */
import type { FastifyInstance } from "fastify"
import { prisma } from "../../lib/prisma"
import { requireAuth } from "../../middleware/auth.middleware"

export async function notificationsRoutes(app: FastifyInstance) {
  app.get("/notifications", { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.sub
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  })

  app.patch("/notifications/:id/read", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const notif = await prisma.notification.findUnique({ where: { id } })
    if (!notif || notif.userId !== request.user!.sub) {
      return reply.code(404).send({ error: "Notificación no encontrada" })
    }
    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
  })

  app.patch("/notifications/read-all", { preHandler: requireAuth }, async (request) => {
    await prisma.notification.updateMany({
      where: { userId: request.user!.sub, readAt: null },
      data: { readAt: new Date() },
    })
    return { ok: true }
  })
}
