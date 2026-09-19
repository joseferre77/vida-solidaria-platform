"use client"

import { useEffect, useState } from "react"
import { createLabel, deleteLabel, listLabels, updateLabel, type LabelItem } from "../../../lib/projects"

const SWATCHES = ["#ffd400", "#ff8a00", "#c026d3", "#7c1fb0", "#3a0a5c", "#123a7a", "#22c55e", "#ef4444", "#6366f1"]

/** Fase G — CRUD de Label, compartidas entre proyectos y tareas (ProjectLabel / TaskLabel). */
export function Etiquetas() {
  const [labels, setLabels] = useState<LabelItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [color, setColor] = useState(SWATCHES[0])
  const [saving, setSaving] = useState(false)

  function refresh() {
    listLabels()
      .then(setLabels)
      .catch((e) => setError(e.message))
  }

  useEffect(refresh, [])

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createLabel({ name: name.trim(), color })
      setName("")
      refresh()
    } catch (err: any) {
      setError(err.message ?? "No se pudo crear la etiqueta")
    } finally {
      setSaving(false)
    }
  }

  if (!labels) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-2xl">
      <form onSubmit={onCreate} className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-white/15 bg-white/5 p-4">
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-cream/70">Nueva etiqueta</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Urgente"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>
        <div>
          <span className="mb-1 block text-xs text-cream/70">Color</span>
          <div className="flex gap-1.5">
            {SWATCHES.map((sw) => (
              <button
                type="button"
                key={sw}
                onClick={() => setColor(sw)}
                style={{ backgroundColor: sw }}
                className={`h-6 w-6 rounded-full border-2 ${color === sw ? "border-cream" : "border-transparent"}`}
                aria-label={sw}
              />
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving || !name.trim()} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
          {saving ? "Creando..." : "+ Crear"}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="space-y-2">
        {labels.map((l) => (
          <LabelRow key={l.id} label={l} onChanged={refresh} onError={setError} />
        ))}
        {labels.length === 0 && <p className="text-sm text-cream/50">Todavía no hay etiquetas creadas.</p>}
      </div>
    </div>
  )
}

function LabelRow({ label, onChanged, onError }: { label: LabelItem; onChanged: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState(label.name)

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() && name !== label.name) {
            updateLabel(label.id, { name: name.trim() }).then(onChanged).catch((e) => onError(e.message))
          }
        }}
        className="flex-1 bg-transparent text-sm text-cream outline-none"
      />
      <div className="flex gap-1">
        {SWATCHES.map((sw) => (
          <button
            key={sw}
            onClick={() => updateLabel(label.id, { color: sw }).then(onChanged).catch((e) => onError(e.message))}
            style={{ backgroundColor: sw }}
            className={`h-4 w-4 rounded-full border ${label.color === sw ? "border-cream" : "border-transparent"}`}
            aria-label={sw}
          />
        ))}
      </div>
      <button
        onClick={() => {
          if (!confirm(`¿Eliminar la etiqueta "${label.name}"? Se quita de todos los proyectos/tareas que la usen.`)) return
          deleteLabel(label.id).then(onChanged).catch((e) => onError(e.message))
        }}
        className="shrink-0 text-cream/30 hover:text-orange"
      >
        ✕
      </button>
    </div>
  )
}
