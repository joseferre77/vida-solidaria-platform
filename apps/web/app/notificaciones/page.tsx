"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, type SessionUser } from "../../lib/auth"
import {
  clearReadNotifications,
  listNotificationsHistory,
  markNotificationRead,
  type NotificationItem,
} from "../../lib/notifications"
import { timeAgo } from "../../lib/format"

/**
 * Fase S (25/09/2026): historial completo de notificaciones — hasta ahora
 * la única forma de verlas era la campanita, que además guardaba TODO
 * (leídas incluidas) sin forma de vaciarla. Se separó: la campanita
 * (components/NotificationBell.tsx) pasó a mostrar solo lo no leído, y
 * acá queda el historial entero (paginado) con un botón para borrar
 * definitivamente las que ya se leyeron. Autogestión de lo propio, sin
 * permiso especial — mismo criterio que /presentismo.
 */
export default function NotificacionesPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    listNotificationsHistory(1)
      .then((res) => {
        setItems(res.items)
        setPage(res.page)
        setHasMore(res.hasMore)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [user])

  function loadMore() {
    setLoadingMore(true)
    listNotificationsHistory(page + 1)
      .then((res) => {
        setItems((prev) => [...prev, ...res.items])
        setPage(res.page)
        setHasMore(res.hasMore)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMore(false))
  }

  function handleClickItem(n: NotificationItem) {
    if (!n.readAt) {
      markNotificationRead(n.id).catch(() => {})
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)))
    }
    if (n.link) router.push(n.link)
  }

  function handleClear() {
    setClearing(true)
    clearReadNotifications()
      .then(() => {
        // Se borraron definitivamente en el servidor — se sacan de la
        // lista local sin esperar un refetch.
        setItems((prev) => prev.filter((i) => !i.readAt))
      })
      .catch((e) => setError(e.message))
      .finally(() => setClearing(false))
  }

  const hasReadItems = items.some((i) => i.readAt)

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-yellow">Notificaciones</h1>
          <p className="mt-1 max-w-xl text-sm text-cream/60">
            Todo lo que te avisó el sistema — leídas y no leídas. La campanita de arriba solo muestra lo nuevo.
          </p>
        </div>
        <button
          onClick={handleClear}
          disabled={clearing || !hasReadItems}
          className="shrink-0 rounded-xl border border-white/20 px-3 py-1.5 text-xs font-medium text-cream/80 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {clearing ? "Borrando..." : "Limpiar leídas"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {loading ? (
        <p className="text-sm text-cream/50">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-white/15 bg-white/5 p-6 text-center text-sm text-cream/50">
          Todavía no tenés notificaciones.
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => handleClickItem(n)}
                  className={`block w-full rounded-xl border px-4 py-3 text-left transition ${
                    n.readAt
                      ? "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                      : "border-amarillo/30 bg-amarillo/10 hover:bg-amarillo/15"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amarillo" />}
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${n.readAt ? "text-cream/70" : "text-cream"}`}>{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-cream/60">{n.body}</p>}
                      <p className="mt-1 text-[11px] text-cream/40">
                        {timeAgo(n.createdAt)}
                        {n.readAt && " · leída"}
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="mt-4 w-full rounded-xl border border-white/15 py-2 text-sm text-cream/70 hover:bg-white/5 disabled:opacity-50"
            >
              {loadingMore ? "Cargando..." : "Ver más"}
            </button>
          )}
        </>
      )}
    </main>
  )
}
