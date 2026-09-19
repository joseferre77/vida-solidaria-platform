"use client"

import { useEffect, useState } from "react"
import {
  createReminder,
  deleteProject,
  deleteReminder,
  getProjectSettings,
  listReminders,
  markReminderDone,
  startTimer,
  stopTimer,
  updateProject,
  updateProjectSettings,
  type ProjectDetail,
  type ProjectSettingsItem,
  type ReminderItem,
  type TaskItem,
} from "../../../lib/projects"
import { formatDateTime } from "../../../lib/format"

/**
 * Botonera fija del header de un proyecto (Fase D): Iniciar/Detener Reloj,
 * Recordatorios, Configuraciones (solo admin del proyecto) y Acciones
 * (editar/archivar/eliminar). Cada uno abre un panel liviano en vez de
 * navegar a otra pantalla, para no perder el contexto del proyecto.
 */
export function ProjectHeaderActions({
  project,
  allTasks,
  runningTaskId,
  runningEntryId,
  canWrite,
  canAdmin,
  onChanged,
  onProjectDeleted,
}: {
  project: ProjectDetail
  allTasks: TaskItem[]
  runningTaskId: string | null
  runningEntryId: string | null
  canWrite: boolean
  canAdmin: boolean
  onChanged: () => void
  onProjectDeleted: () => void
}) {
  const [openPanel, setOpenPanel] = useState<"timer" | "reminders" | "settings" | "actions" | null>(null)

  return (
    <div className="relative flex flex-wrap gap-2">
      {canWrite && (
        <div className="relative">
          {runningTaskId ? (
            <button
              onClick={() => runningEntryId && stopTimer(runningEntryId).then(onChanged)}
              className="rounded-xl bg-orange px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90"
            >
              ⏸ Detener reloj
            </button>
          ) : (
            <button
              onClick={() => setOpenPanel(openPanel === "timer" ? null : "timer")}
              className="rounded-xl bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90"
            >
              ▶ Iniciar Reloj
            </button>
          )}
          {openPanel === "timer" && (
            <Panel onClose={() => setOpenPanel(null)} title="Elegí una tarea">
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {allTasks.length === 0 && <p className="text-xs text-cream/50">No hay tareas todavía.</p>}
                {allTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={async () => {
                      await startTimer(t.id)
                      setOpenPanel(null)
                      onChanged()
                    }}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-cream hover:bg-white/10"
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => setOpenPanel(openPanel === "reminders" ? null : "reminders")}
          className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          🔔 Recordatorios
        </button>
        {openPanel === "reminders" && (
          <RemindersPanel projectId={project.id} canWrite={canWrite} onClose={() => setOpenPanel(null)} />
        )}
      </div>

      {canAdmin && (
        <div className="relative">
          <button
            onClick={() => setOpenPanel(openPanel === "settings" ? null : "settings")}
            className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            ⚙ Configuraciones
          </button>
          {openPanel === "settings" && <SettingsPanel projectId={project.id} onClose={() => setOpenPanel(null)} />}
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => setOpenPanel(openPanel === "actions" ? null : "actions")}
          className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
        >
          ⋯ Acciones
        </button>
        {openPanel === "actions" && (
          <ActionsPanel
            project={project}
            canWrite={canWrite}
            canAdmin={canAdmin}
            onClose={() => setOpenPanel(null)}
            onChanged={onChanged}
            onDeleted={onProjectDeleted}
          />
        )}
      </div>
    </div>
  )
}

function Panel({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-2xl border border-white/15 bg-purple-deep p-3 shadow-xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cream/50">{title}</p>
        {children}
      </div>
    </>
  )
}

function RemindersPanel({ projectId, canWrite, onClose }: { projectId: string; canWrite: boolean; onClose: () => void }) {
  const [reminders, setReminders] = useState<ReminderItem[]>([])
  const [title, setTitle] = useState("")
  const [remindAt, setRemindAt] = useState("")

  function refresh() {
    listReminders("PROJECT", projectId).then(setReminders)
  }
  useEffect(refresh, [projectId])

  return (
    <Panel title="Recordatorios del proyecto" onClose={onClose}>
      <ul className="mb-2 max-h-56 space-y-1 overflow-y-auto">
        {reminders.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
            <span className={r.isDone ? "text-cream/30 line-through" : "text-cream/80"}>
              {r.title} · {formatDateTime(r.remindAt)}
            </span>
            <span className="flex gap-1 shrink-0">
              {!r.isDone && (
                <button onClick={() => markReminderDone(r.id).then(refresh)} className="text-cream/40 hover:text-yellow">
                  ✓
                </button>
              )}
              <button onClick={() => deleteReminder(r.id).then(refresh)} className="text-cream/30 hover:text-orange">
                ✕
              </button>
            </span>
          </li>
        ))}
        {reminders.length === 0 && <p className="text-xs text-cream/40">Sin recordatorios.</p>}
      </ul>
      {canWrite && (
        <form
          className="space-y-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim() || !remindAt) return
            createReminder({ entity: "PROJECT", entityId: projectId, title: title.trim(), remindAt: new Date(remindAt).toISOString() }).then(() => {
              setTitle("")
              setRemindAt("")
              refresh()
            })
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Recordar..."
            className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
          />
          <div className="flex gap-2">
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
            />
            <button type="submit" className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
              +
            </button>
          </div>
        </form>
      )}
    </Panel>
  )
}

function SettingsPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [settings, setSettings] = useState<ProjectSettingsItem | null>(null)

  useEffect(() => {
    getProjectSettings(projectId).then(setSettings)
  }, [projectId])

  if (!settings) {
    return (
      <Panel title="Configuración" onClose={onClose}>
        <p className="text-xs text-cream/50">Cargando...</p>
      </Panel>
    )
  }

  function toggle(key: keyof Pick<ProjectSettingsItem, "membersCanTrackTime" | "membersCanLogExpenses" | "taskApprovalRequired" | "isArchived">) {
    if (!settings) return
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    updateProjectSettings(projectId, { [key]: next[key] })
  }

  return (
    <Panel title="Configuración del proyecto" onClose={onClose}>
      <div className="space-y-2 text-xs text-cream/80">
        <SettingRow label="Miembros pueden usar el cronómetro" checked={settings.membersCanTrackTime} onChange={() => toggle("membersCanTrackTime")} />
        <SettingRow label="Miembros pueden cargar gastos" checked={settings.membersCanLogExpenses} onChange={() => toggle("membersCanLogExpenses")} />
        <SettingRow label="Las tareas requieren aprobación" checked={settings.taskApprovalRequired} onChange={() => toggle("taskApprovalRequired")} />
        <SettingRow label="Proyecto archivado" checked={settings.isArchived} onChange={() => toggle("isArchived")} />
      </div>
    </Panel>
  )
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={onChange} />
    </label>
  )
}

function ActionsPanel({
  project,
  canWrite,
  canAdmin,
  onClose,
  onChanged,
  onDeleted,
}: {
  project: ProjectDetail
  canWrite: boolean
  canAdmin: boolean
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? "")
  const [area, setArea] = useState(project.area ?? "")

  if (editing) {
    return (
      <Panel title="Editar proyecto" onClose={onClose}>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
          />
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="Área"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Descripción"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
          />
          <button
            onClick={async () => {
              await updateProject(project.id, { name, description: description || undefined, area: area || undefined })
              onChanged()
              onClose()
            }}
            className="w-full rounded-lg bg-yellow px-2 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </Panel>
    )
  }

  return (
    <Panel title="Acciones" onClose={onClose}>
      <div className="space-y-1">
        {canWrite && (
          <button onClick={() => setEditing(true)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-cream hover:bg-white/10">
            Editar proyecto
          </button>
        )}
        {canAdmin && (
          <button
            onClick={async () => {
              if (!confirm(`¿Eliminar "${project.name}" y todo su contenido? Esta acción no se puede deshacer.`)) return
              await deleteProject(project.id)
              onDeleted()
            }}
            className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-orange hover:bg-orange/10"
          >
            Eliminar proyecto
          </button>
        )}
        {!canWrite && !canAdmin && <p className="text-xs text-cream/40">No tenés permisos para modificar este proyecto.</p>}
      </div>
    </Panel>
  )
}
