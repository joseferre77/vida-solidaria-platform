import { apiFetch } from "./api-client"

export interface BasicUser {
  id: string
  name: string
  email: string
}

// Fase K bloque B: un integrante ahora está atado a una semana puntual
// (el equipo se arma de nuevo cada domingo) — por eso cada miembro trae su
// weekStartDate, y una misma persona puede aparecer varias veces (una por
// semana en la que participó).
export interface FieldTeamMemberItem extends BasicUser {
  weekStartDate: string
}

export interface FieldTeamItem {
  id: string
  name: string
  vehicleLabel: string | null
  members: FieldTeamMemberItem[]
}

export interface WeeklyAvailabilityItem {
  id: string
  user: BasicUser | null
  weekStartDate: string
  willAttend: boolean
  reason: string | null
  confirmedPresent: boolean | null
}

export interface MyAvailability {
  id: string
  weekStartDate: string
  willAttend: boolean
  reason: string | null
  confirmedPresent: boolean | null
}

export interface ZoneAssignmentItem {
  id: string
  teamId: string
  teamName: string
  weekStartDate: string
  weekEndDate: string
}

export interface ZoneItem {
  id: string
  name: string
  assignments: ZoneAssignmentItem[]
}

export type CheckinType =
  | "en_camino"
  | "llegamos"
  | "presente_punto_encuentro"
  | "presente_zona"
  | "entregando_viandas"
  | "relevando_caso"

export interface CheckinItem {
  id: string
  type: CheckinType
  lat: number
  lng: number
  createdAt: string
  user: BasicUser | null
  team: { id: string; name: string } | null
  caseId: string | null
  kitchenBatchId: string | null
  deliveries: { itemLabel: string; quantity: number | string }[]
}

// ── Equipos ──
export const listFieldTeams = () => apiFetch("/api/field-teams") as Promise<FieldTeamItem[]>

export const createFieldTeam = (data: { name: string; vehicleLabel?: string }) =>
  apiFetch("/api/field-teams", { method: "POST", body: JSON.stringify(data) }) as Promise<FieldTeamItem>

export const updateFieldTeam = (id: string, data: Partial<{ name: string; vehicleLabel: string }>) =>
  apiFetch(`/api/field-teams/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<FieldTeamItem>

export const deleteFieldTeam = (id: string) => apiFetch(`/api/field-teams/${id}`, { method: "DELETE" })

export const addFieldTeamMember = (teamId: string, userId: string, weekStartDate: string) =>
  apiFetch(`/api/field-teams/${teamId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, weekStartDate }),
  }) as Promise<BasicUser[]>

export const removeFieldTeamMember = (teamId: string, userId: string, weekStartDate: string) =>
  apiFetch(`/api/field-teams/${teamId}/members/${userId}?weekStartDate=${encodeURIComponent(weekStartDate)}`, {
    method: "DELETE",
  })

// ── Presentismo semanal (WeeklyAvailability) ──
export const getMyAvailability = (weekStartDate: string) =>
  apiFetch(`/api/weekly-availability/me?weekStartDate=${encodeURIComponent(weekStartDate)}`) as Promise<{
    availability: MyAvailability | null
  }>

export const setMyAvailability = (data: { weekStartDate: string; willAttend: boolean; reason?: string }) =>
  apiFetch("/api/weekly-availability/me", { method: "PUT", body: JSON.stringify(data) }) as Promise<MyAvailability>

export const listWeeklyAvailability = (weekStartDate: string) =>
  apiFetch(`/api/weekly-availability?weekStartDate=${encodeURIComponent(weekStartDate)}`) as Promise<
    WeeklyAvailabilityItem[]
  >

export const confirmWeeklyAvailability = (id: string, confirmedPresent: boolean) =>
  apiFetch(`/api/weekly-availability/${id}/confirm`, {
    method: "PATCH",
    body: JSON.stringify({ confirmedPresent }),
  }) as Promise<WeeklyAvailabilityItem>

// ── Zonas ──
export const listZones = () => apiFetch("/api/zones") as Promise<ZoneItem[]>

export const createZone = (name: string) =>
  apiFetch("/api/zones", { method: "POST", body: JSON.stringify({ name }) }) as Promise<ZoneItem>

export const deleteZone = (id: string) => apiFetch(`/api/zones/${id}`, { method: "DELETE" })

export const createZoneAssignment = (data: {
  zoneId: string
  teamId: string
  weekStartDate: string
  weekEndDate: string
}) => apiFetch("/api/zone-assignments", { method: "POST", body: JSON.stringify(data) }) as Promise<ZoneAssignmentItem>

export const deleteZoneAssignment = (id: string) => apiFetch(`/api/zone-assignments/${id}`, { method: "DELETE" })

// ── Check-ins ──
export const listCheckins = (filters?: { teamId?: string; type?: CheckinType }) => {
  const params = new URLSearchParams()
  if (filters?.teamId) params.set("teamId", filters.teamId)
  if (filters?.type) params.set("type", filters.type)
  const qs = params.toString()
  return apiFetch(`/api/checkins${qs ? `?${qs}` : ""}`) as Promise<CheckinItem[]>
}

export const createCheckin = (data: {
  teamId?: string
  type: CheckinType
  lat: number
  lng: number
  deliveries?: { itemLabel: string; quantity: number }[]
}) => apiFetch("/api/checkins", { method: "POST", body: JSON.stringify(data) }) as Promise<CheckinItem>
