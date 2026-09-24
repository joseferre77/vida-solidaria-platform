"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { fetchMe, hasPermission, logout, type SessionUser } from "../lib/auth"
import { fetchMarDelPlataWeather, type WeatherNow } from "../lib/weather"
import { NotificationBell } from "./NotificationBell"

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
 * Fase M (22/09/2026) — reskin según el manual de identidad oficial: fondo
 * Papel en vez del degradado violeta oscuro, íconos de línea en vez de
 * emojis (el manual los prohíbe "en piezas oficiales"), avatar de usuario
 * en violeta plano en vez de degradado magenta→naranja (el manual prohíbe
 * degradados fuera del logo). Ver PLAN_FASE_M.md.
 *
 * Nota: este componente hace su propio fetchMe() para mostrar nombre y
 * permisos. Cada página sigue haciendo el suyo, por separado, para su
 * propia lógica de redirect a /login y estado de carga — no se tocó esa
 * arquitectura acá a propósito: es una app en producción, y separar esta
 * responsabilidad evita arriesgar el flujo de auth de cada pantalla por
 * agregar una barra.
 */

type IconName = "inicio" | "casos" | "proyectos" | "equipos" | "admin" | "analitica" | "chat"

// Íconos de línea, trazo 2px, caja 24, esquinas redondeadas, un solo color
// (heredan color por currentColor) — sección 06 · SISTEMA GRÁFICO del
// manual. Reemplazan los emojis que traía la barra antes.
function Icon({ name, className }: { name: IconName; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
  }
  switch (name) {
    case "inicio":
      return (
        <svg {...common}>
          <path d="M4 11.5 12 4l8 7.5" />
          <path d="M6 10v9h5v-6h2v6h5v-9" />
        </svg>
      )
    case "casos":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="1.5" />
          <path d="M9 3.5h6v2.5H9z" />
          <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
        </svg>
      )
    case "proyectos":
      return (
        <svg {...common}>
          <path d="M4 6.5h5.5L11 8.5h9V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z" />
        </svg>
      )
    case "equipos":
      return (
        <svg {...common}>
          <circle cx="9" cy="8.5" r="3" />
          <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
          <circle cx="17" cy="8.5" r="2.3" />
          <path d="M15.7 14.2c2.4.4 4.3 2.2 4.3 4.8" />
        </svg>
      )
    case "admin":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.3l1.9 1.1M17.5 15.6l1.9 1.1M4.6 16.7l1.9-1.1M17.5 8.4l1.9-1.1M3.5 12h2.2M18.3 12h2.2" />
        </svg>
      )
    case "analitica":
      return (
        <svg {...common}>
          <path d="M4 20V10M11 20V4M18 20v-7" />
          <path d="M3 20h18" />
        </svg>
      )
    case "chat":
      return (
        <svg {...common}>
          <path d="M4 5.5h16v10H9l-4 3.5v-3.5H4z" />
        </svg>
      )
  }
}

const NAV_ITEMS: {
  href: string
  label: string
  icon: IconName
  visible: (user: SessionUser) => boolean
}[] = [
  { href: "/dashboard", label: "Inicio", icon: "inicio", visible: () => true },
  {
    href: "/casos",
    label: "Casos",
    icon: "casos",
    visible: (u) => hasPermission(u, "cases.read") || hasPermission(u, "cases.write"),
  },
  { href: "/proyectos", label: "Proyectos", icon: "proyectos", visible: () => true },
  {
    href: "/equipos",
    label: "Equipos",
    icon: "equipos",
    visible: (u) => hasPermission(u, "field_ops.read") || hasPermission(u, "logistics.read"),
  },
  {
    href: "/administracion",
    label: "Admin",
    icon: "admin",
    visible: (u) =>
      hasPermission(u, "projects.admin") || hasPermission(u, "surveys.manage") || hasPermission(u, "users.manage"),
  },
  {
    href: "/analitica",
    label: "Analítica",
    icon: "analitica",
    visible: (u) => hasPermission(u, "analytics.read"),
  },
  {
    href: "/coordinacion",
    label: "Chat",
    icon: "chat",
    visible: (u) => hasPermission(u, "coordination.chat"),
  },
]

const SECTION_TITLE: { test: (path: string) => boolean; label: string }[] = [
  { test: (p) => p === "/dashboard", label: "Inicio" },
  { test: (p) => p.startsWith("/casos"), label: "Casos" },
  { test: (p) => p.startsWith("/proyectos"), label: "Proyectos" },
  { test: (p) => p.startsWith("/equipos"), label: "Equipos y Secciones" },
  { test: (p) => p.startsWith("/administracion"), label: "Administración" },
  { test: (p) => p.startsWith("/analitica"), label: "Analítica" },
  { test: (p) => p.startsWith("/coordinacion"), label: "Chat de coordinadores" },
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

  // OJO: acá NO va bg-papel en el contenedor raíz — todavía envuelve a
  // {children}, y casi todas las pantallas (Dashboard, Casos, etc.) están
  // escritas para el fondo oscuro anterior (texto claro). Poner bg-papel
  // acá las deja con texto claro sobre fondo claro, ilegible. Header y nav
  // (abajo) sí llevan su propio bg-papel explícito — son los únicos dos
  // pedazos ya rehechos para el tema claro. El resto se pasa pantalla por
  // pantalla en un paso aparte (ver PLAN_FASE_M.md) y ahí sí este
  // contenedor pasa a bg-papel también.
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-violeta/15 bg-papel/95 px-3 py-2 backdrop-blur sm:px-5">
        <Link href="/dashboard" className="flex min-w-0 shrink-0 items-center gap-2">
          <img src="/brand/isotipo.png" alt="" className="h-8 w-auto sm:hidden" />
          <img src="/brand/logo-horizontal.png" alt="Vida Solidaria" className="hidden h-7 w-auto sm:block" />
          <span className="hidden truncate font-display text-sm font-bold text-violeta/70 md:inline">
            · {sectionTitle}
          </span>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 sm:flex">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isActive(pathname, item.href) ? "bg-amarillo text-tinta" : "text-violeta/70 hover:bg-violeta/8 hover:text-violeta"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {now && (
            <>
              <span className="hidden items-center gap-1 whitespace-nowrap text-xs text-tinta/55 sm:flex">
                {dateStr} · {timeStr}
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-tinta/55 sm:hidden">
                {timeStr}
              </span>
            </>
          )}
          {weather && (
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-tinta/55">
              {weather.emoji} {weather.tempC}°C
            </span>
          )}
          {user && <NotificationBell />}
          {user && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-violeta/8 py-1 pl-1 pr-2 hover:bg-violeta/15"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violeta text-[10px] font-bold text-papel">
                  {initials(user.name)}
                </span>
                <span className="hidden max-w-[100px] truncate text-xs font-medium text-tinta sm:inline">
                  {user.name}
                </span>
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-violeta/15 bg-papel py-1 shadow-lg">
                    <p className="truncate border-b border-violeta/10 px-3 py-2 text-xs text-tinta/50">{user.name}</p>
                    <button
                      onClick={async () => {
                        setMenuOpen(false)
                        await logout()
                        router.push("/login")
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-tinta hover:bg-violeta/8"
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

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-violeta/15 bg-papel/95 backdrop-blur sm:hidden">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold ${
              isActive(pathname, item.href) ? "text-violeta" : "text-tinta/40"
            }`}
          >
            <Icon name={item.icon} className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
