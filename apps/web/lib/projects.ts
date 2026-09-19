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

export type ProjectStatus = "planning" | "active" | "paused" | "done"
export type TaskPriority = "baja" | "media" | "alta"
export type ProjectRole = "creador" | "editor" | "visor" | "admin"

export interface LabelItem {
  id: string
  name: string
  color: string
}

export interface ProjectListItem {
  id: string
  code: string
  name: string
  description: string | null
  area: string | null
  status: ProjectStatus
  priority: TaskPriority
  budget: string | number | null
  startDate: string | null
  endDate: string | null
  owner: { id: string; name: string }
  createdAt: string
  memberCount: number
  caseCount: number
  taskCount: number
  doneTaskCount: number
  progressPct: number
  overdueTaskCount: number
  labels: LabelItem[]
}

export interface BasicUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

export interface TaskItem {
  id: string
  boardColumnId: string
  title: string
  description: string | null
  priority: TaskPriority
  dueDate: string | null
  createdBy: string
  createdAt: string
  assignees: { userId: string; user: BasicUser }[]
  _count: { comments: number; attachments: number }
}

export interface BoardColumnItem {
  id: string
  boardId: string
  name: string
  sortOrder: number
  tasks: TaskItem[]
}

export interface ProjectDetail {
  id: string
  name: string
  description: string | null
  area: string | null
  status: ProjectStatus
  ownerId: string
  owner: { id: string; name: string }
  createdAt: string
  updatedAt: string
  members: { userId: string; projectRole: ProjectRole; user: BasicUser }[]
  boards: { id: string; name: string; columns: BoardColumnItem[] }[]
}

export interface DashboardSummary {
  activeProjects: number
  totalOpenTasks: number
  myTasks: number
  dueSoon: number
}

export const listProjects = () => apiFetch("/api/projects") as Promise<ProjectListItem[]>

export const createProject = (data: {
  name: string
  description?: string
  area?: string
  priority?: TaskPriority
  budget?: number
  startDate?: string
  endDate?: string
}) => apiFetch("/api/projects", { method: "POST", body: JSON.stringify(data) })

export const getProject = (id: string) => apiFetch(`/api/projects/${id}`) as Promise<ProjectDetail>

export const updateProject = (id: string, data: Partial<{ name: string; description: string; area: string; status: ProjectStatus }>) =>
  apiFetch(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const addProjectMember = (projectId: string, userId: string, projectRole: ProjectRole) =>
  apiFetch(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userId, projectRole }) })

export const removeProjectMember = (projectId: string, userId: string) =>
  apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" })

export const createTask = (data: {
  boardColumnId: string
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: string
}) => apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(data) })

export const updateTask = (
  id: string,
  data: Partial<{
    title: string
    description: string | null
    priority: TaskPriority
    dueDate: string | null
    boardColumnId: string
  }>,
) => apiFetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteTask = (id: string) => apiFetch(`/api/tasks/${id}`, { method: "DELETE" })

export const assignTask = (taskId: string, userId: string) =>
  apiFetch(`/api/tasks/${taskId}/assignees`, { method: "POST", body: JSON.stringify({ userId }) })

export const unassignTask = (taskId: string, userId: string) =>
  apiFetch(`/api/tasks/${taskId}/assignees/${userId}`, { method: "DELETE" })

export const addTaskComment = (taskId: string, body: string) =>
  apiFetch(`/api/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) })

export interface UploadedFile {
  fileUrl: string
  fileName: string
  mimeType: string
  size: number
}

/**
 * Sube un archivo real a POST /api/uploads (multipart/form-data). Aparte de
 * apiFetch porque esta ruta NO lleva Content-Type: application/json — el
 * browser arma el boundary del multipart solo si el header Content-Type no
 * se toca a mano. Devuelve { fileUrl, ... } listo para pasarle a
 * addProjectAttachment/addTaskAttachment (todavía por construir su UI).
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch(`${API_URL}/api/uploads`, {
    method: "POST",
    credentials: "include",
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  return res.json()
}

export const addProjectAttachment = (projectId: string, data: { fileUrl: string; fileName: string }) =>
  apiFetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: JSON.stringify(data) })

export const deleteProjectAttachment = (attachmentId: string) =>
  apiFetch(`/api/attachments/${attachmentId}`, { method: "DELETE" })

export const addTaskAttachment = (taskId: string, data: { fileUrl: string }) =>
  apiFetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: JSON.stringify(data) })

export const deleteTaskAttachment = (attachmentId: string) =>
  apiFetch(`/api/task-attachments/${attachmentId}`, { method: "DELETE" })

export const getDashboardSummary = () => apiFetch("/api/dashboard/summary") as Promise<DashboardSummary>

export const listBasicUsers = () => apiFetch("/api/users/basic") as Promise<BasicUser[]>
