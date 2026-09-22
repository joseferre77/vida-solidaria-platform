"use client"

import { useState } from "react"
import { createProcess, deleteProcess, updateProcess, type ProcessItem } from "../../../../lib/projects"

const SWATCHES = ["#ffd400", "#ff8a00", "#c026d3", "#7c1fb0", "#123a7a", "#fff8ec"]

/** Fase E — "Procesos": agrupador de tareas por etapa (también sirve de filtro en el Kanban). */
export function Procesos({
  projectId,
  processes,
  canWrite,
  onChanged,
}: {
  projectId: string
  processes: ProcessItem[]
  canWrite: boolean
  onChanged: () => void
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(SWATCHES[0])
  const [saving, setSaving] = useState(false)

  return (
    <div className="max-w-2xl">
      <div className="mb-4 space-y-2">
        {processes.map((p) => (
          <ProcessRow key={p.id} process={p} canWrite={canWrite} onChanged={onChanged} />
        ))}
        {processes.length === 0 && <p className="text-sm text-cream/50">Todavía no hay procesos definidos.</p>}
      </div>

      {canWrite && (
        <form
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!name.trim()) return
            setSaving(true)
            try {
              await createProcess(projectId, { name: name.trim(), color })
              setName("")
              onChanged()
            } finally {
              setSaving(false)
            }
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del proceso (ej: Diseño)"
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          />
          <div className="flex gap-1">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                style={{ backgroundColor: c }}
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-cream" : "border-transparent"}`}
              />
            ))}
          </div>
          <button type="submit" disabled={saving || !name.trim()} className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep disabled:opacity-50">
            Crear
          </button>
        </form>
      )}
    </div>
  )
}

function ProcessRow({ process, canWrite, onChanged }: { process: ProcessItem; canWrite: boolean; onChanged: () => void }) {
  const [name, setName] = useState(process.name)

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: process.color ?? "#888" }} />
      {canWrite ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== process.name && updateProcess(process.id, { name: name.trim() }).then(onChanged)}
          className="flex-1 bg-transparent text-sm text-cream outline-none"
        />
      ) : (
        <span className="flex-1 text-sm text-cream">{process.name}</span>
      )}
      <span className="text-xs text-cream/50">{process._count?.tasks ?? 0} tarea(s)</span>
      {canWrite && (
        <button
          onClick={async () => {
            if (!confirm(`¿Eliminar el proceso "${process.name}"? Las tareas quedan sin proceso asignado.`)) return
            try {
              await deleteProcess(process.id)
              onChanged()
            } catch (e: any) {
              // Antes esto fallaba en silencio (sin try/catch) — si el
              // borrado vuelve a no andar, este alert va a decir por qué.
              alert(e.message ?? "No se pudo eliminar el proceso")
            }
          }}
          className="text-cream/30 hover:text-orange"
        >
          ✕
        </button>
      )}
    </div>
  )
}
