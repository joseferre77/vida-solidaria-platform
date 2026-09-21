import { hasPermission, type SessionUser } from "./auth"
import { apiFetch, apiUpload } from "./api-client"

// ────────────────────────────────────────────────
// Tipos base
// ────────────────────────────────────────────────

export type ProjectStatus = "planning" | "active" | "paused" | "done"
export type TaskPriority = "baja" | "media" | "alta"
export type ProjectRole = "creador" | "editor" | "visor" | "admin"
export type MilestoneStatus = "pendiente" | "completado"
export type ReminderEntity = "PROJECT" | "TASK"
export type CustomFieldEntity = "PROJECT" | "CASE"
export type CustomFieldType = "TEXT" | "TEXTAREA" | "NUMBER" | "DATE" | "BOOLEAN" | "SELECT" | "MULTI_SELECT"
export type SurveyEntity = "PROJECT" | "CASE" | "STANDALONE"
export type SurveyQuestionType = "TEXT" | "NUMBER" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "SCALE" | "BOOLEAN" | "DATE"

export interface LabelItem {
  id: string
  name: string
  color: string
}

export interface BasicUser {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
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

export interface TaskItem {
  id: string
  boardColumnId: string
  processId?: string | null
  process?: ProcessItem | null
  title: string
  description: string | null
  priority: TaskPriority
  startDate?: string | null
  dueDate: string | null
  estimatedMinutes?: number | null
  createdBy: string
  createdAt: string
  labels?: { label: LabelItem }[]
  assignees: { userId: string; user: BasicUser }[]
  _count: { comments: number; attachments: number; checklist?: number }
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
  code: string
  name: string
  description: string | null
  area: string | null
  status: ProjectStatus
  priority: TaskPriority
  budget: string | number | null
  startDate: string | null
  endDate: string | null
  ownerId: string
  owner: { id: string; name: string }
  createdAt: string
  updatedAt: string
  members: { userId: string; projectRole: ProjectRole; user: BasicUser }[]
  labels: { label: LabelItem }[]
  boards: { id: string; name: string; columns: BoardColumnItem[] }[]
  _count: { cases: number; milestones: number; attachments: number; notes: number }
  expensesTotal: string | number
  expensesTaxTotal: string | number
  timeTrackedMinutes: number
}

export interface MilestoneItem {
  id: string
  projectId: string
  title: string
  description: string | null
  dueDate: string | null
  status: MilestoneStatus
  completedAt: string | null
  createdAt: string
}

export interface ProcessItem {
  id: string
  projectId: string
  name: string
  color: string | null
  sortOrder: number
  createdAt: string
  _count?: { tasks: number }
}

export interface PlanTask {
  id: string
  title: string
  startDate: string | null
  dueDate: string | null
  priority: TaskPriority
  boardColumn: { name: string }
}

export interface ProjectPlan {
  processes: (ProcessItem & { tasks: PlanTask[] })[]
  sinProceso: PlanTask[]
}

export interface ProjectAttachmentItem {
  id: string
  projectId: string
  fileUrl: string
  fileName: string
  uploadedBy: string
  createdAt: string
}

export interface TaskAttachmentItem {
  id: string
  taskId: string
  fileUrl: string
  uploadedBy: string
  createdAt: string
}

export interface ProjectNoteItem {
  id: string
  projectId: string
  authorId: string
  content: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
  author: BasicUser
}

export interface ReminderItem {
  id: string
  entity: ReminderEntity
  entityId: string
  title: string
  remindAt: string
  isDone: boolean
  notifiedAt: string | null
  createdBy: string
  createdAt: string
}

export interface ProjectSettingsItem {
  projectId: string
  membersCanTrackTime: boolean
  membersCanLogExpenses: boolean
  taskApprovalRequired: boolean
  isArchived: boolean
  extra: unknown
}

export interface TimeEntryItem {
  id: string
  taskId: string
  userId: string
  note: string | null
  startedAt: string
  endedAt: string | null
  user?: BasicUser
  task?: { id: string; title: string }
}

export interface ExpenseItem {
  id: string
  projectId: string
  caseId: string | null
  memberId: string
  category: string
  title: string
  description: string | null
  amount: string | number
  taxAmount: string | number
  expenseDate: string
  createdBy: string
  createdAt: string
  member: { id: string; name: string }
  case: { id: string; caseNumber: string; fullName: string } | null
}

export interface CustomFieldDefinitionItem {
  id: string
  entity: CustomFieldEntity
  label: string
  fieldType: CustomFieldType
  options: string[]
  required: boolean
  sortOrder: number
  showInTable: boolean
  filterable: boolean
}

export interface CustomFieldValueEntry {
  definition: CustomFieldDefinitionItem
  value: unknown
}

export interface SurveyItem {
  id: string
  title: string
  description: string | null
  entity: SurveyEntity
  entityId: string | null
  createdBy: string
  isActive: boolean
  createdAt: string
  _count?: { questions: number; responses: number }
}

export interface SurveyQuestionItem {
  id: string
  surveyId: string
  label: string
  type: SurveyQuestionType
  options: string[]
  required: boolean
  sortOrder: number
}

export interface SurveyDetail extends SurveyItem {
  questions: SurveyQuestionItem[]
}

export interface SurveyResponseItem {
  id: string
  surveyId: string
  respondentUserId: string
  submittedAt: string
  user?: { id: string; name: string }
  answers: { id: string; questionId: string; value: unknown; question?: { id: string; label: string } }[]
}

export interface ChecklistItemType {
  id: string
  taskId: string
  title: string
  isChecked: boolean
  sortOrder: number
}

export interface CommentItem {
  id: string
  taskId: string
  userId: string
  body: string
  createdAt: string
  user: BasicUser
}

export interface DependencyLink {
  id: string
  blockerTaskId: string
  blockedTaskId: string
  blockedTask?: { id: string; title: string }
  blockerTask?: { id: string; title: string }
}

export interface ProjectCommentFeedItem extends CommentItem {
  task: { id: string; title: string }
}

/** Detalle completo de tarea para el modal (Fase F). */
export interface TaskDetail {
  id: string
  boardColumnId: string
  boardColumn: { id: string; name: string; board: { projectId: string } }
  processId: string | null
  process: ProcessItem | null
  title: string
  description: string | null
  priority: TaskPriority
  startDate: string | null
  dueDate: string | null
  estimatedMinutes: number | null
  createdBy: string
  createdAt: string
  labels: { label: LabelItem }[]
  assignees: { userId: string; user: BasicUser }[]
  checklist: ChecklistItemType[]
  comments: CommentItem[]
  attachments: TaskAttachmentItem[]
  blockerOf: DependencyLink[]
  blockedBy: DependencyLink[]
  timeTrackedMinutes: number
}

export interface AuditLogItem {
  id: string
  userId: string
  entityType: string
  entityId: string
  action: string
  diff: unknown
  createdAt: string
  user: { id: string; name: string } | null
}

export interface DashboardSummary {
  /** true cuando los números de abajo están recortados a los proyectos del usuario (no tiene el permiso global de dirección). */
  scopedToOwnProjects: boolean
  activeProjects: number
  totalOpenTasks: number
  myTasks: number
  dueSoon: number
  teamMembersCount: number
  tasksByStatus: Record<string, number>
  upcomingMilestones: (MilestoneItem & { project: { id: string; name: string; code: string } })[]
  runningTimer: (TimeEntryItem & { task: { id: string; title: string } }) | null
  recentActivity: AuditLogItem[]
  financeOverview: { incomeTotal: number; expenseTotal: number; months: { key: string; label: string; income: number; expense: number }[] } | null
}

// ────────────────────────────────────────────────
// Autorización efectiva en el cliente (mismo criterio que project-access.ts
// en el backend): permiso GLOBAL de módulo, o rol de membresía en ESE
// proyecto puntual. Antes de esto varias pantallas chequeaban solo el
// permiso global y dejaban afuera a un editor/creador sin ese permiso.
// ────────────────────────────────────────────────

const WRITE_ROLES: ProjectRole[] = ["creador", "editor", "admin"]

export function getProjectAccess(
  user: SessionUser | null | undefined,
  project: { members: { userId: string; projectRole: ProjectRole }[] } | null | undefined,
) {
  if (!user) return { canRead: false, canWrite: false, canAdmin: false }
  const globalAdmin = hasPermission(user, "projects.admin")
  const globalWrite = hasPermission(user, "projects.write")
  const globalRead = hasPermission(user, "projects.read")
  const membership = project?.members.find((m) => m.userId === user.id)
  const canAdmin = globalAdmin || membership?.projectRole === "admin"
  const canWrite = globalAdmin || globalWrite || (membership ? WRITE_ROLES.includes(membership.projectRole) : false)
  const canRead = canWrite || globalRead || !!membership
  return { canRead, canWrite, canAdmin }
}

// ────────────────────────────────────────────────
// Proyectos
// ────────────────────────────────────────────────

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

export const updateProject = (
  id: string,
  data: Partial<{
    name: string
    description: string
    area: string
    status: ProjectStatus
    priority: TaskPriority
    budget: number | null
    startDate: string | null
    endDate: string | null
  }>,
) => apiFetch(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteProject = (id: string) => apiFetch(`/api/projects/${id}`, { method: "DELETE" })

export const addProjectMember = (projectId: string, userId: string, projectRole: ProjectRole) =>
  apiFetch(`/api/projects/${projectId}/members`, { method: "POST", body: JSON.stringify({ userId, projectRole }) })

export const removeProjectMember = (projectId: string, userId: string) =>
  apiFetch(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Hitos
// ────────────────────────────────────────────────

export const listMilestones = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/milestones`) as Promise<MilestoneItem[]>

export const createMilestone = (projectId: string, data: { title: string; description?: string; dueDate?: string }) =>
  apiFetch(`/api/projects/${projectId}/milestones`, { method: "POST", body: JSON.stringify(data) })

export const updateMilestone = (
  id: string,
  data: Partial<{ title: string; description: string | null; dueDate: string | null; status: MilestoneStatus }>,
) => apiFetch(`/api/milestones/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteMilestone = (id: string) => apiFetch(`/api/milestones/${id}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Procesos + Plan
// ────────────────────────────────────────────────

export const listProcesses = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/processes`) as Promise<ProcessItem[]>

export const createProcess = (projectId: string, data: { name: string; color?: string; sortOrder?: number }) =>
  apiFetch(`/api/projects/${projectId}/processes`, { method: "POST", body: JSON.stringify(data) })

export const updateProcess = (id: string, data: Partial<{ name: string; color: string; sortOrder: number }>) =>
  apiFetch(`/api/processes/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteProcess = (id: string) => apiFetch(`/api/processes/${id}`, { method: "DELETE" })

export const getProjectPlan = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/plan`) as Promise<ProjectPlan>

// ────────────────────────────────────────────────
// Archivos (proyecto y tarea)
// ────────────────────────────────────────────────

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
 * se toca a mano. Devuelve { fileUrl, ... } listo para addProjectAttachment
 * / addTaskAttachment.
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData()
  formData.append("file", file)
  return apiUpload("/api/uploads", formData)
}

export const listProjectAttachments = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/attachments`) as Promise<ProjectAttachmentItem[]>

export const addProjectAttachment = (projectId: string, data: { fileUrl: string; fileName: string }) =>
  apiFetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: JSON.stringify(data) })

export const deleteProjectAttachment = (attachmentId: string) =>
  apiFetch(`/api/attachments/${attachmentId}`, { method: "DELETE" })

export const addTaskAttachment = (taskId: string, data: { fileUrl: string }) =>
  apiFetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: JSON.stringify(data) })

export const deleteTaskAttachment = (attachmentId: string) =>
  apiFetch(`/api/task-attachments/${attachmentId}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Etiquetas
// ────────────────────────────────────────────────

export const listLabels = () => apiFetch("/api/labels") as Promise<LabelItem[]>

export const createLabel = (data: { name: string; color?: string }) =>
  apiFetch("/api/labels", { method: "POST", body: JSON.stringify(data) })

export const updateLabel = (id: string, data: Partial<{ name: string; color: string }>) =>
  apiFetch(`/api/labels/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteLabel = (id: string) => apiFetch(`/api/labels/${id}`, { method: "DELETE" })

export const attachProjectLabel = (projectId: string, labelId: string) =>
  apiFetch(`/api/projects/${projectId}/labels`, { method: "POST", body: JSON.stringify({ labelId }) })

export const detachProjectLabel = (projectId: string, labelId: string) =>
  apiFetch(`/api/projects/${projectId}/labels/${labelId}`, { method: "DELETE" })

export const attachTaskLabel = (taskId: string, labelId: string) =>
  apiFetch(`/api/tasks/${taskId}/labels`, { method: "POST", body: JSON.stringify({ labelId }) })

export const detachTaskLabel = (taskId: string, labelId: string) =>
  apiFetch(`/api/tasks/${taskId}/labels/${labelId}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Tareas
// ────────────────────────────────────────────────

export const listProjectTasks = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/tasks`) as Promise<TaskItem[]>

export const createTask = (data: {
  boardColumnId: string
  processId?: string
  title: string
  description?: string
  priority?: TaskPriority
  startDate?: string
  dueDate?: string
  estimatedMinutes?: number
}) => apiFetch("/api/tasks", { method: "POST", body: JSON.stringify(data) })

export const getTaskDetail = (id: string) => apiFetch(`/api/tasks/${id}`) as Promise<TaskDetail>

export const updateTask = (
  id: string,
  data: Partial<{
    title: string
    description: string | null
    priority: TaskPriority
    startDate: string | null
    dueDate: string | null
    estimatedMinutes: number | null
    boardColumnId: string
    processId: string | null
  }>,
) => apiFetch(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteTask = (id: string) => apiFetch(`/api/tasks/${id}`, { method: "DELETE" })

export const assignTask = (taskId: string, userId: string) =>
  apiFetch(`/api/tasks/${taskId}/assignees`, { method: "POST", body: JSON.stringify({ userId }) })

export const unassignTask = (taskId: string, userId: string) =>
  apiFetch(`/api/tasks/${taskId}/assignees/${userId}`, { method: "DELETE" })

export const addTaskComment = (taskId: string, body: string) =>
  apiFetch(`/api/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ body }) })

