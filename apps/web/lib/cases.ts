import { apiFetch, apiUpload } from "./api-client"

/**
 * Sube un archivo real a POST /api/uploads (multipart/form-data), igual
 * que en projects.ts — se repite acá para no acoplar el módulo de Casos
 * al de Proyectos. apiUpload reintenta sola tras un refresh si la sesión
 * venció a mitad de carga (ver lib/api-client.ts).
 */
export async function uploadCaseFile(file: File): Promise<{ fileUrl: string; fileName: string }> {
  const formData = new FormData()
  formData.append("file", file)
  return apiUpload("/api/uploads", formData)
}

export const CASE_TYPES = ["individual", "pareja", "grupo_familiar"] as const
export const STAY_TYPES = ["calle", "parador_temporal"] as const
export const VIABILITIES = ["alta", "media", "baja"] as const
export const FEASIBILITIES = ["factible", "no_factible", "en_pausa"] as const
export const CASE_STATUSES = ["activo", "en_seguimiento", "derivado", "cerrado"] as const
export const NEED_CATEGORIES = [
  "salud",
  "documentacion",
  "abrigo",
  "alimentacion",
  "vivienda",
  "laboral",
  "otro",
] as const
export const NEED_URGENCIES = ["inmediata", "urgente", "normal"] as const
export const CASE_ASSIGNMENT_ROLES = [
  "coordinador",
  "visitador_social",
  "psicologo",
  "seguimiento_laboral",
  "seguimiento_conducta",
] as const

export type CaseType = (typeof CASE_TYPES)[number]
export type StayType = (typeof STAY_TYPES)[number]
export type CaseViability = (typeof VIABILITIES)[number]
export type CaseFeasibility = (typeof FEASIBILITIES)[number]
export type CaseStatus = (typeof CASE_STATUSES)[number]
export type NeedCategory = (typeof NEED_CATEGORIES)[number]
export type NeedUrgency = (typeof NEED_URGENCIES)[number]
export type CaseAssignmentRole = (typeof CASE_ASSIGNMENT_ROLES)[number]

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  individual: "Persona sola",
  pareja: "Pareja",
  grupo_familiar: "Grupo familiar",
}

export const STAY_TYPE_LABEL: Record<StayType, string> = {
  calle: "En situación de calle",
  parador_temporal: "Parador / albergue temporal",
}

export const VIABILITY_LABEL: Record<CaseViability, string> = { alta: "Alta", media: "Media", baja: "Baja" }
export const FEASIBILITY_LABEL: Record<CaseFeasibility, string> = {
  factible: "Factible",
  no_factible: "No factible",
  en_pausa: "En pausa",
}
export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  activo: "Activo",
  en_seguimiento: "En seguimiento",
  derivado: "Derivado",
  cerrado: "Cerrado",
}
export const NEED_CATEGORY_LABEL: Record<NeedCategory, string> = {
  salud: "Salud",
  documentacion: "Documentación",
  abrigo: "Abrigo",
  alimentacion: "Alimentación",
  vivienda: "Vivienda",
  laboral: "Laboral",
  otro: "Otro",
}
export const NEED_URGENCY_LABEL: Record<NeedUrgency, string> = {
  inmediata: "Inmediata",
  urgente: "Urgente",
  normal: "Normal",
}
export const CASE_ASSIGNMENT_ROLE_LABEL: Record<CaseAssignmentRole, string> = {
  coordinador: "Coordinador/a",
  visitador_social: "Visitador/a social",
  psicologo: "Psicólogo/a",
  seguimiento_laboral: "Seguimiento laboral",
  seguimiento_conducta: "Seguimiento de conducta",
}

export interface BasicUser {
  id: string
  name: string
  email: string
}

export interface CaseListItem {
  id: string
  caseNumber: string
  fullName: string
  alias: string | null
  approxAge: number | null
  mainPhotoUrl: string | null
  status: CaseStatus
  caseType: CaseType
  viability: CaseViability | null
  feasibility: CaseFeasibility | null
  createdAt: string
  openNeedsCount: number
  memberCount: number
}

export interface CaseNeedItem {
  id: string
  category: NeedCategory
  urgency: NeedUrgency
  notes: string | null
  resolvedAt: string | null
  createdAt: string
}

