/**
 * Fase K: notificaciones "en el sistema" (la campanita de la barra
 * superior). Genérico — cualquier módulo puede generar una acá (ver
 * `lib/notify.ts`); este archivo solo expone las rutas para que CADA
 * usuario vea/marque como leídas las SUYAS. No requiere un permiso
 * especial: cualquier usuario logueado ve sus propias notificaciones.
 *
 * Fase S (25/09/2026): Josecito reportó que la campanita se iba llenando
 * de notificaciones viejas ya leídas — quedaban ahí para siempre, sin
 * forma de "vaciarla". Se separa en dos superficies:
 *  - GET /notifications (la campanita): SOLO no leídas — apenas se marca
 *    algo como leído, desaparece de acá.
 *  - GET /notifications/history + DELETE /notifications/read (página
 *    "Notificaciones" nueva en el frontend): el historial completo
 *    (leídas y no leídas, paginado) con un botón para borrar
 *    definitivamente las ya leídas.
 */
import type { FastifyInstance } from "fastify"
import { prisma } from "../../lib/prisma"
import { requireAuth } from "../../middleware/auth.middleware"

export async function notificationsRoutes(app: FastifyInstance) {
  // Campanita: solo lo no leído — el historial completo vive en
  // /notifications/history. `take: 30` es un tope de seguridad (si alguien
  // tiene más de 30 sin leer, unreadCount lo va a reflejar igual aunque la
  // lista corta el resto).
  app.get("/notifications", { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.sub
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  })

  // Historial completo (leídas + no leídas), paginado por página — pensado
  // para la pantalla "Notificaciones" dedicada, no para el polling de la
  // campanita.
  app.get("/notifications/history", { preHandler: requireAuth }, async (request) => {
    const userId = request.user!.sub
    const query = request.query as { page?: string }
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = 30
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.notification.count({ where: { userId } }),
    ])
    return { items, page, hasMore: page * pageSize < total, total }
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

  // Fase S — botón "Limpiar leídas" de la pantalla de historial: borra
  // definitivamente (no archiva) las notificaciones ya leídas de esta
  // persona. Las no leídas quedan intactas a propósito — limpiar no debería
  // poder tirar algo que todavía no se vio.
  app.delete("/notifications/read", { preHandler: requireAuth }, async (request) => {
    const { count } = await prisma.notification.deleteMany({
      where: { userId: request.user!.sub, readAt: { not: null } },
    })
    return { deleted: count }
  })
}