export const listProjectComments = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/comments`) as Promise<ProjectCommentFeedItem[]>

// ── Checklist ──

export const addChecklistItem = (taskId: string, title: string) =>
  apiFetch(`/api/tasks/${taskId}/checklist`, { method: "POST", body: JSON.stringify({ title }) })

export const updateChecklistItem = (
  itemId: string,
  data: Partial<{ title: string; isChecked: boolean; sortOrder: number }>,
) => apiFetch(`/api/checklist/${itemId}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteChecklistItem = (itemId: string) => apiFetch(`/api/checklist/${itemId}`, { method: "DELETE" })

// ── Dependencias ──

export const addTaskDependency = (blockerTaskId: string, blockedTaskId: string) =>
  apiFetch(`/api/tasks/${blockerTaskId}/dependencies`, { method: "POST", body: JSON.stringify({ blockedTaskId }) })

export const removeTaskDependency = (depId: string) => apiFetch(`/api/dependencies/${depId}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Cronómetro / Hoja de Tiempo
// ────────────────────────────────────────────────

export const getRunningTimer = () =>
  apiFetch("/api/timer/running") as Promise<(TimeEntryItem & { task: { id: string; title: string } }) | null>

export const startTimer = (taskId: string, note?: string) =>
  apiFetch(`/api/tasks/${taskId}/timer/start`, { method: "POST", body: JSON.stringify({ note }) })

export const stopTimer = (entryId: string) => apiFetch(`/api/timer/${entryId}/stop`, { method: "POST" })

export const listTaskTimeEntries = (taskId: string) =>
  apiFetch(`/api/tasks/${taskId}/time-entries`) as Promise<TimeEntryItem[]>

export const listProjectTimeEntries = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/time-entries`) as Promise<TimeEntryItem[]>

