"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { fetchMe, hasPermission, logout, type SessionUser } from "../lib/auth"
import { fetchMarDelPlataWeather, type WeatherNow } from "../lib/weather"

/**
 * Barra superior + navegación persistentes para toda la app autenticada
 * (se monta una sola vez en app/layout.tsx, alrededor de {children}).
 *
 * Antes cada pantalla (/casos, /proyectos, /equipos, /administracion)
 * armaba su propio header suelto con nada más que un link "← Inicio" — no
 * había forma de saltar de un módulo a otro sin volver primero al
 * Dashboard, ni ningún dato de contexto (nombre real, hora, clima) fuera
 * de esa pantalla. Con un voluntario parado en la calle, hablando con
 * alguien y con el celular en una mano, esa fricción importa.
 *
 * En celular la navegación queda abajo (alcance del pulgar); en pantallas
 * grandes el mismo array de secciones se muestra arriba, horizontal — un
 * solo componente, se adapta solo por breakpoint de Tailwind (sm:).
 *
 * Nota: este componente hace su propio fetchMe() para mostrar nombre y
 * permisos. Cada página sigue haciendo el suyo, por separado, para su
 * propia lógica de redirect a /login y estado de carga — no se tocó esa
 * arquitectura acá a propósito: es una app en producción, y separar esta
 * responsabilidad evita arriesgar el flujo de auth de cada pantalla por
 * agregar una barra.
 */

const NAV_ITEMS: {
  href: string
  label: string
  icon: string
  visible: (user: SessionUser) => boolean
}[] = [
  { href: "/dashboard", label: "Inicio", icon: "🏠", visible: () => true },
  {
    href: "/casos",
    label: "Casos",
    icon: "🗂️",
    visible: (u) => hasPermission(u, "cases.read") || hasPermission(u, "cases.write"),
  },
  { href: "/proyectos", label: "Proyectos", icon: "📁", visible: () => true },
  {
    href: "/equipos",
    label: "Equipos",
    icon: "👥",
    visible: (u) => hasPermission(u, "field_ops.read") || hasPermission(u, "logistics.read"),
  },
  {
    href: "/administracion",
    label: "Admin",
    icon: "⚙️",
    visible: (u) =>
      hasPermission(u, "projects.admin") || hasPermission(u, "surveys.manage") || hasPermission(u, "users.manage"),
  },
  {
    href: "/analitica",
    label: "Analítica",
    icon: "📊",
    visible: (u) => hasPermission(u, "analytics.read"),
  },
]

const SECTION_TITLE: { test: (path: string) => boolean; label: string }[] = [
  { test: (p) => p === "/dashboard", label: "Inicio" },
  { test: (p) => p.startsWith("/casos"), label: "Casos" },
  { test: (p) => p.startsWith("/proyectos"), label: "Proyectos" },
  { test: (p) => p.startsWith("/equipos"), label: "Equipos y Secciones" },
  { test: (p) => p.startsWith("/administracion"), label: "Administración" },
  { test: (p) => p.startsWith("/analitica"), label: "Analítica" },
]

function sectionTitleFor(path: string) {
  return SECTION_TITLE.find((s) => s.test(path))?.label ?? "Vida Solidaria"
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href)
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Sin barra en /login (todavía no hay sesión) ni en "/" (solo redirige).
  const hideChrome = pathname === "/login" || pathname === "/"

  useEffect(() => {
    if (hideChrome) return
    fetchMe().then(setUser)
  }, [hideChrome])

  useEffect(() => {
    if (hideChrome) return
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [hideChrome])

  useEffect(() => {
    if (hideChrome) return
    let cancelled = false
    function load() {
      fetchMarDelPlataWeather().then((w) => {
        if (!cancelled) setWeather(w)
      })
    }
    load()
    const id = setInterval(load, 30 * 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [hideChrome])

  if (hideChrome) return <>{children}</>

  const dateStr = now?.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) ?? ""
  const timeStr = now?.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) ?? ""
  const sectionTitle = sectionTitleFor(pathname ?? "")
  const visibleItems = user ? NAV_ITEMS.filter((i) => i.visible(user)) : []

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-3 py-2 backdrop-blur sm:px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow font-display text-sm font-bold text-purple-deep">
            VS
          </span>
          <span className="truncate font-display text-sm font-bold text-yellow sm:text-base">{sectionTitle}</span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 sm:flex">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive(pathname, item.href) ? "bg-white/10 text-yellow" : "text-cream/60 hover:text-cream"
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {now && (
            <>
              <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-cream/70 sm:flex">
                🕐 {dateStr} · {timeStr}
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-cream/70 sm:hidden">
                🕐 {timeStr}
              </span>
            </>
          )}
          {weather && (
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-cream/70">
              {weather.emoji} {weather.tempC}°C
            </span>
          )}
          {user && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-2 hover:bg-white/15"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-magenta to-orange text-[10px] font-bold text-cream">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[100px] truncate text-xs font-medium text-cream sm:inline">
                  {user.name}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-white/15 bg-purple-deep py-1 shadow-xl">
                    <p className="truncate border-b border-white/10 px-3 py-2 text-xs text-cream/50">{user.name}</p>
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        await logout()
                        router.push("/login")
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-cream hover:bg-white/10"
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 pb-16 sm:pb-0">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-purple-deep/95 backdrop-blur sm:hidden">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
              isActive(pathname, item.href) ? "text-yellow" : "text-cream/45"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
