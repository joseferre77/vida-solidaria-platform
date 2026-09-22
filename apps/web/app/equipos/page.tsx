"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import { Equipos } from "./tabs/Equipos"
import { Zonas } from "./tabs/Zonas"
import { Presentismo } from "./tabs/Presentismo"
import { Checkins } from "./tabs/Checkins"
import { Cocina } from "./tabs/Cocina"
import { Stock } from "./tabs/Stock"

type TabKey = "equipos" | "zonas" | "presentismo" | "checkins" | "cocina" | "stock"

/**
 * Fase I — "Equipos y Secciones": equipos de campo, zonas con asignación
 * semanal, check-ins (Extracción de calle / Relevamiento comparten el
 * mismo registro) y lotes de Cocina. Mismo patrón de pestañas que
 * /administracion: permiso field_ops.* para las primeras tres,
 * logistics.* para Cocina.
 */
const TAB_KEYS: TabKey[] = ["equipos", "zonas", "presentismo", "checkins", "cocina", "stock"]

export default function EquiposPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<TabKey>("equipos")

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  // Permite linkear directo a una pestaña (?tab=cocina) desde otras
  // pantallas — ej. el aviso de stock bajo y el widget "Te toca cocinar"
  // del dashboard.
  useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && (TAB_KEYS as string[]).includes(tab)) setActiveTab(tab as TabKey)
  }, [searchParams])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canFieldOps = hasPermission(user, "field_ops.read")
  const canLogistics = hasPermission(user, "logistics.read")

  if (!canFieldOps && !canLogistics) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <p className="text-sm text-cream/60">No tenés permiso para ver esta sección.</p>
      </main>
    )
  }

  const TABS: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "equipos", label: "Equipos", visible: canFieldOps },
    { key: "zonas", label: "Zonas", visible: canFieldOps },
    { key: "presentismo", label: "Presentismo", visible: canFieldOps },
    { key: "checkins", label: "Check-ins", visible: canFieldOps },
    { key: "cocina", label: "Cocina", visible: canLogistics },
    { key: "stock", label: "Stock", visible: canLogistics },
  ].filter((t) => t.visible) as { key: TabKey; label: string; visible: boolean }[]

  const currentTab = TABS.some((t) => t.key === activeTab) ? activeTab : TABS[0]?.key

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-yellow">Equipos y Secciones</h1>
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
      {currentTab === "presentismo" && <Presentismo />}
      {currentTab === "checkins" && <Checkins />}
      {currentTab === "cocina" && <Cocina />}
      {currentTab === "stock" && <Stock />}
    </main>
  )
}
