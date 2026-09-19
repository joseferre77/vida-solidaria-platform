"use client"

import { PRIORITY_COLOR, formatDate } from "../../../../lib/format"
import type { PlanTask, ProjectPlan } from "../../../../lib/projects"

/**
 * Fase E — "Plan": Gantt agrupado por Proceso (DESIGN_PROYECTOS.md §3.5).
 * Implementación liviana sin librería de gráficos: cada tarea con fechas se
 * dibuja como una barra posicionada/dimensionada por porcentaje sobre el
 * rango [fecha más temprana, fecha más tardía] de TODO el plan. Una tarea
 * con una sola fecha (sin inicio o sin vencimiento) se dibuja como un punto.
 */
export function Plan({ plan }: { plan: ProjectPlan }) {
  const allTasks = [...plan.processes.flatMap((p) => p.tasks), ...plan.sinProceso]
  const dated = allTasks.filter((t) => t.startDate || t.dueDate)

  if (dated.length === 0) {
    return <p className="text-sm text-cream/50">Ninguna tarea tiene fechas cargadas todavía — el Plan se arma solo cuando les ponés inicio/vencimiento.</p>
  }

  const allDates = dated.flatMap((t) => [t.startDate, t.dueDate].filter(Boolean).map((d) => new Date(d as string).getTime()))
  const rangeStart = Math.min(...allDates)
  const rangeEnd = Math.max(...allDates)
  const rangeSpan = Math.max(1, rangeEnd - rangeStart)

  function bar(task: PlanTask) {
    const start = task.startDate ? new Date(task.startDate).getTime() : task.dueDate ? new Date(task.dueDate).getTime() : rangeStart
    const end = task.dueDate ? new Date(task.dueDate).getTime() : start
    const left = ((start - rangeStart) / rangeSpan) * 100
    const width = Math.max(1, ((end - start) / rangeSpan) * 100)
    return { left: `${left}%`, width: `${width}%` }
  }

  const groups = [...plan.processes.map((p) => ({ id: p.id, name: p.name, color: p.color, tasks: p.tasks })), ...(plan.sinProceso.length ? [{ id: "sin-proceso", name: "Sin proceso", color: null, tasks: plan.sinProceso }] : [])]

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5 p-4">
      <div className="mb-3 flex justify-between text-[11px] text-cream/40">
        <span>{formatDate(new Date(rangeStart))}</span>
        <span>{formatDate(new Date(rangeEnd))}</span>
      </div>
      <div className="min-w-[640px] space-y-5">
        {groups.map((g) => (
          <div key={g.id}>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-cream/60">
              {g.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />}
              {g.name}
            </p>
            <div className="space-y-2">
              {g.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs text-cream/80" title={t.title}>
                    {t.title}
                  </span>
                  <div className="relative h-4 flex-1 rounded bg-white/5">
                    <div
                      className={`absolute top-0 h-4 rounded ${PRIORITY_COLOR[t.priority].split(" ")[0]}`}
                      style={bar(t)}
                      title={`${formatDate(t.startDate)} → ${formatDate(t.dueDate)}`}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-[10px] text-cream/40">{t.boardColumn.name}</span>
                </div>
              ))}
              {g.tasks.length === 0 && <p className="text-xs text-cream/30">Sin tareas en este proceso.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
