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

export default function ProyectosPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      if (!hasPermission(u, "projects.read")) return router.replace("/dashboard")
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

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-xs text-cream/50 hover:underline">
            ← Volver al dashboard
          </Link>
          <h1 className="font-display text-2xl font-bold text-yellow">Proyectos</h1>
        </div>
        {hasPermission(user ?? null, "projects.write") && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
          >
            + Nuevo proyecto
          </button>
        )}
      </header>

      {error && (
        <p className="mb-4 rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm text-orange">
          {error}
        </p>
      )}

      {projects && projects.length === 0 && (
        <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-cream/60">
          Todavía no hay proyectos creados.
          {hasPermission(user ?? null, "projects.write") && " Creá el primero con el botón de arriba."}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects?.map((p) => (
          <Link
            key={p.id}
            href={`/proyectos/${p.id}`}
            className="block rounded-2xl border border-white/15 bg-white/5 p-5 transition hover:border-yellow/40 hover:bg-white/10"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-display font-semibold text-cream">{p.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status]}`}>
                {STATUS_LABEL[p.status]}
              </span>
            </div>
            {p.area && <p className="mb-3 text-xs text-cream/50">{p.area}</p>}
            {p.description && (
              <p className="mb-4 line-clamp-2 text-sm text-cream/70">{p.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-cream/60">
              <span>{p.memberCount} miembro{p.memberCount === 1 ? "" : "s"}</span>
              <span>{p.taskCount} tarea{p.taskCount === 1 ? "" : "s"}</span>
              {p.overdueTaskCount > 0 && (
                <span className="font-semibold text-orange">{p.overdueTaskCount} vencida{p.overdueTaskCount === 1 ? "" : "s"}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createProject({ name, area: area || undefined, description: description || undefined })
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
        className="w-full max-w-md rounded-2xl border border-white/15 bg-purple-deep p-6"
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

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Área</span>
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            placeholder="Ej: Cocina comunitaria"
          />
        </label>

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
