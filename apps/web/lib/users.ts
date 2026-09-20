const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

export type UserStatus = "active" | "suspended"

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

export const updateUser = (id: string, data: Partial<{ name: string; phone: string | null; status: UserStatus }>) =>
  apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<UserItem>

export const updateUserRoles = (id: string, roleSlugs: string[]) =>
  apiFetch(`/api/users/${id}/roles`, { method: "PATCH", body: JSON.stringify({ roleSlugs }) }) as Promise<UserItem>
