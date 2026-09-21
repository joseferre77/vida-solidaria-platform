import { apiFetch } from "./api-client"

export type UserStatus = "active" | "pending" | "rejected" | "suspended"

export interface RoleItem {
  slug: string
  label: string
  rank: number
}

export interface UserItem {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  status: UserStatus
  volunteerMessage: string | null
  createdAt: string
  roles: { slug: string; label: string }[]
}

export const listRoles = () => apiFetch("/api/roles") as Promise<RoleItem[]>

export const listUsers = () => apiFetch("/api/users") as Promise<UserItem[]>

export const createUser = (data: {
  name: string
  email: string
  phone?: string
  roleSlugs: string[]
  password?: string
}) =>
  apiFetch("/api/users", { method: "POST", body: JSON.stringify(data) }) as Promise<{
    user: UserItem
    generatedPassword?: string
  }>

// El PATCH genérico solo mueve entre active/suspended — pending/rejected
// pasan exclusivamente por approveUser/rejectUser de abajo (disparan email y
// piden rol), nunca por acá.
export const updateUser = (
  id: string,
  data: Partial<{ name: string; phone: string | null; status: "active" | "suspended" }>,
) => apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<UserItem>

export const updateUserRoles = (id: string, roleSlugs: string[]) =>
  apiFetch(`/api/users/${id}/roles`, { method: "PATCH", body: JSON.stringify({ roleSlugs }) }) as Promise<UserItem>

// ── Fase K bloque A: aprobación de altas públicas (vidasolidariamdp.com) ──
export const approveUser = (id: string, roleSlugs: string[]) =>
  apiFetch(`/api/users/${id}/approve`, { method: "PATCH", body: JSON.stringify({ roleSlugs }) }) as Promise<{
    user: UserItem
    generatedPassword: string
  }>

export const rejectUser = (id: string) =>
  apiFetch(`/api/users/${id}/reject`, { method: "PATCH", body: "{}" }) as Promise<UserItem>
