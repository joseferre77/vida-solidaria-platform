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

interface PushAction {
  action: string
  title: string
  url: string
}

interface PushPayload {
  title: string
  body?: string
  link?: string
  // Fase P: botones tipo "Puedo" / "No puedo" en el aviso semanal — cada
  // uno con su propia URL (link firmado, no requiere sesión — ver
  // lib/confirm-token.ts en el backend). Se resuelven en segundo plano acá
  // abajo, SIN abrir la app, para que confirmar sea un solo toque.
  actions?: PushAction[]
}

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload: PushPayload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: "Vida Solidaria", body: event.data.text() }
  }

  // `actions` (botones tipo "Puedo" / "No puedo") es un campo válido en
  // runtime — spec Web Push / Notifications API — pero el lib.dom.d.ts de
  // TypeScript todavía no lo tipa en `NotificationOptions`, por eso el
  // `as object`. Se guardan también dentro de `data` (con su URL completa,
  // no solo el título del botón) para poder resolverlos en background en
  // `notificationclick` de abajo.
  // Fase R (25/09/2026): `badge` usaba el mismo ícono a color que `icon`
  // (icon-192.png), que es ~80% opaco — Android ignora el color y pinta
  // SOLO el canal alfa como silueta en la barra de estado, así que un PNG
  // mayormente opaco se veía como un bloque lavado/sin forma (bajo
  // contraste que reportó Josecito). badge-96.png es una silueta recortada
  // del isotipo con el alfa binarizado (ver el script que lo generó, en
  // public/brand/) — mismo criterio, ahora con una forma real en vez de un
  // cuadrado casi lleno.
  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: payload.body,
    icon: "/brand/icon-192.png",
    badge: "/brand/badge-96.png",
    data: { link: payload.link || "/dashboard", actions: payload.actions },
    actions: payload.actions?.map((a) => ({ action: a.action, title: a.title })),
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Vida Solidaria", options as object))
})

// Al tocar la notificación: si vino de un botón de acción ("Puedo" / "No
// puedo"), resuelve esa acción en segundo plano (un fetch a un link firmado
// que no necesita sesión abierta) y muestra un aviso corto de confirmación
// — sin abrir ninguna pestaña, para que sea un solo toque desde la pantalla
// de bloqueo. Si tocaron el cuerpo de la notificación (sin acción), sigue
// el comportamiento de siempre: enfocar la pestaña existente o abrir una.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const actions = (event.notification.data?.actions as PushAction[] | undefined) ?? []
  const matched = event.action ? actions.find((a) => a.action === event.action) : undefined

  if (matched) {
    event.waitUntil(
      (async () => {
        try {
          await fetch(matched.url)
          await self.registration.showNotification("Vida Solidaria", {
            body: "¡Listo! Quedó registrado.",
            icon: "/brand/icon-192.png",
            badge: "/brand/badge-96.png",
          })
        } catch {
          await self.registration.showNotification("Vida Solidaria", {
            body: "No se pudo registrar tu respuesta — abrí la app para confirmar desde Presentismo.",
            icon: "/brand/icon-192.png",
            badge: "/brand/badge-96.png",
          })
        }
      })(),
    )
    return
  }

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
