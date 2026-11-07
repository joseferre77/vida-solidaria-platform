import { apiFetch } from "./api-client"

/**
 * Fase X — Mapa de voluntarios: cliente de los endpoints nuevos del módulo
 * de Operaciones de Campo (mismo `apiFetch`/convenciones que lib/field-ops.ts,
 * separado en su propio archivo porque es un sub-feature con su propio
 * conjunto de tipos).
 */

export const OPERATIONAL_POINT_CATEGORIES = [
  "acopio_ropa",
  "cocina",
  "recepcion_comida",
  "distribucion_ropa",
  "feria",
  "punto_encuentro",
  "retiro_ropa",
  "otro",
] as const

export type OperationalPointCategory = (typeof OPERATIONAL_POINT_CATEGORIES)[number]

export const OPERATIONAL_POINT_CATEGORY_LABEL: Record<OperationalPointCategory, string> = {
  acopio_ropa: "Centro de acopio de ropa",
  cocina: "Cocina",
  recepcion_comida: "Recepción de comida",
  distribucion_ropa: "Distribución de ropa",
  feria: "Feria física",
  punto_encuentro: "Punto de encuentro",
  retiro_ropa: "Retiro de ropa",
  otro: "Otro",
}

// Un color fijo por categoría (nunca se reasignan si cambia el filtro) —
// mismo criterio que CASE_MAP_COLOR en lib/analytics.ts.
export const OPERATIONAL_POINT_CATEGORY_COLOR: Record<OperationalPointCategory, string> = {
  acopio_ropa: "#f59e0b",
  cocina: "#ef4444",
  recepcion_comida: "#10b981",
  distribucion_ropa: "#3b82f6",
  feria: "#a855f7",
  punto_encuentro: "#eab308",
  retiro_ropa: "#06b6d4",
  otro: "#9ca3af",
}

export interface OperationalPointItem {
  id: string
  category: OperationalPointCategory
  name: string
  address: string | null
  lat: number
  lng: number
  geocodedAt: string | null
  active: boolean
  createdBy: string
  createdByUser: { id: string; name: string; email: string } | null
  createdAt: string
  updatedAt: string
}

export interface MapVolunteer {
  id: string
  name: string
  email: string
  address: string | null
  lat: number
  lng: number
  geocodedAt: string | null
}

export interface MapVolunteersResponse {
  items: MapVolunteer[]
  stats: { geocoded: number; totalWithAddress: number; totalUsers: number }
}

export interface MapSettingsItem {
  id: string
  centerLat: number
  centerLng: number
  updatedBy: string | null
  updatedAt: string | null
}

// ── Puntos de operación ──
export const listOperationalPoints = () => apiFetch("/api/operational-points") as Promise<OperationalPointItem[]>

export const createOperationalPoint = (data: {
  category: OperationalPointCategory
  name: string
  address?: string
  lat?: number
  lng?: number
}) => apiFetch("/api/operational-points", { method: "POST", body: JSON.stringify(data) }) as Promise<OperationalPointItem>

export const updateOperationalPoint = (
  id: string,
  data: Partial<{
    category: OperationalPointCategory
    name: string
    address: string
    lat: number
    lng: number
    active: boolean
  }>,
) => apiFetch(`/api/operational-points/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<OperationalPointItem>

export const deleteOperationalPoint = (id: string) => apiFetch(`/api/operational-points/${id}`, { method: "DELETE" })

// ── Voluntarios geolocalizados ──
export const getMapVolunteers = () => apiFetch("/api/map/volunteers") as Promise<MapVolunteersResponse>

export const geocodeVolunteers = (force?: boolean) =>
  apiFetch("/api/map/volunteers/geocode", { method: "POST", body: JSON.stringify({ force }) }) as Promise<{
    attempted: number
    geocoded: number
    failed: number
  }>

// ── Centro de los 4 cuadrantes ──
export const getMapSettings = () => apiFetch("/api/map/settings") as Promise<MapSettingsItem>

export const updateMapSettings = (data: { centerLat: number; centerLng: number }) =>
  apiFetch("/api/map/settings", { method: "PATCH", body: JSON.stringify(data) }) as Promise<MapSettingsItem>
