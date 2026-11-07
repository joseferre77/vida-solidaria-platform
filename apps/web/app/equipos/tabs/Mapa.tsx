"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import {
  OPERATIONAL_POINT_CATEGORIES,
  OPERATIONAL_POINT_CATEGORY_COLOR,
  OPERATIONAL_POINT_CATEGORY_LABEL,
  createOperationalPoint,
  deleteOperationalPoint,
  geocodeVolunteers,
  getMapSettings,
  getMapVolunteers,
  listOperationalPoints,
  updateMapSettings,
  updateOperationalPoint,
  type MapSettingsItem,
  type MapVolunteersResponse,
  type OperationalPointCategory,
  type OperationalPointItem,
} from "../../../lib/map"

const MapaVoluntariosMap = dynamic(() => import("../MapaVoluntariosMap"), {
  ssr: false,
  loading: () => <div className="flex h-[520px] items-center justify-center text-sm text-cream/40">Cargando mapa...</div>,
})

/**
 * Fase X — pestaña "Mapa" de Operaciones de Campo: geolocaliza voluntarios
 * (geocodificando su dirección cargada) y permite armar/editar los
 * "puntos de operación" (acopio de ropa, cocina, etc.) que se ven junto a
 * ellos en el mapa, con 4 cuadrantes visuales cuyo cruce se puede mover.
 * Solo visualización por ahora — no se integra con asignación de casos o
 * equipos todavía.
 */
export function Mapa() {
  const [volunteersData, setVolunteersData] = useState<MapVolunteersResponse | null>(null)
  const [points, setPoints] = useState<OperationalPointItem[] | null>(null)
  const [settings, setSettings] = useState<MapSettingsItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeMsg, setGeocodeMsg] = useState<string | null>(null)
  const [editing, setEditing] = useState<OperationalPointItem | "new" | null>(null)

  function refresh() {
    Promise.all([getMapVolunteers(), listOperationalPoints(), getMapSettings()])
      .then(([v, p, s]) => {
        setVolunteersData(v)
        setPoints(p)
        setSettings(s)
      })
      .catch((e) => setError(e.message))
  }

  useEffect(refresh, [])

  if (!volunteersData || !points || !settings) return <p className="text-cream/50">Cargando...</p>

  const { items: volunteers, stats } = volunteersData
  const pendingCount = stats.totalWithAddress - stats.geocoded

  return (
    <div className="max-w-5xl">
      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
        <div className="text-sm text-cream/80">
          <span className="font-semibold text-yellow">{stats.geocoded}</span> de{" "}
          <span className="font-semibold">{stats.totalWithAddress}</span> voluntarios con dirección ya están ubicados en
          el mapa
          {pendingCount > 0 && <span className="text-cream/50"> · {pendingCount} pendiente{pendingCount === 1 ? "" : "s"}</span>}
          .
        </div>
        <button
          onClick={async () => {
            setGeocoding(true)
            setGeocodeMsg(null)
            try {
              const res = await geocodeVolunteers()
              setGeocodeMsg(
                res.attempted === 0
                  ? "No había direcciones pendientes de ubicar."
                  : `Se ubicaron ${res.geocoded} de ${res.attempted}${res.failed > 0 ? ` (${res.failed} no se pudieron encontrar)` : ""}.`,
              )
              refresh()
            } catch (e: any) {
              setError(e.message ?? "No se pudo geocodificar")
            } finally {
              setGeocoding(false)
            }
          }}
          disabled={geocoding || pendingCount === 0}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
        >
          {geocoding ? "Ubicando direcciones... (puede tardar)" : "Ubicar direcciones pendientes"}
        </button>
      </div>
      {geocodeMsg && <p className="mb-4 text-xs text-cream/60">{geocodeMsg}</p>}

      <div className="mb-6">
        <MapaVoluntariosMap
          volunteers={volunteers}
          points={points}
          center={[settings.centerLat, settings.centerLng]}
          canMoveCenter
          onMoveCenter={async (lat, lng) => {
            try {
              const updated = await updateMapSettings({ centerLat: lat, centerLng: lng })
              setSettings(updated)
            } catch (e: any) {
              setError(e.message ?? "No se pudo mover el centro de los cuadrantes")
            }
          }}
        />
        <p className="mt-2 text-xs text-cream/40">
          Arrastrá el pin amarillo del centro para mover las líneas de los 4 cuadrantes a donde te sea más útil.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-yellow">Puntos de operación</h2>
        <button onClick={() => setEditing("new")} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90">
          + Agregar punto
        </button>
      </div>

      <div className="space-y-2">
        {points.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/40"
                style={{ backgroundColor: OPERATIONAL_POINT_CATEGORY_COLOR[p.category] }}
              />
              <div>
                <p className={`text-sm font-medium ${p.active ? "text-cream" : "text-cream/40 line-through"}`}>{p.name}</p>
                <p className="text-xs text-cream/50">
                  {OPERATIONAL_POINT_CATEGORY_LABEL[p.category]}
                  {p.address ? ` · ${p.address}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={() => setEditing(p)} className="text-yellow hover:underline">
                Editar
              </button>
              <button
                onClick={() => {
                  if (!confirm(`¿Eliminar "${p.name}"?`)) return
                  deleteOperationalPoint(p.id).then(refresh).catch((e) => setError(e.message))
                }}
                className="text-cream/30 hover:text-orange"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {points.length === 0 && <p className="text-sm text-cream/50">Todavía no hay puntos de operación cargados.</p>}
      </div>

      {editing && (
        <PointModal
          point={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function PointModal({
  point,
  onClose,
  onSaved,
  onError,
}: {
  point: OperationalPointItem | null
  onClose: () => void
  onSaved: () => void
  onError: (e: string) => void
}) {
  const [category, setCategory] = useState<OperationalPointCategory>(point?.category ?? "acopio_ropa")
  const [name, setName] = useState(point?.name ?? "")
  const [address, setAddress] = useState(point?.address ?? "")
  const [active, setActive] = useState(point?.active ?? true)
  const [saving, setSaving] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setSaving(true)
          try {
            if (point) {
              await updateOperationalPoint(point.id, { category, name: name.trim(), address: address.trim(), active })
            } else {
              await createOperationalPoint({ category, name: name.trim(), address: address.trim() || undefined })
            }
            onSaved()
          } catch (err: any) {
            onError(err.message ?? "No se pudo guardar el punto")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">{point ? "Editar punto" : "Nuevo punto de operación"}</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Categoría</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as OperationalPointCategory)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            {OPERATIONAL_POINT_CATEGORIES.map((c) => (
              <option key={c} value={c} className="bg-papel text-tinta">
                {OPERATIONAL_POINT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Ej. "Depósito Alberti" o "Cocina Barrio Belgrano"'
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Dirección</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle y altura — se ubica sola en el mapa"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
          <span className="mt-1 block text-xs text-cream/40">
            Si no se encuentra una dirección así escrita, probá con una más precisa (calle y altura).
          </span>
        </label>

        {point && (
          <label className="mb-4 flex items-center gap-2 text-sm text-cream/80">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Activo (se ve en el mapa)
          </label>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  )
}
