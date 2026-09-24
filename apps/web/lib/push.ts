import { apiFetch } from "./api-client"

/**
 * Fase O (24/09/2026): suscripción a notificaciones push reales del
 * celular. Requiere el service worker de `app/sw.ts` ya registrado (ver
 * `components/RegisterServiceWorker.tsx`, montado una sola vez en
 * app/layout.tsx).
 */

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

/** true en iPhone/iPad — ahí Apple exige tener la PWA instalada (agregada
 * a la pantalla de inicio) antes de poder pedir el permiso de push. */
export function isIos() {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window)
}

/** true si esta pestaña corre como app instalada (standalone) — en vez de
 * como una pestaña normal de Safari/Chrome. */
export function isInstalledStandalone() {
  if (typeof window === "undefined") return false
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Pide permiso (si hace falta) y suscribe este dispositivo. Lanza un
 * Error con mensaje en criollo si el navegador no soporta push, si el
 * permiso fue denegado, o si el backend todavía no tiene VAPID cargada. */
export async function enablePushNotifications() {
  if (!pushSupported()) {
    throw new Error("Este navegador no soporta notificaciones push.")
  }

  // Si ya está en "denied", el navegador ni siquiera muestra el cartel de
  // permiso al llamar a requestPermission() — devuelve "denied" derecho,
  // en silencio. Sin este chequeo previo, el usuario ve el mismo cartel
  // genérico de "no diste el permiso" para siempre y no hay forma de
  // volver a pedirlo desde acá: hay que ir a la config del sitio en el
  // navegador y cambiarlo a mano (ver mensaje de abajo).
  if (Notification.permission === "denied") {
    throw new Error(
      "Las notificaciones están bloqueadas para este sitio en tu navegador — no podemos volver a pedir el permiso desde acá. Hacé clic en el ícono de candado (o \"i\") al lado de la dirección del sitio, buscá \"Notificaciones\" y ponelo en \"Permitir\", después recargá la página.",
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new Error("No diste el permiso de notificaciones — sin eso no podemos avisarte al celular.")
  }

  const { publicKey } = (await apiFetch("/api/push/vapid-public-key")) as { publicKey: string }

  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  const subscription =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }))

  const json = subscription.toJSON()
  await apiFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
      userAgent: navigator.userAgent.slice(0, 300),
    }),
  })

  return subscription
}

export async function disablePushNotifications() {
  const sub = await getExistingSubscription()
  if (!sub) return
  await apiFetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint: sub.endpoint }) })
  await sub.unsubscribe()
}
