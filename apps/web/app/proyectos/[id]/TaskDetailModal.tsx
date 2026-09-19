"use client"

import { useEffect, useState } from "react"
import {
  addChecklistItem,
  addTaskComment,
  addTaskDependency,
  assignTask,
  attachTaskLabel,
  createReminder,
  createTask,
  deleteChecklistItem,
  deleteReminder,
  deleteTask,
  detachTaskLabel,
  getRunningTimer,
  getTaskDetail,
  listLabels,
  listReminders,
  markReminderDone,
  removeTaskDependency,
  startTimer,
  stopTimer,
  unassignTask,
  updateChecklistItem,
  updateTask,
  type BasicUser,
  type LabelItem,
  type ProcessItem,
  type TaskDetail,
  type TaskPriority,
} from "../../../lib/projects"
import { formatDateTime, formatMinutes, initials } from "../../../lib/format"
import { PRIORITY_COLOR, PRIORITY_LABEL } from "../../../lib/format"

/**
 * Fase F — modal de detalle de tarea completo. A diferencia del modal
 * anterior (columna + responsables + comentarios nomás), esto trae: checklist,
 * dependencias/subtareas, cronómetro propio con tiempo total, recordatorios,
 * etiquetas, proceso y fechas — todo lo que el backend ya sostenía desde el
 * esquema ampliado pero no tenía pantalla. Trae su propio detalle fresco con
 * `getTaskDetail` en vez de depender de lo que el llamador tenía cacheado,
 * así sirve igual desde el Kanban, la Lista de Tareas o el feed de
 * Comentarios.
 */