export interface CaseSkillItem {
  id: string
  skillLabel: string
  level: string | null
}

export interface CaseContactItem {
  id: string
  notes: string
  moodObserved: string | null
  contactedAt: string
  user: BasicUser | null
}

export interface CaseLocationItem {
  id: string
  lat: number
  lng: number
  recordedAt: string
  recordedBy: BasicUser | null
}

export interface CasePhotoItem {
  id: string
  url: string
  takenAt: string
  uploadedBy: BasicUser | null
}

export interface CaseStatusHistoryItem {
  toStatus: CaseStatus
  fromStatus: CaseStatus | null
  changedAt: string
  changedBy: BasicUser | null
}

export interface CaseAssignmentItem {
  id: string
  user: BasicUser | null
  role: CaseAssignmentRole
  roleLabel: string
  assignedAt: string
  unassignedAt: string | null
}

/**
 * Integrante adicional de un caso "pareja" / "grupo_familiar" — el
 * referente del grupo vive en los campos de CaseDetail de arriba, el
 * resto de las personas del grupo son CaseMember, cada una con sus
 * propios datos, diagnóstico y necesidades/habilidades.
 */
export interface CaseMemberItem {
  id: string
  fullName: string
  alias: string | null
  approxAge: number | null
  dni: string | null
  sex: string | null
  healthStatus: string | null
  wantsToWork: boolean | null
  workAptitude: string | null
  legalSituation: string | null
  substanceUse: string | null
  createdAt: string
  needs: CaseNeedItem[]
  skills: CaseSkillItem[]
  photos: CasePhotoItem[]
}

export interface CaseDetail {
  id: string
  caseNumber: string
  fullName: string
  alias: string | null
  approxAge: number | null
  mainPhotoUrl: string | null
  healthStatus: string | null
  currentSleepSpot: string | null
  status: CaseStatus
  caseType: CaseType
  dni: string | null
  sex: string | null
  phone: string | null
  dayZone: string | null
  stayType: StayType | null
  wantsToWork: boolean | null
  workAptitude: string | null
  legalSituation: string | null
  substanceUse: string | null
  viability: CaseViability | null
  feasibility: CaseFeasibility | null
  closeReason: string | null
  createdAt: string
  createdBy: BasicUser | null
  updatedBy: BasicUser | null
  contactsHistory: CaseContactItem[]
  locations: CaseLocationItem[]
  photos: CasePhotoItem[]
  skills: CaseSkillItem[]
  needs: CaseNeedItem[]
  statusHistory: CaseStatusHistoryItem[]
  assignments: CaseAssignmentItem[]
  members: CaseMemberItem[]
}

export const listCases = (status?: CaseStatus) =>
  apiFetch(`/api/cases${status ? `?status=${status}` : ""}`) as Promise<CaseListItem[]>

export const getCase = (id: string) => apiFetch(`/api/cases/${id}`) as Promise<CaseDetail>

export interface CreateCaseInput {
  fullName: string
  alias?: string
  approxAge?: number
  caseType: CaseType
  dni?: string
  sex?: string
  phone?: string
  healthStatus?: string
  currentSleepSpot?: string
  dayZone?: string
  stayType?: StayType
  wantsToWork?: boolean
  workAptitude?: string
  legalSituation?: string
  substanceUse?: string
  mainPhotoUrl?: string
  location: { lat: number; lng: number }
  needs?: { category: NeedCategory; urgency: NeedUrgency; notes?: string }[]
  skills?: { skillLabel: string; level?: string }[]
  photoUrls?: string[]
  // Resto del grupo cuando caseType es "pareja" / "grupo_familiar".
  members?: CreateCaseMemberInput[]
}

export interface CreateCaseMemberInput {
  fullName: string
  alias?: string
  approxAge?: number
  dni?: string
  sex?: string
  healthStatus?: string
  wantsToWork?: boolean
  workAptitude?: string
  legalSituation?: string
  substanceUse?: string
  needs?: { category: NeedCategory; urgency: NeedUrgency; notes?: string }[]
  skills?: { skillLabel: string; level?: string }[]
  photoUrls?: string[]
}