// ────────────────────────────────────────────────
// Campos personalizados
// ────────────────────────────────────────────────

export const listCustomFieldDefinitions = (entity: CustomFieldEntity) =>
  apiFetch(`/api/custom-fields?entity=${entity}`) as Promise<CustomFieldDefinitionItem[]>

export const createCustomFieldDefinition = (data: {
  entity: CustomFieldEntity
  label: string
  fieldType: CustomFieldType
  options?: string[]
  required?: boolean
  sortOrder?: number
  showInTable?: boolean
  filterable?: boolean
}) => apiFetch("/api/custom-fields", { method: "POST", body: JSON.stringify(data) })

export const updateCustomFieldDefinition = (
  id: string,
  data: Partial<{
    label: string
    fieldType: CustomFieldType
    options: string[]
    required: boolean
    sortOrder: number
    showInTable: boolean
    filterable: boolean
  }>,
) => apiFetch(`/api/custom-fields/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteCustomFieldDefinition = (id: string) => apiFetch(`/api/custom-fields/${id}`, { method: "DELETE" })

export const getCustomFieldValues = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/custom-field-values`) as Promise<CustomFieldValueEntry[]>

export const setCustomFieldValue = (defId: string, entityId: string, value: unknown) =>
  apiFetch(`/api/custom-fields/${defId}/values/${entityId}`, { method: "PUT", body: JSON.stringify({ value }) })

