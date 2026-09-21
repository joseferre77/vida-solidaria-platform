"use client"

import { useEffect, useState } from "react"
import { listBasicUsers, type BasicUser } from "../../../lib/projects"
import { nextSundayISO, formatDate } from "../../../lib/format"
import {
  addFieldTeamMember,
  createFieldTeam,
  deleteFieldTeam,
  listFieldTeams,
  removeFieldTeamMember,
  updateFieldTeam,
  type FieldTeamItem,
} from "../../../lib/field-ops"

/**
 * Fase K bloque B — CRUD de FieldTeam (equipos de campo, esto no cambia) +
 * gestión de integrantes AHORA POR SEMANA: un equipo se arma de nuevo cada
 * domingo según quién confirmó asistencia (ver pestaña "Presentismo"), así
 * que la lista de integrantes que se ve/edita acá es la de la semana
 * elegida arriba — no un padrón fijo. El selector arranca en el próximo
 * domingo (o hoy, si hoy es domingo).
 */
export function Equipos() {
  const [teams, setTeams] = useState<FieldTeamItem[] | null>(null)
  const [users, setUsers] = useState<BasicUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [managingMembersOf, setManagingMembersOf] = useState<FieldTeamItem | null>(null)
  const [week, setWeek] = useState(() => nextSundayISO())

  function refresh() {
    listFieldTeams()
      .then(setTeams)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    listBasicUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
  }, [])

  if (!teams || !users) return <p className="text-cream/50">Cargando...</p>

  const membersForWeek = (t: FieldTeamItem) => t.members.filter((m) => m.weekStartDate.slice(0, 10) === week)

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
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
        >
          + Nuevo equipo
        </button>
      </div>

      <p className="mb-4 text-xs text-cream/50">
        Mostrando integrantes confirmados para el domingo {formatDate(week)}. {teams.length}{" "}
        {teams.length === 1 ? "equipo" : "equipos"} en total (los equipos son permanentes; los integrantes se arman
        semana a semana).
      </p>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="space-y-3">
        {teams.map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/15 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-cream">{t.name}</p>
                {t.vehicleLabel && <p className="text-xs text-cream/50">Vehículo: {t.vehicleLabel}</p>}
              </div>
              <button
                onClick={() => {
                  if (!confirm(`¿Eliminar el equipo "${t.name}"?`)) return
                  deleteFieldTeam(t.id).then(refresh).catch((e) => setError(e.message))
                }}
                className="text-cream/30 hover:text-orange"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {membersForWeek(t).map((m) => (
                <span key={m.id} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-cream/80">
                  {m.name}
                </span>
              ))}
              {membersForWeek(t).length === 0 && (
                <span className="text-xs text-cream/40">Sin integrantes confirmados esta semana</span>
              )}
              <button onClick={() => setManagingMembersOf(t)} className="ml-1 text-xs text-yellow hover:underline">
                Gestionar integrantes de esta semana
              </button>
            </div>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-cream/50">Todavía no hay equipos creados.</p>}
      </div>

      {showForm && (
        <NewTeamModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            refresh()
          }}
        />
      )}

      {managingMembersOf && (
        <MembersModal
          team={managingMembersOf}
          weekStartDate={week}
          allUsers={users}
          onClose={() => {
            setManagingMembersOf(null)
            refresh()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function NewTeamModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [vehicleLabel, setVehicleLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setSaving(true)
          setError(null)
          try {
            await createFieldTeam({ name: name.trim(), vehicleLabel: vehicleLabel.trim() || undefined })
            onCreated()
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear el equipo")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo equipo</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Equipo Norte"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Vehículo (opcional)</span>
          <input
            value={vehicleLabel}
            onChange={(e) => setVehicleLabel(e.target.value)}
            placeholder="p. ej. Camioneta blanca AB123CD"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Creando..." : "Crear equipo"}
          </button>
        </div>
      </form>
    </div>
  )
}

function MembersModal({
  team,
  weekStartDate,
  allUsers,
  onClose,
  onError,
}: {
  team: FieldTeamItem
  weekStartDate: string
  allUsers: BasicUser[]
  onClose: () => void
  onError: (e: string) => void
}) {
  const [pickUserId, setPickUserId] = useState("")
  const [members, setMembers] = useState(() => team.members.filter((m) => m.weekStartDate.slice(0, 10) === weekStartDate))
  const memberIds = new Set(members.map((m) => m.id))
  const available = allUsers.filter((u) => !memberIds.has(u.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6">
        <h2 className="mb-1 font-display text-lg font-bold text-yellow">Integrantes de {team.name}</h2>
        <p className="mb-4 text-xs text-cream/50">Semana del {formatDate(weekStartDate)}</p>

        <div className="mb-4 space-y-1.5">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm text-cream">
              <span>{m.name}</span>
              <button
                onClick={() => {
                  removeFieldTeamMember(team.id, m.id, weekStartDate)
                    .then(() => setMembers((prev) => prev.filter((x) => x.id !== m.id)))
                    .catch((e) => onError(e.message))
                }}
                className="text-cream/30 hover:text-orange"
              >
                ✕
              </button>
            </div>
          ))}
          {members.length === 0 && <p className="text-xs text-cream/40">Sin integrantes confirmados esta semana</p>}
        </div>

        {available.length > 0 && (
          <div className="mb-4 flex gap-2">
            <select
              value={pickUserId}
              onChange={(e) => setPickUserId(e.target.value)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
            >
              <option value="" className="bg-purple-deep">
                Elegir persona...
              </option>
              {available.map((u) => (
                <option key={u.id} value={u.id} className="bg-purple-deep">
                  {u.name}
                </option>
              ))}
            </select>
            <button
              disabled={!pickUserId}
              onClick={() => {
                addFieldTeamMember(team.id, pickUserId, weekStartDate)
                  .then((updatedMembers) => {
                    setMembers(updatedMembers.map((u) => ({ ...u, weekStartDate })))
                    setPickUserId("")
                  })
                  .catch((e) => onError(e.message))
              }}
              className="rounded-lg bg-yellow px-3 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              + Agregar
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