export const createCase = (data: CreateCaseInput) =>
  apiFetch("/api/cases", { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const updateCase = (
  id: string,
  data: Partial<
    Omit<CreateCaseInput, "location" | "needs" | "skills" | "photoUrls" | "caseType"> & {
      caseType: CaseType
      viability: CaseViability | null
      feasibility: CaseFeasibility | null
    }
  >,
) => apiFetch(`/api/cases/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const changeCaseStatus = (id: string, status: CaseStatus, closeReason?: string) =>
  apiFetch(`/api/cases/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, closeReason }),
  }) as Promise<CaseDetail>

export const addCaseContact = (id: string, data: { notes: string; moodObserved?: string }) =>
  apiFetch(`/api/cases/${id}/contacts`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const addCaseLocation = (id: string, data: { lat: number; lng: number }) =>
  apiFetch(`/api/cases/${id}/locations`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const addCasePhoto = (id: string, url: string) =>
  apiFetch(`/api/cases/${id}/photos`, { method: "POST", body: JSON.stringify({ url }) }) as Promise<CaseDetail>

export const addCaseNeed = (id: string, data: { category: NeedCategory; urgency: NeedUrgency; notes?: string }) =>
  apiFetch(`/api/cases/${id}/needs`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const resolveCaseNeed = (id: string, needId: string, resolved: boolean) =>
  apiFetch(`/api/cases/${id}/needs/${needId}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved }),
  }) as Promise<CaseDetail>

export const addCaseSkill = (id: string, data: { skillLabel: string; level?: string }) =>
  apiFetch(`/api/cases/${id}/skills`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const deleteCaseSkill = (id: string, skillId: string) =>
  apiFetch(`/api/cases/${id}/skills/${skillId}`, { method: "DELETE" })

// ── Integrantes ──

export const addCaseMember = (id: string, data: CreateCaseMemberInput) =>
  apiFetch(`/api/cases/${id}/members`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const updateCaseMember = (
  id: string,
  memberId: string,
  data: Partial<Omit<CreateCaseMemberInput, "needs" | "skills">>,
) =>
  apiFetch(`/api/cases/${id}/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  }) as Promise<CaseDetail>

export const deleteCaseMember = (id: string, memberId: string) =>
  apiFetch(`/api/cases/${id}/members/${memberId}`, { method: "DELETE" }) as Promise<CaseDetail>

export const addCaseMemberNeed = (
  id: string,
  memberId: string,
  data: { category: NeedCategory; urgency: NeedUrgency; notes?: string },
) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/needs`, {
    method: "POST",
    body: JSON.stringify(data),
  }) as Promise<CaseDetail>

export const resolveCaseMemberNeed = (id: string, memberId: string, needId: string, resolved: boolean) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/needs/${needId}`, {
    method: "PATCH",
    body: JSON.stringify({ resolved }),
  }) as Promise<CaseDetail>

export const addCaseMemberSkill = (id: string, memberId: string, data: { skillLabel: string; level?: string }) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/skills`, {
    method: "POST",
    body: JSON.stringify(data),
  }) as Promise<CaseDetail>

export const deleteCaseMemberSkill = (id: string, memberId: string, skillId: string) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/skills/${skillId}`, { method: "DELETE" })

export const addCaseMemberPhoto = (id: string, memberId: string, url: string) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/photos`, {
    method: "POST",
    body: JSON.stringify({ url }),
  }) as Promise<CaseDetail>

export const deleteCaseMemberPhoto = (id: string, memberId: string, photoId: string) =>
  apiFetch(`/api/cases/${id}/members/${memberId}/photos/${photoId}`, { method: "DELETE" })

// ── Asignaciones de roles (bloque D) ──

export const assignCaseUser = (id: string, data: { userId: string; role: CaseAssignmentRole }) =>
  apiFetch(`/api/cases/${id}/assignments`, { method: "POST", body: JSON.stringify(data) }) as Promise<CaseDetail>

export const unassignCaseUser = (id: string, assignmentId: string) =>
  apiFetch(`/api/cases/${id}/assignments/${assignmentId}/unassign`, { method: "PATCH" }) as Promise<CaseDetail>
