"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, logout, hasPermission, type SessionUser } from "../../lib/auth"
import { RoleGate } from "../../components/RoleGate"
import { getDashboardSummary, type DashboardSummary } from "../../lib/projects"

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) {
        router.replace("/login")
      } else {
        setUser(u)
      }
    })
  }, [router])

  useEffect(() => {
    if (user && hasPermission(user, "projects.read")) {
      getDashboardSummary()
        .then(setSummary)
        .catch(() => setSummary(null))
    }
  }, [user])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-yellow">Hola, {user?.name}</h1>
          <p className="text-sm text-cream/60">
            {user?.roles.join(", ")}
          </p>
        </div>
        <button
          onClick={async () => {
            await logout()
            router.push("/login")
          }}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
        >
          Cerrar sesión
        </button>
      </header>

      <RoleGate user={user ?? null} permission="projects.read">
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Proyectos activos" value={summary?.activeProjects} />
          <StatCard label="Tareas abiertas" value={summary?.totalOpenTasks} />
          <StatCard label="Mis tareas" value={summary?.myTasks} />
          <StatCard
            label="Vencen pronto"
            value={summary?.dueSoon}
            highlight={!!summary?.dueSoon && summary.dueSoon > 0}
          />
        </section>
      </RoleGate>

      {/* Navegación por permiso — Proyectos ya está implementado (Módulo 2);
          el resto son placeholders visuales hasta que se aborde cada módulo. */}
      <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <RoleGate user={user ?? null} permission="projects.read">
          <NavCard label="Proyectos" href="/proyectos" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="cases.read">
          <NavCard label="Casos" disabled />
        </RoleGate>
        <RoleGate user={user ?? null} permission="logistics.read">
          <NavCard label="Logística" disabled />
        </RoleGate>
        <RoleGate user={user ?? null} permission="field_ops.read">
          <NavCard label="Operaciones de Campo" disabled />
        </RoleGate>
        <RoleGate user={user ?? null} permission="finance.read">
          <NavCard label="Finanzas" disabled />
        </RoleGate>
        <RoleGate user={user ?? null} permission="analytics.read">
          <NavCard label="Analítica" disabled />
        </RoleGate>
      </nav>

      <p className="mt-10 text-xs text-cream/40">
        Módulo 1 (Core &amp; Seguridad) y Módulo 2 (Gestión de Proyectos)
        activos. Las demás secciones son placeholders visuales — cada una se
        implementa como su propio módulo.
      </p>
    </main>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number | undefined
  highlight?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-cream/50">{label}</p>
      <p
        className={`mt-1 font-display text-2xl font-bold ${
          highlight ? "text-orange" : "text-cream"
        }`}
      >
        {value ?? "–"}
      </p>
    </div>
  )
}

function NavCard({
  label,
  href,
  disabled,
}: {
  label: string
  href?: string
  disabled?: boolean
}) {
  if (disabled || !href) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center font-display font-semibold text-cream/40">
        {label}
        <p className="mt-1 text-[10px] font-normal uppercase tracking-wide text-cream/30">
          Próximamente
        </p>
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/15 bg-white/5 p-5 text-center font-display font-semibold text-cream/80 transition hover:border-yellow/50 hover:bg-white/10"
    >
      {label}
    </Link>
  )
}