export function TaskDetailModal({
  taskId,
  boardColumns,
  processes,
  users,
  allTasks,
  canWrite,
  canDelete,
  onClose,
  onChanged,
}: {
  taskId: string
  boardColumns: { id: string; name: string }[]
  processes: ProcessItem[]
  users: BasicUser[]
  /** Para el selector de dependencias — todas las tareas del proyecto, se excluye la actual. */
  allTasks: { id: string; title: string }[]
  canWrite: boolean
  canDelete: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [labels, setLabels] = useState<LabelItem[]>([])
  const [runningEntryId, setRunningEntryId] = useState<string | null>(null)
  const [runningOnThisTask, setRunningOnThisTask] = useState(false)
  const [remindersList, setRemindersList] = useState<Awaited<ReturnType<typeof listReminders>>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [comment, setComment] = useState("")
  const [newChecklistTitle, setNewChecklistTitle] = useState("")
  const [dependencyTarget, setDependencyTarget] = useState("")
  const [reminderTitle, setReminderTitle] = useState("")
  const [reminderAt, setReminderAt] = useState("")

  async function load() {
    try {
      const [t, l, running, rem] = await Promise.all([
        getTaskDetail(taskId),
        listLabels(),
        getRunningTimer(),
        listReminders("TASK", taskId),
      ])
      setTask(t)
      setLabels(l)
      setRunningEntryId(running?.id ?? null)
      setRunningOnThisTask(running?.taskId === taskId)
      setRemindersList(rem)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function reload() {
    await load()
    onChanged()
  }

  async function withBusy(fn: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await reload()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-2xl border border-white/15 bg-purple-deep p-6 text-cream/60">
          {error ?? "Cargando tarea..."}
        </div>
      </div>
    )
  }

  const assignedIds = new Set(task.assignees.map((a) => a.userId))
  const labelIds = new Set(task.labels.map((l) => l.label.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="grid max-h-[92vh] w-full max-w-4xl grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-white/15 bg-purple-deep md:grid-cols-[1fr_320px]">
        {/* Columna izquierda */}
        <div className="max-h-[92vh] overflow-y-auto border-white/10 p-6 md:border-r">
          <div className="mb-4 flex items-start justify-between gap-3">
            {canWrite ? (
              <input
                defaultValue={task.title}
                onBlur={(e) => e.target.value.trim() && e.target.value !== task.title && withBusy(() => updateTask(task.id, { title: e.target.value.trim() }))}
                className="w-full bg-transparent font-display text-lg font-bold text-cream outline-none focus:border-b focus:border-yellow"
              />
            ) : (
              <h2 className="font-display text-lg font-bold text-cream">{task.title}</h2>
            )}
            <button onClick={onClose} className="shrink-0 text-cream/50 hover:text-cream">
              ✕
            </button>
          </div>

          <label className="mb-5 block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-cream/50">Descripción</span>
            <textarea
              defaultValue={task.description ?? ""}
              disabled={!canWrite || busy}
              rows={3}
              onBlur={(e) => {
                if (e.target.value !== (task.description ?? "")) {
                  withBusy(() => updateTask(task.id, { description: e.target.value || null }))
                }
              }}
              placeholder="Sin descripción"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow disabled:opacity-60"
            />
          </label>

          {/* Checklist */}
          <div className="mb-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-cream/50">
              Checklist {task.checklist.length > 0 && `(${task.checklist.filter((c) => c.isChecked).length}/${task.checklist.length})`}
            </p>
            <div className="space-y-1">
              {task.checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={item.isChecked}
                    disabled={!canWrite || busy}
                    onChange={(e) => withBusy(() => updateChecklistItem(item.id, { isChecked: e.target.checked }))}
                  />
                  <span className={`flex-1 text-sm ${item.isChecked ? "text-cream/40 line-through" : "text-cream"}`}>
                    {item.title}
                  </span>
                  {canWrite && (
                    <button
                      onClick={() => withBusy(() => deleteChecklistItem(item.id))}
                      className="text-xs text-cream/30 hover:text-orange"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newChecklistTitle.trim()) return
                  withBusy(() => addChecklistItem(task.id, newChecklistTitle.trim())).then(() => setNewChecklistTitle(""))
                }}
              >
                <input
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  placeholder="+ Ítem de checklist"
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
                />
                <button type="submit" className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                  Agregar
                </button>
              </form>
            )}
          </div>

          {/* Dependencias / subtareas */}
          <div className="mb-5">
            <p className="mb-2 text-xs uppercase tracking-wide text-cream/50">Depende de esta tarea</p>
            {task.blockerOf.length === 0 ? (
              <p className="text-xs text-cream/40">Ninguna tarea depende de esta.</p>
            ) : (
              <ul className="space-y-1">
                {task.blockerOf.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-xs text-cream/70">
                    <span>🔗 {d.blockedTask?.title}</span>
                    {canWrite && (
                      <button onClick={() => withBusy(() => removeTaskDependency(d.id))} className="text-cream/30 hover:text-orange">
                        Quitar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {task.blockedBy.length > 0 && (
              <>
                <p className="mb-1 mt-3 text-xs uppercase tracking-wide text-cream/50">Bloqueada por</p>
                <ul className="space-y-1">
                  {task.blockedBy.map((d) => (
                    <li key={d.id} className="flex items-center justify-between text-xs text-cream/70">
                      <span>⛔ {d.blockerTask?.title}</span>
                      {canWrite && (
                        <button onClick={() => withBusy(() => removeTaskDependency(d.id))} className="text-cream/30 hover:text-orange">
                          Quitar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <select
                  value={dependencyTarget}
                  onChange={(e) => setDependencyTarget(e.target.value)}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
                >
                  <option value="" className="bg-purple-deep">
                    Marcar que bloquea a...
                  </option>
                  {allTasks
                    .filter((t) => t.id !== task.id)
                    .map((t) => (
                      <option key={t.id} value={t.id} className="bg-purple-deep">
                        {t.title}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!dependencyTarget}
                  onClick={() => dependencyTarget && withBusy(() => addTaskDependency(task.id, dependencyTarget)).then(() => setDependencyTarget(""))}
                  className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-40"
                >
                  Agregar
                </button>
              </div>
            )}
          </div>

          {/* Comentarios */}
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-cream/50">Comentarios</p>
            <div className="mb-2 space-y-3">
              {task.comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow/80 text-[9px] font-bold text-purple-deep">
                    {initials(c.user.name)}
                  </span>
                  <div>
                    <p className="text-xs text-cream/50">
                      <span className="font-medium text-cream/80">{c.user.name}</span> · {formatDateTime(c.createdAt)}
                    </p>
                    <p className="text-sm text-cream">{c.body}</p>
                  </div>
                </div>
              ))}
              {task.comments.length === 0 && <p className="text-xs text-cream/40">Sin comentarios todavía.</p>}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!comment.trim()) return
                withBusy(() => addTaskComment(task.id, comment.trim())).then(() => setComment(""))
              }}
            >
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Escribir algo..."
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
              />
              <button
                type="submit"
                disabled={busy || !comment.trim()}
                className="rounded-lg bg-yellow px-3 py-2 text-xs font-semibold text-purple-deep disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>

        {/* Panel derecho — metadata */}
        <div className="max-h-[92vh] space-y-5 overflow-y-auto p-6">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Columna</p>
            <select
              value={task.boardColumnId}
              disabled={!canWrite || busy}
              onChange={(e) => withBusy(() => updateTask(task.id, { boardColumnId: e.target.value }))}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow disabled:opacity-60"
            >
              {boardColumns.map((c) => (
                <option key={c.id} value={c.id} className="bg-purple-deep">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Proceso</p>
            <select
              value={task.processId ?? ""}
              disabled={!canWrite || busy}
              onChange={(e) => withBusy(() => updateTask(task.id, { processId: e.target.value || null }))}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow disabled:opacity-60"
            >
              <option value="" className="bg-purple-deep">
                Sin proceso
              </option>
              {processes.map((p) => (
                <option key={p.id} value={p.id} className="bg-purple-deep">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Inicio</p>
              <input
                type="date"
                defaultValue={task.startDate?.slice(0, 10) ?? ""}
                disabled={!canWrite || busy}
                onBlur={(e) => withBusy(() => updateTask(task.id, { startDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow disabled:opacity-60"
              />
            </div>
            <div>
              <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Vencimiento</p>
              <input
                type="date"
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                disabled={!canWrite || busy}
                onBlur={(e) => withBusy(() => updateTask(task.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Prioridad</p>
            <div className="flex gap-1.5">
              {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  disabled={!canWrite || busy}
                  onClick={() => withBusy(() => updateTask(task.id, { priority: p }))}
                  className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40 ${
                    task.priority === p ? PRIORITY_COLOR[p] : "bg-white/5 text-cream/40 hover:bg-white/10"
                  }`}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Etiquetas</p>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((l) => {
                const active = labelIds.has(l.id)
                return (
                  <button
                    key={l.id}
                    disabled={!canWrite || busy}
                    onClick={() => withBusy(() => (active ? detachTaskLabel(task.id, l.id) : attachTaskLabel(task.id, l.id)))}
                    style={active ? { backgroundColor: `${l.color}33`, color: l.color, borderColor: l.color } : undefined}
                    className={`rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40 ${
                      active ? "" : "border-white/20 text-cream/50 hover:border-white/40"
                    }`}
                  >
                    {l.name}
                  </button>
                )
              })}
              {labels.length === 0 && <p className="text-xs text-cream/40">No hay etiquetas creadas.</p>}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Responsables</p>
            <div className="flex flex-wrap gap-1.5">
              {users.map((u) => {
                const active = assignedIds.has(u.id)
                return (
                  <button
                    key={u.id}
                    disabled={!canWrite || busy}
                    onClick={() => withBusy(() => (active ? unassignTask(task.id, u.id) : assignTask(task.id, u.id)))}
                    className={`rounded-full border px-2 py-1 text-xs disabled:opacity-40 ${
                      active ? "border-yellow bg-yellow/20 text-yellow" : "border-white/20 text-cream/60 hover:border-white/40"
                    }`}
                  >
                    {u.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Tiempo registrado</p>
            <p className="mb-2 font-display text-lg font-bold text-cream">{formatMinutes(task.timeTrackedMinutes)}</p>
            {runningOnThisTask ? (
              <button
                onClick={() => runningEntryId && withBusy(() => stopTimer(runningEntryId))}
                className="w-full rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90"
              >
                Detener cronómetro
              </button>
            ) : (
              <button
                disabled={!canWrite || busy || !!runningEntryId}
                title={runningEntryId ? "Ya tenés un cronómetro corriendo en otra tarea" : undefined}
                onClick={() => withBusy(() => startTimer(task.id))}
                className="w-full rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-40"
              >
                Iniciar Reloj
              </button>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-cream/50">Recordatorios</p>
            <ul className="mb-2 space-y-1">
              {remindersList.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className={r.isDone ? "text-cream/30 line-through" : "text-cream/70"}>
                    {r.title} · {formatDateTime(r.remindAt)}
                  </span>
                  <span className="flex gap-1">
                    {!r.isDone && (
                      <button onClick={() => withBusy(() => markReminderDone(r.id))} className="text-cream/40 hover:text-yellow">
                        ✓
                      </button>
                    )}
                    <button onClick={() => withBusy(() => deleteReminder(r.id))} className="text-cream/30 hover:text-orange">
                      ✕
                    </button>
                  </span>
                </li>
              ))}
              {remindersList.length === 0 && <p className="text-xs text-cream/40">Sin recordatorios.</p>}
            </ul>
            {canWrite && (
              <form
                className="space-y-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!reminderTitle.trim() || !reminderAt) return
                  withBusy(() =>
                    createReminder({
                      entity: "TASK",
                      entityId: task.id,
                      title: reminderTitle.trim(),
                      remindAt: new Date(reminderAt).toISOString(),
                    }),
                  ).then(() => {
                    setReminderTitle("")
                    setReminderAt("")
                  })
                }}
              >
                <input
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                  placeholder="Recordar..."
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
                />
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
                  />
                  <button type="submit" className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                    +
                  </button>
                </div>
              </form>
            )}
          </div>

          {error && <p className="text-xs text-orange">{error}</p>}

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
            {canWrite && (
              <button
                onClick={() =>
                  withBusy(async () => {
                    await createTask({
                      boardColumnId: task.boardColumnId,
                      processId: task.processId ?? undefined,
                      title: `${task.title} (copia)`,
                      description: task.description ?? undefined,
                      priority: task.priority,
                    })
                  })
                }
                className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
              >
                Clonar
              </button>
            )}
            {canDelete && (
              <button
                onClick={async () => {
                  if (!confirm("¿Eliminar esta tarea?")) return
                  await withBusy(() => deleteTask(task.id))
                  onClose()
                }}
                className="rounded-xl border border-orange/40 px-3 py-1.5 text-xs text-orange hover:bg-orange/10"
              >
                Eliminar
              </button>
            )}
            <button onClick={onClose} className="ml-auto rounded-xl border border-white/20 px-4 py-1.5 text-xs hover:bg-white/5">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