// ────────────────────────────────────────────────
// Encuestas
// ────────────────────────────────────────────────

export const listSurveys = (filter?: { entity: SurveyEntity; entityId?: string }) => {
  const qs = filter ? `?entity=${filter.entity}${filter.entityId ? `&entityId=${filter.entityId}` : ""}` : ""
  return apiFetch(`/api/surveys${qs}`) as Promise<SurveyItem[]>
}

export const createSurvey = (data: { title: string; description?: string; entity?: SurveyEntity; entityId?: string }) =>
  apiFetch("/api/surveys", { method: "POST", body: JSON.stringify(data) })

export const getSurveyDetail = (id: string) => apiFetch(`/api/surveys/${id}`) as Promise<SurveyDetail>

export const deleteSurvey = (id: string) => apiFetch(`/api/surveys/${id}`, { method: "DELETE" })

export const addSurveyQuestion = (
  surveyId: string,
  data: { label: string; type: SurveyQuestionType; options?: string[]; required?: boolean; sortOrder?: number },
) => apiFetch(`/api/surveys/${surveyId}/questions`, { method: "POST", body: JSON.stringify(data) })

export const deleteSurveyQuestion = (questionId: string) =>
  apiFetch(`/api/survey-questions/${questionId}`, { method: "DELETE" })

