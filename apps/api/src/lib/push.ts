/**
 * Fase O: notificaciones push reales al celular (pantalla de bloqueo, app
 * cerrada) — pedido de Josecito el 24/09/2026, mismo día que Resend quedó
 * configurado. Usa `web-push` (protocolo estándar Web Push, sin depender
 * de Firebase/APNs directo — funciona en Android/Chrome sin instalar nada
 * extra, y en iPhone una vez que la PWA está agregada a la pantalla de
 * inicio, ver `apps/web/app/sw.ts`).
 *
 * Mismo criterio que `lib/email.ts`: sin `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`
 * configuradas, esto NO rompe nada — loguea y sigue de largo. El resto del
 * sistema (crear stock, aprobar usuarios, notificar en la campanita, etc.)
 * funciona igual mientras no estén cargadas.
 */
import webpush from "web-push"
import { env } from "../config/env"
import { prisma } from "./prisma"

let configured = false
function ensureConfigured() {
  if (configured) return true
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  configured = true
  return true
}

interface PushPayload {
  title: string
  body?: string
  link?: string
}

/**
 * Manda un push real a TODOS los dispositivos suscriptos de un usuario.
 * Si una suscripción devuelve 404/410 (el navegador la dio de baja sola,
 * ej. desinstalaron la app o vencieron los permisos), se borra acá mismo
 * — no queda basura acumulándose en la tabla.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!ensureConfigured()) {
    console.warn(`[push] VAPID no configurada — se omite el push a usuario ${userId}: "${payload.title}"`)
    return
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link: payload.link ?? "/",
  })

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        } else {
          console.error(`[push] Falló el envío a la suscripción ${sub.id} (usuario ${userId}):`, err)
        }
      }
    }),
  )
}
