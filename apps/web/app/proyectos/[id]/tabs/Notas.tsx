"use client"

import { useState } from "react"
import { createProjectNote, deleteProjectNote, updateProjectNote, type ProjectNoteItem } from "../../../../lib/projects"
import { formatDateTime, initials } from "../../../../lib/format"

/** Fase E — "Notas": notas libres del proyecto, con posibilidad de fijar las importantes arriba. */
export function Notas({
  projectId,
  notes,
  canWrite,
  onChanged,
}: {
  projectId: string
  notes: ProjectNoteItem[]
  canWrite: boolean
  onChanged: () => void
}) {
  const [content, setContent] = useState("")
  const [saving, setSaving] = useState(false)

  return (
    <div className="max-w-3xl">
      {canWrite && (
        <form
          className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!content.trim()) return
            setSaving(true)
            try {
              await createProjectNote(projectId, { content: content.trim() })
              setContent("")
              onChanged()
            } finally {
              setSaving(false)
            }
          }}
        >
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="Escribí una nota para el equipo..."
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
          />
          <div className="mt-2 flex justify-end">
            <button type="submit" disabled={saving || !content.trim()} className="rounded-lg bg-yellow px-4 py-1.5 text-xs font-semibold text-purple-deep disabled:opacity-50">
              Publicar nota
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {notes.map((n) => (
          <div key={n.id} className={`rounded-2xl border p-4 ${n.isPinned ? "border-yellow/40 bg-yellow/10" : "border-white/10 bg-white/5"}`}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow/80 text-[9px] font-bold text-purple-deep">
                  {initials(n.author.name)}
                </span>
                <p className="text-xs text-cream/60">
                  <span className="font-medium text-cream/90">{n.author.name}</span> · {formatDateTime(n.createdAt)}
                </p>
              </div>
              {canWrite && (
                <div className="flex gap-2 text-xs">
                  <button onClick={() => updateProjectNote(n.id, { isPinned: !n.isPinned }).then(onChanged)} className="text-cream/40 hover:text-yellow">
                    {n.isPinned ? "★ Fijada" : "☆ Fijar"}
                  </button>
                  <button onClick={() => deleteProjectNote(n.id).then(onChanged)} className="text-cream/30 hover:text-orange">
                    Borrar
                  </button>
                </div>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-cream/90">{n.content}</p>
          </div>
        ))}
        {notes.length === 0 && <p className="text-sm text-cream/50">Todavía no hay notas.</p>}
      </div>
    </div>
  )
}
