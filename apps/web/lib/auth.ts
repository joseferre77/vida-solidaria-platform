import { API_URL, tryRefresh } from "./api-client"

export interface SessionUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  roles: string[]
  permissions: string[]
}

async function rawFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include", // manda/recibe las cookies httpOnly de sesión
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
}

export async function login(email: string, password: string) {
  const res = await rawFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "No se pudo iniciar sesión")
  }
  return res.json() as Promise<{ user: SessionUser }>
}

export async function logout() {
  await rawFetch("/api/auth/logout", { method: "POST" })
}

/**
 * Si el access token venció pero el refresh_token todavía sirve (dura 30
 * días), reintenta una vez tras refrescar en vez de devolver null de
 * una — evita mandar a alguien a /login solo porque volvió a la pestaña
 * después de más de 2h con la sesión igual vigente.
 */
export async function fetchMe(): Promise<SessionUser | null> {
  let res = await rawFetch("/api/auth/me")
  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) res = await rawFetch("/api/auth/me")
  }
  if (!res.ok) return null
  return res.json()
}

export function hasPermission(user: SessionUser | null, permission: string) {
  if (!user) return false
  return user.permissions.includes("*") || user.permissions.includes(permission)
}
