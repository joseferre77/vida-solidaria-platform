"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, type SessionUser } from "../../lib/auth"
import { nextSundayISO, formatDate } from "../../lib/format"
import { getMyAvailability, setMyAvailability, type MyAvailability } from "../../lib/field-ops"

/**
 * Fase K bloque B — autogestión del presentismo semanal ("¿venís este
 * domingo?"). A propósito NO está atrás de field_ops.* como /equipos:
 * cualquier voluntario/a logueado carga acá su propia intención, sea cual
 * sea su rol — es el insumo que coordinación usa (en /equipos → pestaña
 * Presentismo) para armar los equipos de la semana. Mismo criterio que
 * /notifications: autogestión de lo propio, sin permiso especial.
 */
export default function PresentismoPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [week, setWeek] = useState(() => nextSundayISO())
  const [availability, setAvailability] = useState<MyAvailability | null | undefined>(undefined)
  const [willAttend, setWillAttend] = useState<boolean | null>(null)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    setAvailability(undefined)
    setSaved(false)
    getMyAvailability(week)
      .then(({ availability: a }) => {
        setAvailability(a)
        setWillAttend(a?.willAttend ?? null)
        setReason(a?.reason ?? "")
      })
      .catch((e) => setError(e.message))
  }, [user, week])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-yellow">Presentismo</h1>
        <p className="mt-1 max-w-xl text-sm text-cream/60">
          Contanos si venís al próximo encuentro del domingo. Con esto, coordinación arma los equipos de la semana.
        </p>
      </header>

      <div className="max-w-md rounded-2xl border border-white/15 bg-white/5 p-5">
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Domingo</span>
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        {availability === undefined ? (
          <p className="text-sm text-cream/50">Cargando...</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (willAttend === null) return
              setSaving(true)
              setError(null)
              setSaved(false)
              try {
                const updated = await setMyAvailability({
                  weekStartDate: week,
                  willAttend,
                  reason: willAttend ? undefined : reason.trim() || undefined,
                })
                setAvailability(updated)
                setSaved(true)
              } catch (err: any) {
                setError(err.message ?? "No se pudo guardar")
              } finally {
                setSaving(false)
              }
            }}
          >
            <p className="mb-2 text-sm text-cream/70">¿Venís el domingo {formatDate(week)}?</p>
            <div className="mb-4 flex gap-3">
              <button
                type="button"
                onClick={() => setWillAttend(true)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                  willAttend === true ? "bg-yellow text-purple-deep" : "border border-white/20 text-cream/80 hover:bg-white/5"
                }`}
              >
                Sí, voy
              </button>
              <button
                type="button"
                onClick={() => setWillAttend(false)}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                  willAttend === false ? "bg-orange text-purple-deep" : "border border-white/20 text-cream/80 hover:bg-white/5"
                }`}
              >
                No puedo
              </button>
            </div>

            {willAttend === false && (
              <label className="mb-4 block text-sm">
                <span className="mb-1 block text-cream/70">Motivo (opcional)</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="Contanos por qué, si querés"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
                />
              </label>
            )}

            {error && <p className="mb-3 text-sm text-orange">{error}</p>}
            {saved && !error && <p className="mb-3 text-sm text-green-300">¡Guardado! Gracias por avisar.</p>}

            <button
              type="submit"
              disabled={saving || willAttend === null}
              className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>

            {availability?.confirmedPresent !== null && availability?.confirmedPresent !== undefined && (
              <p className="mt-4 text-xs text-cream/50">
                Coordinación ya te marcó como{" "}
                <span className={availability.confirmedPresent ? "text-green-300" : "text-orange"}>
                  {availability.confirmedPresent ? "confirmado/a" : "no vino"}
                </span>{" "}
                para este domingo.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  )
}
