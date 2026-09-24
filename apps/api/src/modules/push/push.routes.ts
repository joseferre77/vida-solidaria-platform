/**
 * Fase O: suscripción a notificaciones push del celular. Cualquier
 * usuario logueado puede suscribir/desuscribir SUS propios dispositivos
 * — no requiere un permiso especial, igual que `/notifications`.
 *
 * `PushSubscription.endpoint` es único por naturaleza (lo genera el
 * navegador — cada dispositivo/instalación tiene el suyo), así que un
 * `upsert` por endpoint alcanza para "activar de nuevo" sin duplicar si
 * el usuario ya lo había suscripto antes (ej. reinstaló la PWA).
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth } from "../../middleware/auth.middleware"
import { env } from "../../config/env"

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(300).optional(),
})

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function pushRoutes(app: FastifyInstance) {
  // Pública a propósito (no requiere auth): la clave VAPID pública no es
  // secreta — es la misma idea que una API key "pública" de Stripe. El
  // front la usa para armar la suscripción ANTES de tener sesión activa
  // en algunos casos (ej. pantalla de login en un dispositivo nuevo).
  app.get("/push/vapid-public-key", async (_request, reply) => {
    if (!env.VAPID_PUBLIC_KEY) {
      return reply.code(404).send({ error: "Notificaciones push no configuradas todavía" })
    }
    return { publicKey: env.VAPID_PUBLIC_KEY }
  })

  app.post("/push/subscribe", { preHandler: requireAuth }, async (request, reply) => {
    const body = subscribeSchema.parse(request.body)
    const userId = request.user!.sub

    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: {
        userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      },
      // Si el mismo endpoint ya existía pero de OTRO usuario (ej. alguien
      // compartió el celular y ahora se loguea otra persona con la misma
      // instalación de la PWA), la suscripción pasa a ser de quien la
      // reactivó ahora — tiene más sentido que dejarla huérfana.
      update: {
        userId,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: body.userAgent,
      },
    })

    return reply.code(201).send({ ok: true })
  })

  app.delete("/push/subscribe", { preHandler: requireAuth }, async (request, reply) => {
    const body = unsubscribeSchema.parse(request.body)
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: request.user!.sub } })
    return reply.code(204).send()
  })
}
