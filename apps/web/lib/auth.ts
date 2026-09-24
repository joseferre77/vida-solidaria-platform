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

// Fase Q: autorregistro público desde /login (voluntarios y demás
// usuarios), con verificación de email antes de entrar a la cola de
// aprobación de la comisión — ver apps/api .../public/public.routes.ts,
// POST /public/register. No manda cookies de sesión (no hay sesión
// todavía) — por eso usa fetch directo en vez de rawFetch, aunque igual
// puede viajar con credentials "include" sin problema si algún día hace
// falta (CORS ya está configurado para el dominio de gestión).
export async function registerAccount(data: { name: string; email: string; password: string; phone: string }) {
  const res = await fetch(`${API_URL}/api/public/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "No se pudo completar el registro")
  }
  return res.json() as Promise<{ ok: true }>
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
