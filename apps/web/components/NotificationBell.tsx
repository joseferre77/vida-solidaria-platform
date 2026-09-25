"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../lib/notifications"
import { enablePushNotifications, getExistingSubscription, isInstalledStandalone, isIos, pushSupported } from "../lib/push"

/**
 * Fase O (24/09/2026): campanita de notificaciones en la barra superior.
 * El backend existía desde Fase K (GET/PATCH /notifications) pero nunca
 * tuvo consumidor en el frontend — quedaba anotado como pendiente. Se
 * aprovecha para vivir acá también la activación de push real al celular
 * (un solo lugar para "todo lo de notificaciones", en vez de dos).
 *
 * Polling cada 25s — mismo criterio liviano que el chat de coordinadores
 * (Fase M), no hay Socket.IO conectado a esto todavía.
 *
 * Fase R (25/09/2026): el menú desplegable pasa a fondo oscuro (tinta,
 * #2A1030) con texto papel — Josecito reportó bajo contraste leyendo
 * notificaciones con el esquema claro anterior. Se mantiene el resto de la
 * app (barra superior, etc.) igual, el pedido es puntual para acá y para
 * el push del celular (ver lib/push.ts / app/sw.ts).
 *
 * Fase S (25/09/2026): la campanita deja de acumular notificaciones viejas
 * — GET /notifications ahora devuelve SOLO lo no leído, así que apenas se
 * marca algo como leído (tocándolo o con "Marcar todas") desaparece de acá
 * en vez de quedarse para siempre. El historial completo (leídas incluidas,
 * con botón de limpiar) se movió a /notificaciones — "Ver todas" abajo.
 */
function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60_000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  const hs = Math.floor(min / 60)
  if (hs < 24) return `hace ${hs}h`
  const days = Math.floor(hs / 24)
  return `hace ${days}d`
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [pushState, setPushState] = useState<"unknown" | "off" | "on" | "unsupported" | "needs-install">("unknown")
  const [enabling, setEnabling] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    function load() {
      listNotifications()
        .then((res) => {
          if (cancelled) return
          setItems(res.items)
          setUnreadCount(res.unreadCount)
        })
        .catch(() => {})
    }
    load()
    const id = setInterval(load, 25_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    if (!pushSupported()) {
      setPushState("unsupported")
      return
    }
    if (isIos() && !isInstalledStandalone()) {
      setPushState("needs-install")
      return
    }
    getExistingSubscription()
      .then((sub) => setPushState(sub ? "on" : "off"))
      .catch(() => setPushState("off"))
  }, [])

  async function handleEnablePush() {
    setEnabling(true)
    setPushError(null)
    try {
      await enablePushNotifications()
      setPushState("on")
    } catch (err: any) {
      setPushError(err.message ?? "No se pudo activar")
    } finally {
      setEnabling(false)
    }
  }

  async function handleClickItem(n: NotificationItem) {
    // Fase S: la campanita solo muestra no leídas — al tocar una, se
    // marca leída Y se saca de la lista (no solo se le apaga el punto),
    // porque acá ya no tiene sentido mostrar algo leído.
    markNotificationRead(n.id).catch(() => {})
    setItems((prev) => prev.filter((i) => i.id !== n.id))
    setUnreadCount((c) => Math.max(0, c - 1))
    setOpen(false)
    if (n.link) router.push(n.link)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-violeta/70 hover:bg-violeta/8 hover:text-violeta"
        aria-label="Notificaciones"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 max-w-[90vw] overflow-hidden rounded-xl border border-papel/10 bg-tinta shadow-xl">
            {(pushState === "off" || pushState === "needs-install") && (
              <div className="border-b border-papel/10 bg-papel/5 p-3">
                {pushState === "needs-install" ? (
                  <p className="text-xs text-papel/85">
                    Para recibir avisos reales en este iPhone, primero agregá la app a tu pantalla de inicio (botón
                    Compartir → "Agregar a inicio") y volvé a entrar desde ahí.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-papel/85">Activá los avisos reales en este celular.</p>
                    <button
                      onClick={handleEnablePush}
                      disabled={enabling}
                      className="rounded-lg bg-amarillo px-3 py-1.5 text-xs font-semibold text-tinta hover:opacity-90 disabled:opacity-50"
                    >
                      {enabling ? "Activando..." : "Activar notificaciones"}
                    </button>
                    {pushError && <p className="mt-1.5 text-[11px] text-orange">{pushError}</p>}
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-papel/10 px-3 py-2">
              <span className="text-xs font-semibold text-papel">Notificaciones</span>
              {unreadCount > 0 && (
                <button
                  onClick={() => {
                    markAllNotificationsRead().catch(() => {})
                    // Fase S: al marcar todas como leídas, desaparecen de acá
                    // (la campanita ya no las muestra) en vez de quedarse
                    // apagadas en la lista.
                    setItems([])
                    setUnreadCount(0)
                  }}
                  className="text-[11px] font-medium text-amarillo hover:underline"
                >
                  Marcar todas como leídas
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 && (
                <p className="px-3 py-6 text-center text-xs text-papel/60">No tenés notificaciones nuevas.</p>
              )}
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClickItem(n)}
                  className={`block w-full border-b border-papel/5 px-3 py-2.5 text-left hover:bg-papel/10 ${
                    !n.readAt ? "bg-amarillo/15" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amarillo" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-papel">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[11px] text-papel/75">{n.body}</p>}
                      <p className="mt-0.5 text-[10px] text-papel/50">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <Link
              href="/notificaciones"
              onClick={() => setOpen(false)}
              className="block border-t border-papel/10 px-3 py-2 text-center text-xs font-medium text-amarillo hover:underline"
            >
              Ver todas →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
