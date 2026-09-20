"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import { Equipos } from "./tabs/Equipos"
import { Zonas } from "./tabs/Zonas"
import { Checkins } from "./tabs/Checkins"
import { Cocina } from "./tabs/Cocina"

type TabKey = "equipos" | "zonas" | "checkins" | "cocina"

/**
 * Fase I — "Equipos y Secciones": equipos de campo, zonas con asignación
 * semanal, check-ins (Extracción de calle / Relevamiento comparten el
 * mismo registro) y lotes de Cocina. Mismo patrón de pestañas que
 * /administracion: permiso field_ops.* para las primeras tres,
 * logistics.* para Cocina.
 */
export default function EquiposPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<TabKey>("equipos")

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canFieldOps = hasPermission(user, "field_ops.read")
  const canLogistics = hasPermission(user, "logistics.read")

  if (!canFieldOps && !canLogistics) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <p className="text-sm text-cream/60">No tenés permiso para ver esta sección.</p>
        <Link href="/dashboard" className="mt-2 inline-block text-xs text-yellow hover:underline">
          ← Volver al inicio
        </Link>
      </main>
    )
  }

  const TABS: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "equipos", label: "Equipos", visible: canFieldOps },
    { key: "zonas", label: "Zonas", visible: canFieldOps },
    { key: "checkins", label: "Check-ins", visible: canFieldOps },
    { key: "cocina", label: "Cocina", visible: canLogistics },
  ].filter((t) => t.visible) as { key: TabKey; label: string; visible: boolean }[]

  const currentTab = TABS.some((t) => t.key === activeTab) ? activeTab : TABS[0]?.key

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <Link href="/dashboard" className="text-xs text-cream/50 hover:underline">
          ← Inicio
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-yellow">Equipos y Secciones</h1>
        <p className="mt-1 text-xs text-cream/50">
          Equipos de campo, zonas, check-ins de Extracción y Relevamiento, y lotes de Cocina.
        </p>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
              currentTab === t.key ? "border-yellow text-yellow" : "border-transparent text-cream/50 hover:text-cream/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {currentTab === "equipos" && <Equipos />}
      {currentTab === "zonas" && <Zonas />}
      {currentTab === "checkins" && <Checkins />}
      {currentTab === "cocina" && <Cocina />}
    </main>
  )
}
