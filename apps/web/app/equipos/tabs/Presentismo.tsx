"use client"

import { useEffect, useState } from "react"
import { nextSundayISO, formatDateOnly } from "../../../lib/format"
import { confirmWeeklyAvailability, listWeeklyAvailability, type WeeklyAvailabilityItem } from "../../../lib/field-ops"

/**
 * Fase K bloque B — vista de COORDINACIÓN del presentismo semanal: quién
 * avisó que viene este domingo (intención cargada por cada voluntario/a en
 * /presentismo) y, aparte, la confirmación real de coordinación (sábado o
 * domingo a la mañana, ya con el equipo pensado). De acá coordinación
 * decide a quién sumar en la pestaña "Equipos" de esta misma semana.
 */
export function Presentismo() {
  const [week, setWeek] = useState(() => nextSundayISO())
  const [items, setItems] = useState<WeeklyAvailabilityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    listWeeklyAvailability(week)
      .then(setItems)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week])

  const confirmedCount = items?.filter((i) => i.confirmedPresent === true).length ?? 0
  const sayYesCount = items?.filter((i) => i.willAttend).length ?? 0

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-cream/70">
          <span>Semana (domingo)</span>
          <input
            type="date"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-cream outline-none focus:border-yellow"
          />
        </label>
        {items && (
          <p className="text-xs text-cream/50">
            {sayYesCount} avisaron que vienen · {confirmedCount} confirmados por coordinación
          </p>
        )}
      </div>

      <p className="mb-4 text-xs text-cream/50">
        Domingo {formatDateOnly(week)}. Cada persona carga su intención desde su propia pantalla de Presentismo — acá
        coordinación confirma quién finalmente viene, y después arma los equipos en la pestaña "Equipos".
      </p>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {!items ? (
        <p className="text-cream/50">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-cream/50">Todavía nadie cargó su intención para este domingo.</p>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-cream">{i.user?.name ?? "—"}</p>
                  <p className="text-xs text-cream/50">
                    {i.willAttend ? "Avisó que viene" : "Avisó que no viene"}
                    {i.reason && ` — ${i.reason}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ConfirmBadge value={i.confirmedPresent} />
                  <button
                    onClick={() =>
                      confirmWeeklyAvailability(i.id, true)
                        .then(refresh)
                        .catch((e) => setError(e.message))
                    }
                    disabled={i.confirmedPresent === true}
                    className="rounded-lg bg-yellow px-2.5 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-40"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() =>
                      confirmWeeklyAvailability(i.id, false)
                        .then(refresh)
                        .catch((e) => setError(e.message))
                    }
                    disabled={i.confirmedPresent === false}
                    className="rounded-lg border border-white/20 px-2.5 py-1 text-xs text-cream/80 hover:bg-white/5 disabled:opacity-40"
                  >
                    No vino
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ConfirmBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-[11px] text-cream/40">Sin confirmar</span>
  if (value) return <span className="text-[11px] text-green-300">✓ Confirmado</span>
  return <span className="text-[11px] text-orange">No vino</span>
}
