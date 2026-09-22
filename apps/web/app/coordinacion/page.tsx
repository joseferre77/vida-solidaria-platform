"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import {
  listCoordinationMessages,
  sendCoordinationMessage,
  type CoordinationMessage,
} from "../../lib/coordinationChat"

const POLL_MS = 6000

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/**
 * Fase M — chat de coordinadores: un solo canal interno, solo para
 * quienes tienen el permiso "coordination.chat" (todos los roles salvo
 * voluntario). Actualiza por polling cada 6s (no hay Socket.IO integrado
 * en la plataforma todavía — se evaluó y se dejó para más adelante si
 * hace falta tiempo real de verdad).
 */
export default function CoordinacionChatPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [messages, setMessages] = useState<CoordinationMessage[] | null>(null)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lastIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      if (!hasPermission(u, "coordination.chat")) return router.replace("/dashboard")
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    let cancelled = false

    function poll() {
      listCoordinationMessages(lastIdRef.current)
        .then(({ items }) => {
          if (cancelled || items.length === 0) return
          lastIdRef.current = items[items.length - 1].id
          setMessages((prev) => (prev ? [...prev, ...items] : items))
        })
        .catch((e) => setError(e.message))
    }

    // Primera carga: historial reciente completo (sin `after`).
    listCoordinationMessages()
      .then(({ items }) => {
        if (cancelled) return
        setMessages(items)
        if (items.length > 0) lastIdRef.current = items[items.length - 1].id
      })
      .catch((e) => setError(e.message))

    const id = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setSending(true)
    setError(null)
    try {
      const sent = await sendCoordinationMessage(body)
      setMessages((prev) => (prev ? [...prev, sent] : [sent]))
      lastIdRef.current = sent.id
      setDraft("")
    } catch (err: any) {
      setError(err.message ?? "No se pudo enviar")
    } finally {
      setSending(false)
    }
  }

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  return (
    <main className="flex h-[calc(100vh-56px)] flex-col px-4 py-4 sm:px-6 sm:py-6">
      <header className="mb-3">
        <h1 className="font-display text-2xl font-bold text-yellow">Chat de coordinadores</h1>
        <p className="mt-1 text-sm text-cream/60">
          Un solo canal para todo el equipo de coordinación. Se actualiza solo cada pocos segundos.
        </p>
      </header>

      <div
        ref={listRef}
        className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-2xl border border-white/15 bg-white/5 p-4"
      >
        {messages === null && <p className="text-sm text-cream/50">Cargando mensajes...</p>}
        {messages !== null && messages.length === 0 && (
          <p className="text-sm text-cream/50">Todavía no hay mensajes. Arrancá la conversación.</p>
        )}
        {messages?.map((m) => {
          const mine = m.createdBy.id === user?.id
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse text-right" : ""}`}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple text-[10px] font-bold text-cream">
                {initials(m.createdBy.name)}
              </span>
              <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-cream/80">{mine ? "Vos" : m.createdBy.name}</span>
                  <span className="text-[10px] text-cream/40">{formatTime(m.createdAt)}</span>
                </div>
                <p
                  className={`mt-0.5 whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                    mine ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream"
                  }`}
                >
                  {m.body}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="mb-2 text-sm text-orange">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend(e)
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Escribí un mensaje para el equipo de coordinación..."
          className="flex-1 resize-none rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="shrink-0 rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </main>
  )
}
