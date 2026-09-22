/**
 * Fase M — chat de coordinadores.
 *
 * Un solo canal interno (no hay canales por área todavía — el usuario
 * pidió arrancar simple), visible solo para quienes tienen el permiso
 * "coordination.chat" (todos los roles salvo voluntario, ver
 * rbac/permissions.ts). El front actualiza por polling cada ~6s; no hay
 * Socket.IO integrado en la plataforma todavía, así que no se metió acá
 * para no sumar infraestructura nueva por una sola pantalla.
 *
 * Sin edición ni borrado de mensajes en esta primera versión — un chat de
 * equipo simple, a la Slack/WhatsApp: se aclara en el propio chat si algo
 * estaba mal, no se corrige el historial.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "El mensaje no puede estar vacío").max(4000),
})

const MESSAGE_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const

function serializeMessage(m: {
  id: string
  body: string
  createdAt: Date
  createdBy: { id: string; name: string; email: string; avatarUrl: string | null }
}) {
  return {
    id: m.id,
    body: m.body,
    createdAt: m.createdAt,
    createdBy: m.createdBy,
  }
}

export async function coordinationRoutes(app: FastifyInstance) {
  // Últimos mensajes del canal, orden ascendente (más viejo primero, como
  // cualquier chat) — `after` permite pedir solo lo nuevo desde el último
  // mensaje ya visto en el front, para que el polling no traiga siempre
  // los 100 de siempre.
  app.get(
    "/coordination-chat/messages",
    { preHandler: [requireAuth, requirePermission("coordination.chat")] },
    async (request) => {
      const { after, limit } = request.query as { after?: string; limit?: string }
      const take = Math.min(Math.max(Number(limit) || 100, 1), 200)

      if (after) {
        const afterMsg = await prisma.coordinatorMessage.findUnique({ where: { id: after } })
        if (afterMsg) {
          const items = await prisma.coordinatorMessage.findMany({
            where: { createdAt: { gt: afterMsg.createdAt } },
            include: MESSAGE_INCLUDE,
            orderBy: { createdAt: "asc" },
            take,
          })
          return { items: items.map(serializeMessage) }
        }
      }

      const items = await prisma.coordinatorMessage.findMany({
        include: MESSAGE_INCLUDE,
        orderBy: { createdAt: "desc" },
        take,
      })
      return { items: items.map(serializeMessage).reverse() }
    },
  )

  app.post(
    "/coordination-chat/messages",
    { preHandler: [requireAuth, requirePermission("coordination.chat")] },
    async (request, reply) => {
      const body = sendMessageSchema.parse(request.body)
      const message = await prisma.coordinatorMessage.create({
        data: { body: body.body, createdById: request.user!.sub },
        include: MESSAGE_INCLUDE,
      })
      return reply.code(201).send(serializeMessage(message))
    },
  )
}
