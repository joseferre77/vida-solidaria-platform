import { apiFetch, apiUpload } from "./api-client"

export type UserStatus = "active" | "pending" | "rejected" | "suspended"

export const AVAILABLE_DAYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"] as const
export type AvailableDay = (typeof AVAILABLE_DAYS)[number]
export const AVAILABLE_DAY_LABEL: Record<AvailableDay, string> = {
  lun: "Lun",
  mar: "Mar",
  mie: "Mié",
  jue: "Jue",
  vie: "Vie",
  sab: "Sáb",
  dom: "Dom",
}

export interface RoleItem {
  slug: string
  label: string
  rank: number
}

// Fase L: perfil extendido de usuario — pedido de Josecito al notar que los
// 14 coordinadores reales del equipo no estaban dados de alta en el sistema
// (foto, domicilio, teléfonos, edad/sexo, habilidades, CV, disponibilidad).
// Todos los campos nuevos son opcionales: el alta rápida de siempre
// (nombre+email+rol) sigue andando igual.
export interface UserItem {
  id: string
  name: string
  email: string
  phone: string | null
  avatarUrl: string | null
  status: UserStatus
  volunteerMessage: string | null
  createdAt: string
  birthDate: string | null
  sex: string | null
  address: string | null
  phoneAlt: string | null
  skills: string | null
  cvUrl: string | null
  availableDays: AvailableDay[]
  availableHours: string | null
  roles: { slug: string; label: string }[]
}

export interface ProfileFields {
  birthDate?: string | null
  sex?: string | null
  address?: string | null
  phoneAlt?: string | null
  skills?: string | null
  cvUrl?: string | null
  avatarUrl?: string | null
  availableDays?: AvailableDay[]
  availableHours?: string | null
}

export const listRoles = () => apiFetch("/api/roles") as Promise<RoleItem[]>

export const listUsers = () => apiFetch("/api/users") as Promise<UserItem[]>

export const createUser = (
  data: {
    name: string
    email: string
    phone?: string
    roleSlugs: string[]
    password?: string
  } & ProfileFields,
) =>
  apiFetch("/api/users", { method: "POST", body: JSON.stringify(data) }) as Promise<{
    user: UserItem
    generatedPassword?: string
  }>

// El PATCH genérico solo mueve entre active/suspended — pending/rejected
// pasan exclusivamente por approveUser/rejectUser de abajo (disparan email y
// piden rol), nunca por acá.
export const updateUser = (
  id: string,
  data: Partial<{ name: string; phone: string | null; status: "active" | "suspended" }> & ProfileFields,
) => apiFetch(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<UserItem>

// Reutiliza el mismo endpoint genérico de subida de archivos (POST
// /api/uploads) que ya usaban Proyectos/Casos — acepta imágenes y
// documentos (PDF/DOC/DOCX), hasta 20MB. Sirve tanto para la foto de
// perfil (avatarUrl) como para el CV (cvUrl).
export const uploadProfileFile = async (file: File) => {
  const formData = new FormData()
  formData.append("file", file)
  return apiUpload("/api/uploads", formData) as Promise<{
    fileUrl: string
    fileName: string
    mimeType: string
    size: number
  }>
}

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
