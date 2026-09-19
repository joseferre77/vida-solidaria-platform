"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import {
  listProjects,
  createProject,
  type ProjectListItem,
  type ProjectStatus,
  type TaskPriority,
} from "../../lib/projects"

const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planificación",
  active: "Activo",
  paused: "Pausado",
  done: "Terminado",
}

const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning: "bg-navy/40 text-cream/80",
  active: "bg-yellow/20 text-yellow",
  paused: "bg-orange/20 text-orange",
  done: "bg-white/10 text-cream/50",
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
}

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baja: "bg-white/10 text-cream/60",
  media: "bg-yellow/20 text-yellow",
  alta: "bg-orange/20 text-orange",
}

function formatMoney(value: string | number | null): string {
  if (value === null || value === undefined) return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(n)) return "—"
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export default function ProyectosPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    // Antes esto exigía el permiso GLOBAL projects.read, así que un
    // voluntario/coordinador agregado como miembro de un proyecto puntual
    // (sin ese permiso global) quedaba rebotado a /dashboard sin poder ver
    // ni siquiera SUS propios proyectos. El backend ya filtra por
    // membership (ver GET /api/projects) — acá solo hace falta estar
    // logueado, la lista que vuelve ya es la correcta para cada usuario.
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  async function refresh() {
    try {
      setProjects(await listProjects())
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (user) refresh()
  }, [user])

  if (user === undefined || (user && projects === null && !error)) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canCreate = hasPermission(user ?? null, "projects.write")

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard" className="text-xs text-cream/50 hover:underline">
            ← Volver al dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-yellow">Proyectos</h1>
          <p className="text-sm text-cream/50">
            {projects ? `${projects.length} proyecto${projects.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
          >
            + Nuevo proyecto
          </button>
        )}
      </header>

      {error && (
        <p className="mb-4 rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm text-orange">{error}</p>
      )}

      {projects && projects.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-cream/60">
          Todavía no hay proyectos para vos acá.
          {canCreate && " Creá el primero con el botón de arriba."}
        </p>
      )}

      {projects && projects.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Título</th>
                <th className="px-4 py-3 font-medium">Casos</th>
                <th className="px-4 py-3 font-medium">Presupuesto</th>
                <th className="px-4 py-3 font-medium">Inicio</th>
                <th className="px-4 py-3 font-medium">Límite</th>
                <th className="px-4 py-3 font-medium">Progreso</th>
                <th className="px-4 py-3 font-medium">Prioridad</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => router.push(`/proyectos/${p.id}`)}
                  className="cursor-pointer border-b border-white/5 transition hover:bg-white/10"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cream/50">{p.code}</td>
                  <td className="px-4 py-3">
                    <div className="font-display font-semibold text-cream">{p.name}</div>
                    {p.area && <div className="text-xs text-cream/50">{p.area}</div>}
                    {p.labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.labels.map((l) => (
                          <span
                            key={l.id}
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium text-cream"
                            style={{ backgroundColor: `${l.color}33`, color: l.color }}
                          >
                            {l.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream/70">
                    {p.caseCount > 0 ? `${p.caseCount} caso${p.caseCount === 1 ? "" : "s"}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream/70">{formatMoney(p.budget)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream/70">{formatDate(p.startDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream/70">{formatDate(p.endDate)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-yellow"
                          style={{ width: `${p.progressPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-cream/50">{p.progressPct}%</span>
                    </div>
                    {p.overdueTaskCount > 0 && (
                      <div className="mt-1 text-[11px] font-semibold text-orange">
                        {p.overdueTaskCount} tarea{p.overdueTaskCount === 1 ? "" : "s"} vencida
                        {p.overdueTaskCount === 1 ? "" : "s"}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLOR[p.priority]}`}>
                      {PRIORITY_LABEL[p.priority]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status]}`}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <NewProjectModal
          onClose={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false)
            await refresh()
          }}
        />
      )}
    </main>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("")
  const [area, setArea] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<TaskPriority>("media")
  const [budget, setBudget] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createProject({
        name,
        area: area || undefined,
        description: description || undefined,
        priority,
        budget: budget ? Number(budget) : undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate).toISOString() : undefined,
      })
      onCreated()
    } catch (e: any) {
      setError(e.message ?? "No se pudo crear el proyecto")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo proyecto</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            placeholder="Ej: Frazadas de invierno"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Área</span>
            <input
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
              placeholder="Ej: Cocina comunitaria"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Prioridad</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            >
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
            </select>
          </label>
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Presupuesto (ARS)</span>
          <input
            type="number"
            min="0"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            placeholder="Opcional"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Fecha de inicio</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Fecha límite</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Descripción</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creando..." : "Crear proyecto"}
          </button>
        </div>
      </form>
    </div>
  )
}
