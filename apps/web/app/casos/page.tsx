"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import { NuevoCaso } from "./NuevoCaso"
import { Listado } from "./Listado"

type TabKey = "nuevo" | "listado"

/**
 * Fase J — "Casos": relevamiento móvil (reemplaza la planilla en papel) +
 * seguimiento de Mesa de Coordinación. Mismo patrón de pestañas que
 * /administracion y /equipos: gate por permiso `cases.read` / `cases.write`.
 * El tab "Nuevo caso" es el default para un voluntario en la calle — entra
 * directo al formulario, sin tener que buscar el botón.
 */
export default function CasosPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<TabKey>("nuevo")
  const [lastCreatedCaseNumber, setLastCreatedCaseNumber] = useState<string | null>(null)
  // Bloque E: cuando el buscador anti-duplicados de "Nuevo caso" encuentra
  // una coincidencia, se navega directo a ese caso existente en el listado.
  const [openCaseId, setOpenCaseId] = useState<string | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canRead = hasPermission(user, "cases.read")
  const canWrite = hasPermission(user, "cases.write")

  if (!canRead && !canWrite) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <p className="text-sm text-cream/60">No tenés permiso para ver esta sección.</p>
      </main>
    )
  }

  const TABS: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "nuevo", label: "+ Nuevo caso", visible: canWrite },
    { key: "listado", label: "Casos", visible: canRead },
  ].filter((t) => t.visible) as { key: TabKey; label: string; visible: boolean }[]

  const currentTab = TABS.some((t) => t.key === activeTab) ? activeTab : TABS[0]?.key

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-yellow">Casos</h1>
        <p className="mt-1 text-xs text-cream/50">
          Relevamiento en la calle y seguimiento de casos sociales — reemplaza la planilla en papel.
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

      {currentTab === "nuevo" && (
        <NuevoCaso
          onCreated={(caseNumber) => {
            setOpenCaseId(null)
            setLastCreatedCaseNumber(caseNumber)
            setActiveTab("listado")
          }}
          onSelectExistingCase={(caseId) => {
            setOpenCaseId(caseId)
            setActiveTab("listado")
          }}
        />
      )}
      {currentTab === "listado" && (
        <Listado canWrite={canWrite} openCaseId={openCaseId} key={lastCreatedCaseNumber ?? openCaseId ?? "list"} />
      )}
    </main>
  )
}
