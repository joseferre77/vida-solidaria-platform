"use client"

import { useState } from "react"
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, formatDate, formatMinutes, formatMoney, initials } from "../../../../lib/format"
import { addProjectMember, removeProjectMember, type BasicUser, type ProjectDetail, type ProjectRole } from "../../../../lib/projects"

const ROLE_LABEL: Record<ProjectRole, string> = { creador: "Creador", admin: "Admin", editor: "Editor", visor: "Solo lectura" }

/**
 * Fase L: antes no había NINGUNA forma de agregar/quitar miembros de un
 * proyecto desde la UI — `POST/DELETE /projects/:id/members` existían en
 * la API desde antes pero nunca se llamaban desde ningún lado del
 * frontend (bug que reportó Josecito: "desde el caso agrego integrantes...
 * al entrar al proyecto no se reflejan" — no es que no se reflejaran, es
 * que nunca se llegaban a crear). Se agrega acá, en Vista General, que es
 * donde ya se mostraba la lista de miembros.
 */
export function VistaGeneral({
  project,
  users,
  canAdmin,
  onChanged,
}: {
  project: ProjectDetail
  users: BasicUser[]
  canAdmin: boolean
  onChanged: () => void
}) {
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow/80 text-[10px] font-bold text-purple-deep">
                  {initials(m.user.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-cream">{m.user.name}</p>
                  <p className="text-[11px] text-cream/50">{ROLE_LABEL[m.projectRole]}</p>
                </div>
                {canAdmin && m.projectRole !== "creador" && (
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Quitar a ${m.user.name} del proyecto?`)) return
                      try {
                        await removeProjectMember(project.id, m.userId)
                        onChanged()
                      } catch (e: any) {
                        alert(e.message ?? "No se pudo quitar al integrante")
                      }
                    }}
                    className="shrink-0 text-cream/30 hover:text-orange"
                    title="Quitar del proyecto"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canAdmin && <AddMemberForm projectId={project.id} users={users} existingUserIds={project.members.map((m) => m.userId)} onChanged={onChanged} />}
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

function AddMemberForm({
  projectId,
  users,
  existingUserIds,
  onChanged,
}: {
  projectId: string
  users: BasicUser[]
  existingUserIds: string[]
  onChanged: () => void
}) {
  const [userId, setUserId] = useState("")
  const [role, setRole] = useState<ProjectRole>("editor")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = users.filter((u) => !existingUserIds.includes(u.id))

  return (
    <form
      className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!userId) return
        setSaving(true)
        setError(null)
        try {
          await addProjectMember(projectId, userId, role)
          setUserId("")
          onChanged()
        } catch (err: any) {
          setError(err.message ?? "No se pudo agregar el integrante")
        } finally {
          setSaving(false)
        }
      }}
    >
      <select
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
      >
        <option value="">+ Agregar integrante...</option>
        {available.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as ProjectRole)}
        className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
      >
        <option value="editor">Editor</option>
        <option value="visor">Solo lectura</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        disabled={saving || !userId}
        className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep disabled:opacity-50"
      >
        Agregar
      </button>
      {error && <p className="w-full text-xs text-orange">{error}</p>}
      {available.length === 0 && <p className="w-full text-xs text-cream/40">Todos los usuarios activos ya son miembros.</p>}
    </form>
  )
}
