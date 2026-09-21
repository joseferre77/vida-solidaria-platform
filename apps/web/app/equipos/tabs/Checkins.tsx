"use client"

import { useEffect, useState } from "react"
import {
  createCheckin,
  listCheckins,
  listFieldTeams,
  type CheckinItem,
  type CheckinType,
  type FieldTeamItem,
} from "../../../lib/field-ops"

const TYPE_LABEL: Record<CheckinType, string> = {
  en_camino: "En camino",
  llegamos: "Llegamos",
  presente_punto_encuentro: "Presente en punto de encuentro",
  presente_zona: "Presente en zona",
  entregando_viandas: "Entregando viandas",
  relevando_caso: "Relevando caso",
}

const TYPE_COLOR: Record<CheckinType, string> = {
  en_camino: "bg-white/10 text-cream/80",
  llegamos: "bg-yellow/20 text-yellow",
  presente_punto_encuentro: "bg-yellow/20 text-yellow",
  presente_zona: "bg-purple-400/20 text-purple-200",
  entregando_viandas: "bg-green-500/20 text-green-300",
  relevando_caso: "bg-orange/20 text-orange",
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

/**
 * Fase I — registro de check-ins de terreno. Cubre tanto Extracción de
 * calle (en_camino / llegamos / entregando_viandas) como Relevamiento
 * (relevando_caso) porque ambas secciones comparten el mismo modelo.
 */
export function Checkins() {
  const [checkins, setCheckins] = useState<CheckinItem[] | null>(null)
  const [teams, setTeams] = useState<FieldTeamItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filterType, setFilterType] = useState<CheckinType | "">("")

  function refresh(type?: CheckinType | "") {
    listCheckins(type ? { type } : undefined)
      .then(setCheckins)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    listFieldTeams()
      .then(setTeams)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!checkins || !teams) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={filterType}
          onChange={(e) => {
            const v = e.target.value as CheckinType | ""
            setFilterType(v)
            refresh(v)
          }}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        >
          <option value="" className="bg-purple-deep">
            Todos los tipos
          </option>
          {(Object.keys(TYPE_LABEL) as CheckinType[]).map((t) => (
            <option key={t} value={t} className="bg-purple-deep">
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
        >
          + Nuevo check-in
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="space-y-2">
        {checkins.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_COLOR[c.type]}`}>
                  {TYPE_LABEL[c.type]}
                </span>
                <span className="text-sm text-cream">{c.user?.name ?? "—"}</span>
                {c.team && <span className="text-xs text-cream/50">· {c.team.name}</span>}
              </div>
              <span className="text-xs text-cream/40">{formatDateTime(c.createdAt)}</span>
            </div>
            {c.deliveries.length > 0 && (
              <p className="mt-1.5 text-xs text-cream/60">
                Entregado: {c.deliveries.map((d) => `${d.quantity} ${d.itemLabel}`).join(", ")}
              </p>
            )}
          </div>
        ))}
        {checkins.length === 0 && <p className="text-sm text-cream/50">Todavía no hay check-ins registrados.</p>}
      </div>

      {showForm && (
        <NewCheckinModal
          teams={teams}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            refresh(filterType)
          }}
        />
      )}
    </div>
  )
}

function NewCheckinModal({
  teams,
  onClose,
  onCreated,
}: {
  teams: FieldTeamItem[]
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState<CheckinType>("en_camino")
  const [teamId, setTeamId] = useState("")
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [deliveries, setDeliveries] = useState<{ itemLabel: string; quantity: string }[]>([
    { itemLabel: "", quantity: "" },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener la ubicación")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => {
        setError("No se pudo obtener la ubicación — ingresala a mano")
        setLocating(false)
      },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!lat || !lng) return
          setSaving(true)
          setError(null)
          try {
            await createCheckin({
              type,
              teamId: teamId || undefined,
              lat: Number(lat),
              lng: Number(lng),
              deliveries:
                type === "entregando_viandas"
                  ? deliveries
                      .filter((d) => d.itemLabel.trim() && d.quantity)
                      .map((d) => ({ itemLabel: d.itemLabel.trim(), quantity: Number(d.quantity) }))
                  : undefined,
            })
            onCreated()
          } catch (err: any) {
            setError(err.message ?? "No se pudo registrar el check-in")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo check-in</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CheckinType)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            {(Object.keys(TYPE_LABEL) as CheckinType[]).map((t) => (
              <option key={t} value={t} className="bg-purple-deep">
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Equipo (opcional)</span>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-purple-deep">
              Sin equipo
            </option>
            {teams.map((t) => (
              <option key={t.id} value={t.id} className="bg-purple-deep">
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {type === "entregando_viandas" && (
          <div className="mb-3">
            <span className="mb-1 block text-sm text-cream/70">Qué se entregó</span>
            {deliveries.map((d, i) => (
              <div key={i} className="mb-1.5 flex gap-2">
                <input
                  value={d.itemLabel}
                  onChange={(e) => {
                    const next = [...deliveries]
                    next[i] = { ...next[i], itemLabel: e.target.value }
                    setDeliveries(next)
                  }}
                  placeholder="Viandas"
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
                />
                <input
                  type="number"
                  min="1"
                  value={d.quantity}
                  onChange={(e) => {
                    const next = [...deliveries]
                    next[i] = { ...next[i], quantity: e.target.value }
                    setDeliveries(next)
                  }}
                  placeholder="Cant."
                  className="w-20 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setDeliveries([...deliveries, { itemLabel: "", quantity: "" }])}
              className="text-xs text-yellow hover:underline"
            >
              + Agregar otro item
            </button>
          </div>
        )}

        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-sm text-cream/70">Ubicación</span>
            <button type="button" onClick={useMyLocation} disabled={locating} className="text-xs text-yellow hover:underline disabled:opacity-50">
              {locating ? "Buscando..." : "Usar mi ubicación"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="Latitud"
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
            />
            <input
              required
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="Longitud"
              className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
            />
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  )
}
