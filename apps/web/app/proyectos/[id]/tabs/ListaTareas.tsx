"use client"

import { useMemo, useState } from "react"
import type { TaskItem } from "../../../../lib/projects"
import { PRIORITY_COLOR, PRIORITY_LABEL, formatDate, initials } from "../../../../lib/format"

/** Fase E — "Lista de Tareas": todas las tareas del proyecto en una tabla plana (en vez de por columna), con filtro y orden. */
export function ListaTareas({ tasks, onOpenTask }: { tasks: TaskItem[]; onOpenTask: (taskId: string) => void }) {
  const [filter, setFilter] = useState("")
  const [sortBy, setSortBy] = useState<"dueDate" | "priority" | "title">("dueDate")

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const filtered = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
    const priorityRank = { alta: 0, media: 1, baja: 2 }
    return [...filtered].sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title)
      if (sortBy === "priority") return priorityRank[a.priority] - priorityRank[b.priority]
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    })
  }, [tasks, filter, sortBy])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar tarea..."
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        >
          <option value="dueDate" className="bg-papel text-tinta">
            Ordenar por vencimiento
          </option>
          <option value="priority" className="bg-papel text-tinta">
            Ordenar por prioridad
          </option>
          <option value="title" className="bg-papel text-tinta">
            Ordenar por título
          </option>
        </select>
        <span className="text-xs text-cream/50">{visible.length} tarea(s)</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
              <th className="px-4 py-3 font-medium">Tarea</th>
              <th className="px-4 py-3 font-medium">Proceso</th>
              <th className="px-4 py-3 font-medium">Vencimiento</th>
              <th className="px-4 py-3 font-medium">Prioridad</th>
              <th className="px-4 py-3 font-medium">Asignados</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} onClick={() => onOpenTask(t.id)} className="cursor-pointer border-b border-white/5 transition hover:bg-white/10">
                <td className="px-4 py-3">
                  <p className="font-medium text-cream">{t.title}</p>
                  {t.labels && t.labels.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.labels.map((l) => (
                        <span
                          key={l.label.id}
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{ backgroundColor: `${l.label.color}33`, color: l.label.color }}
                        >
                          {l.label.name}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-cream/70">{t.process?.name ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={t.dueDate && new Date(t.dueDate) < new Date() ? "font-semibold text-orange" : "text-cream/70"}>
                    {formatDate(t.dueDate)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex -space-x-1">
                    {t.assignees.map((a) => (
                      <span
                        key={a.userId}
                        title={a.user.name}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-purple-deep bg-yellow/80 text-[9px] font-bold text-purple-deep"
                      >
                        {initials(a.user.name)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cream/50">
                  No hay tareas que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
