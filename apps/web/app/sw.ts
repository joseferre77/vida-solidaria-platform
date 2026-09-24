/**
 * Fase O (24/09/2026): service worker real de la PWA. Hasta ahora
 * @serwist/next estaba instalado pero nunca conectado (ver next.config.mjs
 * — quedaba pospuesto "para esa fase del roadmap", nunca se llegó). Sin
 * esto no hay service worker, y sin service worker no hay push notification
 * posible en el celular — es el primer escalón necesario antes de todo lo
 * demás.
 *
 * `defaultCache` es el set de estrategias de cacheo recomendado por Serwist
 * para apps Next.js (fuentes, imágenes, JS/CSS) — no se personalizó nada
 * acá a propósito, el pedido de Josecito es notificaciones, no soporte
 * offline. Lo que sí es nuevo y a medida son los listeners de `push` y
 * `notificationclick` al final del archivo.
 */
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { Serwist } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
})

serwist.addEventListeners()

interface PushPayload {
  title: string
  body?: string
  link?: string
}

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload: PushPayload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: "Vida Solidaria", body: event.data.text() }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Vida Solidaria", {
      body: payload.body,
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      data: { link: payload.link || "/dashboard" },
    }),
  )
})

// Al tocar la notificación: si ya hay una pestaña/ventana de la app
// abierta, la enfoca y la navega ahí mismo; si no, abre una nueva. Así
// nunca se acumulan pestañas de a una por cada notificación tocada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = (event.notification.data?.link as string) || "/dashboard"
  const targetUrl = new URL(link, self.location.origin).href

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const existing = allClients.find((c) => "focus" in c)
      if (existing) {
        await (existing as WindowClient).focus()
        if ("navigate" in existing) await (existing as WindowClient).navigate(targetUrl)
        return
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})
