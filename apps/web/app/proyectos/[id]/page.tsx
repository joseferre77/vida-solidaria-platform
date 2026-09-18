"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { fetchMe, hasPermission, type SessionUser } from "../../../lib/auth"
import {
  getProject,
  createTask,
  updateTask,
  deleteTask,
  assignTask,
  unassignTask,
  addTaskComment,
  listBasicUsers,
  type ProjectDetail,
  type TaskItem,
  type TaskPriority,
  type BasicUser,
} from "../../../lib/projects"

const PRIORITY_LABEL: Record<TaskPriority, string> = { baja: "Baja", media: "Media", alta: "Alta" }
const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baja: "bg-white/10 text-cream/60",
  media: "bg-yellow/20 text-yellow",
  alta: "bg-orange/25 text-orange",
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function ProjectBoardPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [users, setUsers] = useState<BasicUser[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      if (!hasPermission(u, "projects.read")) return router.replace("/dashboard")
      setUser(u)
    })
  }, [router])

  async function refresh() {
    try {
      const [p, u] = await Promise.all([getProject(id), listBasicUsers()])
      setProject(p)
      setUsers(u)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (user) refresh()
  }, [user, id])

  if (user === undefined || (user && !project && !error)) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  if (error && !project) {
    return <p className="p-8 text-orange">{error}</p>
  }

  const board = project?.boards[0]
  const canWrite = hasPermission(user ?? null, "projects.write")

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mb-6">
        <Link href="/proyectos" className="text-xs text-cream/50 hover:underline">
          ← Todos los proyectos
        </Link>
        <h1 className="font-display text-2xl font-bold text-yellow">{project?.name}</h1>
        {project?.description && <p className="mt-1 max-w-2xl text-sm text-cream/70">{project.description}</p>}
        <p className="mt-2 text-xs text-cream/50">
          {project?.members.length} miembro{project?.members.length === 1 ? "" : "s"} ·{" "}
          {project?.members.map((m) => m.user.name).join(", ")}
        </p>
      </header>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {board?.columns.map((col) => (
          <div key={col.id} className="w-72 shrink-0 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="font-display text-sm font-semibold text-cream/90">{col.name}</h2>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-cream/60">
                {col.tasks.length}
              </span>
            </div>

            <div className="space-y-2">
              {col.tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="block w-full rounded-xl border border-white/10 bg-purple-deep/60 p-3 text-left transition hover:border-yellow/40"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-cream">{task.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLOR[task.priority]}`}>
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                  </div>
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

            {canWrite && <NewTaskInline columnId={col.id} onCreated={refresh} />}
          </div>
        ))}
      </div>

      {selectedTask && board && (
        <TaskDetailModal
          task={selectedTask}
          columns={board.columns.map((c) => ({ id: c.id, name: c.name }))}
          users={users}
          canWrite={canWrite}
          canDelete={hasPermission(user ?? null, "projects.admin")}
          onClose={() => setSelectedTask(null)}
          onChanged={async () => {
            await refresh()
            setSelectedTask(null)
          }}
        />
      )}
    </main>
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
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-yellow px-3 py-1 text-xs font-semibold text-purple-deep disabled:opacity-50"
        >
          Agregar
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-cream/50 hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  )
}

function TaskDetailModal({
  task,
  columns,
  users,
  canWrite,
  canDelete,
  onClose,
  onChanged,
}: {
  task: TaskItem
  columns: { id: string; name: string }[]
  users: BasicUser[]
  canWrite: boolean
  canDelete: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [comment, setComment] = useState("")
  const [busy, setBusy] = useState(false)
  const assignedIds = new Set(task.assignees.map((a) => a.userId))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-purple-deep p-6">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold text-cream">{task.title}</h2>
          <button onClick={onClose} className="text-cream/50 hover:text-cream">
            ✕
          </button>
        </div>

        {task.description && <p className="mb-4 text-sm text-cream/70">{task.description}</p>}

        {canWrite && (
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-cream/70">Columna</span>
            <select
              defaultValue={task.boardColumnId}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true)
                try {
                  await updateTask(task.id, { boardColumnId: e.target.value })
                  onChanged()
                } finally {
                  setBusy(false)
                }
              }}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id} className="bg-purple-deep">
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mb-4">
          <p className="mb-1 text-sm text-cream/70">Responsables</p>
          <div className="flex flex-wrap gap-2">
            {users.map((u) => {
              const active = assignedIds.has(u.id)
              return (
                <button
                  key={u.id}
                  disabled={!canWrite || busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      if (active) await unassignTask(task.id, u.id)
                      else await assignTask(task.id, u.id)
                      onChanged()
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    active
                      ? "border-yellow bg-yellow/20 text-yellow"
                      : "border-white/20 text-cream/60 hover:border-white/40"
                  } disabled:opacity-50`}
                >
                  {u.name}
                </button>
              )
            })}
          </div>
        </div>

        <form
          className="mb-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!comment.trim()) return
            setBusy(true)
            try {
              await addTaskComment(task.id, comment.trim())
              setComment("")
              onChanged()
            } finally {
              setBusy(false)
            }
          }}
        >
          <label className="mb-1 block text-sm text-cream/70">Comentario</label>
          <div className="flex gap-2">
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
          </div>
        </form>

        <div className="mt-4 flex justify-between">
          {canDelete ? (
            <button
              onClick={async () => {
                if (!confirm("¿Eliminar esta tarea?")) return
                setBusy(true)
                try {
                  await deleteTask(task.id)
                  onChanged()
                } finally {
                  setBusy(false)
                }
              }}
              className="text-xs text-orange hover:underline"
            >
              Eliminar tarea
            </button>
          ) : (
            <span />
          )}
          <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
