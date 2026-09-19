"use client"

import { useMemo } from "react"
import type { TimeEntryItem } from "../../../../lib/projects"
import { formatDateTime, formatMinutes, initials } from "../../../../lib/format"

function entryMinutes(entry: TimeEntryItem): number {
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : Date.now()
  return Math.max(0, Math.round((end - new Date(entry.startedAt).getTime()) / 60000))
}

/** Fase E — "Hoja de Tiempo": todos los tramos de cronómetro del proyecto, con total por persona. */
export function HojaDeTiempo({ entries }: { entries: TimeEntryItem[] }) {
  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; minutes: number }>()
    for (const e of entries) {
      const key = e.user?.id ?? e.userId
      const prev = map.get(key) ?? { name: e.user?.name ?? "—", minutes: 0 }
      prev.minutes += entryMinutes(e)
      map.set(key, prev)
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes)
  }, [entries])

  const totalMinutes = byUser.reduce((sum, u) => sum + u.minutes, 0)

  return (
    <div>
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-[240px_1fr]">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-cream/50">Total registrado</p>
          <p className="font-display text-2xl font-bold text-yellow">{formatMinutes(totalMinutes)}</p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-cream/50">Por persona</p>
          <ul className="space-y-1.5">
            {byUser.map((u) => (
              <li key={u.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-cream/80">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow/80 text-[8px] font-bold text-purple-deep">
                    {initials(u.name)}
                  </span>
                  {u.name}
                </span>
                <span className="text-cream">{formatMinutes(u.minutes)}</span>
              </li>
            ))}
            {byUser.length === 0 && <p className="text-xs text-cream/40">Sin registros todavía.</p>}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
              <th className="px-4 py-3 font-medium">Persona</th>
              <th className="px-4 py-3 font-medium">Tarea</th>
              <th className="px-4 py-3 font-medium">Inicio</th>
              <th className="px-4 py-3 font-medium">Fin</th>
              <th className="px-4 py-3 font-medium">Duración</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-white/5">
                <td className="whitespace-nowrap px-4 py-3 text-cream/80">{e.user?.name ?? "—"}</td>
                <td className="px-4 py-3 text-cream/80">{e.task?.title ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-cream/60">{formatDateTime(e.startedAt)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-cream/60">
                  {e.endedAt ? formatDateTime(e.endedAt) : <span className="text-yellow">Corriendo</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-cream">{formatMinutes(entryMinutes(e))}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cream/50">
                  Todavía no hay tiempo registrado en este proyecto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
