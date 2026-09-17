"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, logout, type SessionUser } from "../../lib/auth"
import { RoleGate } from "../../components/RoleGate"

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) {
        router.replace("/login")
      } else {
        setUser(u)
      }
    })
  }, [router])

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

      {/* Navegación por permiso — placeholder de la estructura que se llena
          en cada módulo siguiente (Proyectos, Casos, Logística, etc.) */}
      <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <RoleGate user={user ?? null} permission="projects.read">
          <NavCard label="Proyectos" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="cases.read">
          <NavCard label="Casos" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="logistics.read">
          <NavCard label="Logística" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="field_ops.read">
          <NavCard label="Operaciones de Campo" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="finance.read">
          <NavCard label="Finanzas" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="analytics.read">
          <NavCard label="Analítica" />
        </RoleGate>
      </nav>

      <p className="mt-10 text-xs text-cream/40">
        Módulo 1 (Core &amp; Seguridad) activo. Las secciones de arriba son
        placeholders visuales — cada una se implementa como su propio módulo.
      </p>
    </main>
  )
}

function NavCard({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-5 text-center font-display font-semibold text-cream/80">
      {label}
    </div>
  )
}