export const submitSurveyResponse = (surveyId: string, answers: { questionId: string; value: unknown }[]) =>
  apiFetch(`/api/surveys/${surveyId}/responses`, { method: "POST", body: JSON.stringify({ answers }) })

export const listSurveyResponses = (surveyId: string) =>
  apiFetch(`/api/surveys/${surveyId}/responses`) as Promise<SurveyResponseItem[]>

// ────────────────────────────────────────────────
// Gastos
// ────────────────────────────────────────────────

export const listProjectExpenses = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/expenses`) as Promise<ExpenseItem[]>

export const createProjectExpense = (
  projectId: string,
  data: {
    caseId?: string
    memberId: string
    category: string
    title: string
    description?: string
    amount: number
    taxAmount?: number
    expenseDate: string
  },
) => apiFetch(`/api/projects/${projectId}/expenses`, { method: "POST", body: JSON.stringify(data) })

export const updateProjectExpense = (
  id: string,
  data: Partial<{
    caseId: string | null
    category: string
    title: string
    description: string | null
    amount: number
    taxAmount: number
    expenseDate: string
  }>,
) => apiFetch(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteProjectExpense = (id: string) => apiFetch(`/api/expenses/${id}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Notas
// ────────────────────────────────────────────────

export const listProjectNotes = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/notes`) as Promise<ProjectNoteItem[]>

export const createProjectNote = (projectId: string, data: { content: string; isPinned?: boolean }) =>
  apiFetch(`/api/projects/${projectId}/notes`, { method: "POST", body: JSON.stringify(data) })

export const updateProjectNote = (id: string, data: Partial<{ content: string; isPinned: boolean }>) =>
  apiFetch(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) })

export const deleteProjectNote = (id: string) => apiFetch(`/api/notes/${id}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Recordatorios
// ────────────────────────────────────────────────

export const listReminders = (entity: ReminderEntity, entityId: string) =>
  apiFetch(`/api/reminders?entity=${entity}&entityId=${entityId}`) as Promise<ReminderItem[]>

export const createReminder = (data: { entity: ReminderEntity; entityId: string; title: string; remindAt: string }) =>
  apiFetch("/api/reminders", { method: "POST", body: JSON.stringify(data) })

export const markReminderDone = (id: string) => apiFetch(`/api/reminders/${id}/done`, { method: "POST" })

export const deleteReminder = (id: string) => apiFetch(`/api/reminders/${id}`, { method: "DELETE" })

// ────────────────────────────────────────────────
// Configuración de proyecto
// ────────────────────────────────────────────────

export const getProjectSettings = (projectId: string) =>
  apiFetch(`/api/projects/${projectId}/settings`) as Promise<ProjectSettingsItem>

export const updateProjectSettings = (
  projectId: string,
  data: Partial<{
    membersCanTrackTime: boolean
    membersCanLogExpenses: boolean
    taskApprovalRequired: boolean
    isArchived: boolean
    extra: unknown
  }>,
) => apiFetch(`/api/projects/${projectId}/settings`, { method: "PATCH", body: JSON.stringify(data) })

// ────────────────────────────────────────────────
// Dashboard y usuarios
// ────────────────────────────────────────────────

export const getDashboardSummary = () => apiFetch("/api/dashboard/summary") as Promise<DashboardSummary>

export const listBasicUsers = () => apiFetch("/api/users/basic") as Promise<BasicUser[]>
