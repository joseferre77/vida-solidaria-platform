"use client"

import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, formatDate, formatMinutes, formatMoney, initials } from "../../../../lib/format"
import type { ProjectDetail } from "../../../../lib/projects"

/** Fase D — pestaña "Vista General": metadatos + totales que ya trae GET /projects/:id. */
export function VistaGeneral({ project }: { project: ProjectDetail }) {
  const allTasks = project.boards.flatMap((b) => b.columns.flatMap((c) => c.tasks))
  const doneColumn = project.boards.flatMap((b) => b.columns).find((c) => c.name === "Hecho")
  const doneCount = doneColumn?.tasks.length ?? 0
  const progressPct = allTasks.length ? Math.round((doneCount / allTasks.length) * 100) : 0

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[project.status]}`}>{STATUS_LABEL[project.status]}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[project.priority]}`}>{PRIORITY_LABEL[project.priority]}</span>
            {project.labels.map((l) => (
              <span
                key={l.label.id}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ backgroundColor: `${l.label.color}33`, color: l.label.color }}
              >
                {l.label.name}
              </span>
            ))}
          </div>
          <p className="text-sm text-cream/70">{project.description || "Sin descripción."}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Field label="Código" value={project.code} />
            <Field label="Área" value={project.area ?? "—"} />
            <Field label="Presupuesto" value={formatMoney(project.budget)} />
            <Field label="Dueño" value={project.owner.name} />
            <Field label="Inicio" value={formatDate(project.startDate)} />
            <Field label="Límite" value={formatDate(project.endDate)} />
            <Field label="Tiempo registrado" value={formatMinutes(project.timeTrackedMinutes)} />
            <Field label="Gastos" value={formatMoney(Number(project.expensesTotal) + Number(project.expensesTaxTotal))} />
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-cream/90">Progreso de tareas</h3>
            <span className="text-xs text-cream/50">
              {doneCount}/{allTasks.length} hechas
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-yellow" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-cream/90">
            Miembros ({project.members.length})
          </h3>
          <ul className="space-y-2">
            {project.members.map((m) => (
              <li key={m.userId} className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow/80 text-[10px] font-bold text-purple-deep">
                  {initials(m.user.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-cream">{m.user.name}</p>
                  <p className="text-[11px] capitalize text-cream/50">{m.projectRole}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
          <h3 className="mb-2 font-display text-sm font-semibold text-cream/90">Totales</h3>
          <ul className="space-y-1.5 text-sm text-cream/70">
            <li className="flex justify-between">
              <span>Casos vinculados</span>
              <span className="text-cream">{project._count.cases}</span>
            </li>
            <li className="flex justify-between">
              <span>Hitos</span>
              <span className="text-cream">{project._count.milestones}</span>
            </li>
            <li className="flex justify-between">
              <span>Archivos</span>
              <span className="text-cream">{project._count.attachments}</span>
            </li>
            <li className="flex justify-between">
              <span>Notas</span>
              <span className="text-cream">{project._count.notes}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-cream/40">{label}</p>
      <p className="text-cream">{value}</p>
    </div>
  )
}
