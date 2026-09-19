import type { ProjectStatus, TaskPriority } from "./projects"

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planificación",
  active: "Activo",
  paused: "Pausado",
  done: "Terminado",
}

export const STATUS_COLOR: Record<ProjectStatus, string> = {
  planning: "bg-navy/40 text-cream/80",
  active: "bg-yellow/20 text-yellow",
  paused: "bg-orange/20 text-orange",
  done: "bg-white/10 text-cream/50",
}

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
}

export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  baja: "bg-white/10 text-cream/60",
  media: "bg-yellow/20 text-yellow",
  alta: "bg-orange/20 text-orange",
}

export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  const n = typeof value === "string" ? Number(value) : value
  if (Number.isNaN(n)) return "—"
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** Minutos → "2h 15m" / "45m", para tiempo registrado (cronómetro). */
export function formatMinutes(totalMinutes: number | null | undefined): string {
  if (!totalMinutes) return "0m"
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/** Relativo simple ("hace 5 min", "hace 2 h", "hace 3 d") para feeds de actividad/comentarios. */
export function timeAgo(value: string | Date): string {
  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return "recién"
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `hace ${diffH} h`
  const diffD = Math.round(diffH / 24)
  if (diffD < 30) return `hace ${diffD} d`
  return formatDate(date)
}
