"use client"

import { useEffect, useState } from "react"
import {
  createZone,
  createZoneAssignment,
  deleteZone,
  deleteZoneAssignment,
  listFieldTeams,
  listZones,
  type FieldTeamItem,
  type ZoneItem,
} from "../../../lib/field-ops"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Fase I — CRUD de Zone + asignación semanal de un equipo (ZoneAssignment). */
export function Zonas() {
  const [zones, setZones] = useState<ZoneItem[] | null>(null)
  const [teams, setTeams] = useState<FieldTeamItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newZoneName, setNewZoneName] = useState("")
  const [assigningTo, setAssigningTo] = useState<ZoneItem | null>(null)

  function refresh() {
    listZones()
      .then(setZones)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    listFieldTeams()
      .then(setTeams)
      .catch((e) => setError(e.message))
  }, [])

  if (!zones || !teams) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-3xl">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!newZoneName.trim()) return
          try {
            await createZone(newZoneName.trim())
            setNewZoneName("")
            refresh()
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear la zona")
          }
        }}
        className="mb-5 flex gap-2"
      >
        <input
          value={newZoneName}
          onChange={(e) => setNewZoneName(e.target.value)}
          placeholder="Nombre de la zona nueva"
          className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        />
        <button type="submit" disabled={!newZoneName.trim()} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
          + Crear zona
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="space-y-3">
        {zones.map((z) => (
          <div key={z.id} className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold text-cream">{z.name}</p>
              <div className="flex items-center gap-3">
                <button onClick={() => setAssigningTo(z)} className="text-xs text-yellow hover:underline">
                  + Asignar equipo
                </button>
                <button
                  onClick={() => {
                    if (!confirm(`¿Eliminar la zona "${z.name}"?`)) return
                    deleteZone(z.id).then(refresh).catch((e) => setError(e.message))
                  }}
                  className="text-cream/30 hover:text-orange"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              {z.assignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm">
                  <span className="text-cream/80">
                    {a.teamName} · {formatDate(a.weekStartDate)} – {formatDate(a.weekEndDate)}
                  </span>
                  <button
                    onClick={() => deleteZoneAssignment(a.id).then(refresh).catch((e) => setError(e.message))}
                    className="text-cream/30 hover:text-orange"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {z.assignments.length === 0 && <p className="text-xs text-cream/40">Sin equipo asignado todavía</p>}
            </div>
          </div>
        ))}
        {zones.length === 0 && <p className="text-sm text-cream/50">Todavía no hay zonas creadas.</p>}
      </div>

      {assigningTo && (
        <AssignModal
          zone={assigningTo}
          teams={teams}
          onClose={() => setAssigningTo(null)}
          onAssigned={() => {
            setAssigningTo(null)
            refresh()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function AssignModal({
  zone,
  teams,
  onClose,
  onAssigned,
  onError,
}: {
  zone: ZoneItem
  teams: FieldTeamItem[]
  onClose: () => void
  onAssigned: () => void
  onError: (e: string) => void
}) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "")
  const [weekStart, setWeekStart] = useState("")
  const [weekEnd, setWeekEnd] = useState("")
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!teamId || !weekStart || !weekEnd) return
          setSaving(true)
          try {
            await createZoneAssignment({ zoneId: zone.id, teamId, weekStartDate: weekStart, weekEndDate: weekEnd })
            onAssigned()
          } catch (err: any) {
            onError(err.message ?? "No se pudo asignar el equipo")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Asignar equipo a {zone.name}</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Equipo</span>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-purple-deep">
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Desde</span>
            <input
              required
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Hasta</span>
            <input
              required
              type="date"
              value={weekEnd}
              onChange={(e) => setWeekEnd(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || teams.length === 0}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Asignar"}
          </button>
        </div>
      </form>
    </div>
  )
}
