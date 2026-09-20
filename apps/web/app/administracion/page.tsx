"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import { Etiquetas } from "./tabs/Etiquetas"
import { CamposPersonalizados } from "./tabs/CamposPersonalizados"
import { Encuestas } from "./tabs/Encuestas"
import { Usuarios } from "./tabs/Usuarios"

type TabKey = "usuarios" | "etiquetas" | "campos" | "encuestas"

/**
 * Fase G — pantallas de administración. A diferencia de la página de un
 * proyecto, estas entidades son globales a la organización (Label,
 * CustomFieldDefinition, Survey no cuelgan de un proyecto puntual), así que
 * viven en su propia ruta de nivel superior en vez de bajo /proyectos/[id].
 * "Etiquetas" y "Campos personalizados" requieren el permiso projects.admin
 * (igual que el backend); "Encuestas" requiere surveys.manage — por eso la
 * página entera solo pide "alguno de los dos" para entrar, y cada pestaña
 * se auto-oculta si al usuario le falta el permiso específico.
 */
export default function AdministracionPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [activeTab, setActiveTab] = useState<TabKey>("usuarios")

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canAdmin = hasPermission(user, "projects.admin")
  const canSurveys = hasPermission(user, "surveys.manage")
  const canUsers = hasPermission(user, "users.manage")

  if (!canAdmin && !canSurveys && !canUsers) {
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
    { key: "usuarios", label: "Usuarios", visible: canUsers },
    { key: "etiquetas", label: "Etiquetas", visible: canAdmin },
    { key: "campos", label: "Campos Personalizados", visible: canAdmin },
    { key: "encuestas", label: "Encuestas", visible: canSurveys },
  ].filter((t) => t.visible) as { key: TabKey; label: string; visible: boolean }[]

  const currentTab = TABS.some((t) => t.key === activeTab) ? activeTab : TABS[0]?.key

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <Link href="/dashboard" className="text-xs text-cream/50 hover:underline">
          ← Inicio
        </Link>
        <h1 className="mt-1 font-display text-2xl font-bold text-yellow">Administración</h1>
        <p className="mt-1 text-xs text-cream/50">
          Etiquetas, campos personalizados y encuestas — configuración compartida por toda la organización.
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

      {currentTab === "usuarios" && <Usuarios currentUserId={user!.id} />}
      {currentTab === "etiquetas" && <Etiquetas />}
      {currentTab === "campos" && <CamposPersonalizados />}
      {currentTab === "encuestas" && <Encuestas currentUserId={user!.id} />}
    </main>
  )
}
