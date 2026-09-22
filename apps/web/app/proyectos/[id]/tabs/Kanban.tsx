"use client"

import { useState } from "react"
import { createTask, type ProcessItem, type ProjectDetail } from "../../../../lib/projects"
import { PRIORITY_COLOR, PRIORITY_LABEL, initials } from "../../../../lib/format"

/**
 * Fase D/E — pestaña Kanban. El tablero ya venía de Vista General; acá se le
 * suma el filtro por Proceso (DESIGN_PROYECTOS.md §3: "Procesos → filtro
 * sobre el Kanban") y se delega la apertura del modal de tarea al padre
 * (`onOpenTask`), que ahora usa el TaskDetailModal completo de la Fase F en
 * vez del modal resumido que tenía esta pantalla antes.
 */
export function Kanban({
  project,
  processes,
  canWrite,
  onOpenTask,
  onChanged,
}: {
  project: ProjectDetail
  processes: ProcessItem[]
  canWrite: boolean
  onOpenTask: (taskId: string) => void
  onChanged: () => void
}) {
  const [processFilter, setProcessFilter] = useState<string>("")
  const board = project.boards[0]

  return (
    <div>
      {processes.length > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-cream/50">Filtrar por proceso:</span>
          <select
            value={processFilter}
            onChange={(e) => setProcessFilter(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-papel text-tinta">
              Todos
            </option>
            {processes.map((p) => (
              <option key={p.id} value={p.id} className="bg-papel text-tinta">
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {board?.columns.map((col) => {
          const tasks = processFilter ? col.tasks.filter((t) => t.process?.id === processFilter) : col.tasks
          return (
            <div key={col.id} className="w-72 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="font-display text-sm font-semibold text-cream/90">{col.name}</h2>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-cream/60">{tasks.length}</span>
              </div>

              <div className="space-y-2">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => onOpenTask(task.id)}
                    className="block w-full rounded-xl border border-white/10 bg-purple-deep/60 p-3 text-left transition hover:border-yellow/40"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-cream">{task.title}</p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLOR[task.priority]}`}>
                        {PRIORITY_LABEL[task.priority]}
                      </span>
                    </div>
                    {task.process && (
                      <p className="mb-1 text-[10px]" style={{ color: task.process.color ?? undefined }}>
                        {task.process.name}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-xs text-cream/50">
                      <span className={task.dueDate && new Date(task.dueDate) < new Date() ? "font-semibold text-orange" : ""}>
                        {task.dueDate ? new Date(task.dueDate).toLocaleDateString("es-AR") : ""}
                      </span>
                      <div className="flex items-center gap-2">
                        {task._count.comments > 0 && <span>💬 {task._count.comments}</span>}
                        <div className="flex -space-x-1">
                          {task.assignees.map((a) => (
                            <span
                              key={a.userId}
                              title={a.user.name}
                              className="flex h-5 w-5 items-center justify-center rounded-full border border-purple-deep bg-yellow/80 text-[9px] font-bold text-purple-deep"
                            >
                              {initials(a.user.name)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {canWrite && <NewTaskInline columnId={col.id} onCreated={onChanged} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function NewTaskInline({ columnId, onCreated }: { columnId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-xl border border-dashed border-white/20 py-2 text-xs text-cream/50 hover:border-yellow/40 hover:text-yellow"
      >
        + Agregar tarea
      </button>
    )
  }

  return (
    <form
      className="mt-2"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        setSaving(true)
        try {
          await createTask({ boardColumnId: columnId, title: title.trim() })
          setTitle("")
          setOpen(false)
          onCreated()
        } finally {
          setSaving(false)
        }
      }}
    >
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la tarea"
        rows={2}
        className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
      />
      <div className="mt-1 flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-yellow px-3 py-1 text-xs font-semibold text-purple-deep disabled:opacity-50">
          Agregar
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-cream/50 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  )
}
