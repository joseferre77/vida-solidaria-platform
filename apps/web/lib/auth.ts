const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

export interface SessionUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  roles: string[]
  permissions: string[]
}

async function apiFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include", // manda/recibe las cookies httpOnly de sesión
    headers: { "Content-Type": "application/json", ...init?.headers },
  })
}

export async function login(email: string, password: string) {
  const res = await apiFetch("/api/auth/login", {
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
  await apiFetch("/api/auth/logout", { method: "POST" })
}

export async function fetchMe(): Promise<SessionUser | null> {
  const res = await apiFetch("/api/auth/me")
  if (!res.ok) return null
  return res.json()
}

export function hasPermission(user: SessionUser | null, permission: string) {
  if (!user) return false
  return user.permissions.includes("*") || user.permissions.includes(permission)
}
