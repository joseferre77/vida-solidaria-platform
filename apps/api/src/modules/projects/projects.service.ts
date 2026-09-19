/**
 * Módulo 2 — Gestión de Proyectos (versión ampliada).
 * Capa de servicio: toda la lógica de negocio vive acá, las rutas
 * (projects.routes.ts) solo validan input y traducen a HTTP.
 *
 * Subsistemas cubiertos, cada uno mapeado a una pestaña de la UI de
 * proyecto (ver DESIGN_PROYECTOS.md): Vista General, Lista de Tareas,
 * Tareas Kanban, Procesos, Plan, Notas, Archivos, Comentarios, Hoja de
 * Tiempo (cronómetro) y Gastos. Además: hitos, dependencias entre tareas,
 * checklist, etiquetas, campos personalizados, encuestas y recordatorios.
 */
import { prisma } from "../../lib/prisma"
import type {
  CustomFieldEntity,
  CustomFieldType,
  MilestoneStatus,
  ProjectRole,
  ProjectStatus,
  ReminderEntity,
  SurveyEntity,
  SurveyQuestionType,
  TaskPriority,
} from "@prisma/client"

const DEFAULT_COLUMNS = ["Backlog", "En curso", "Bloqueado", "Hecho"]
const DONE_COLUMN_NAME = "Hecho"

/** Error de negocio (no de validación) — la ruta lo traduce a 409/422. */
export class BusinessRuleError extends Error {}

// ────────────────────────────────────────────────
// Contador atómico → código de proyecto (PROY-0001, PROY-0002, ...)
// ────────────────────────────────────────────────
async function nextProjectCode(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { name: "project_code" },
    create: { name: "project_code", value: 1 },
    update: { value: { increment: 1 } },
  })
  return `PROY-${String(counter.value).padStart(4, "0")}`
}

// ────────────────────────────────────────────────
// Proyectos — CRUD + listado para la tabla
// ────────────────────────────────────────────────

export async function listProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      members: { select: { userId: true } },
      labels: { include: { label: true } },
      _count: { select: { cases: true } },
      boards: {
        select: {
          columns: {
            select: {
              name: true,
              tasks: { select: { id: true, priority: true, dueDate: true } },
            },
          },
        },
      },
      owner: { select: { id: true, name: true } },
    },
  })

  return projects.map((p) => {
    const allTasks = p.boards.flatMap((b) => b.columns.flatMap((c) => c.tasks))
    const doneTasks = p.boards.flatMap((b) =>
      b.columns.filter((c) => c.name === DONE_COLUMN_NAME).flatMap((c) => c.tasks),
    )
    const now = new Date()
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      area: p.area,
      status: p.status,
      priority: p.priority,
      budget: p.budget,
      startDate: p.startDate,
      endDate: p.endDate,
      owner: p.owner,
      createdAt: p.createdAt,
      memberCount: p.members.length,
      caseCount: p._count.cases,
      taskCount: allTasks.length,
      doneTaskCount: doneTasks.length,
      progressPct: allTasks.length ? Math.round((doneTasks.length / allTasks.length) * 100) : 0,
      overdueTaskCount: allTasks.filter((t) => t.dueDate && t.dueDate < now).length,
      labels: p.labels.map((pl) => pl.label),
    }
  })
}

export async function createProject(input: {
  name: string
  description?: string
  area?: string
  priority?: TaskPriority
  budget?: number
  startDate?: Date
  endDate?: Date
  ownerId: string
}) {
  const code = await nextProjectCode()
  return prisma.project.create({
    data: {
      code,
      name: input.name,
      description: input.description,
      area: input.area,
      priority: input.priority ?? "media",
      budget: input.budget,
      startDate: input.startDate,
      endDate: input.endDate,
      ownerId: input.ownerId,
      members: {
        create: [{ userId: input.ownerId, projectRole: "creador" as ProjectRole }],
      },
      boards: {
        create: [
          {
            name: "Tablero principal",
            columns: {
              create: DEFAULT_COLUMNS.map((name, i) => ({ name, sortOrder: i })),
            },
          },
        ],
      },
      settings: { create: {} },
    },
    include: { boards: { include: { columns: true } }, members: true, settings: true },
  })
}

/** Vista General: metadatos del proyecto + tablero (para Kanban) + contadores. */
export async function getProjectDetail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      labels: { include: { label: true } },
      boards: {
        include: {
          columns: {
            orderBy: { sortOrder: "asc" },
            include: {
              tasks: {
                orderBy: { createdAt: "asc" },
                include: {
                  process: true,
                  labels: { include: { label: true } },
                  assignees: {
                    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                  },
                  _count: { select: { comments: true, attachments: true, checklist: true } },
                },
              },
            },
          },
        },
      },
      _count: { select: { cases: true, milestones: true, attachments: true, notes: true } },
    },
  })
  if (!project) return null

  const [expensesTotal, timeTotalMinutes] = await Promise.all([
    prisma.projectExpense.aggregate({ where: { projectId }, _sum: { amount: true, taxAmount: true } }),
    sumProjectTimeMinutes(projectId),
  ])

  return {
    ...project,
    expensesTotal: expensesTotal._sum.amount ?? 0,
    expensesTaxTotal: expensesTotal._sum.taxAmount ?? 0,
    timeTrackedMinutes: timeTotalMinutes,
  }
}

export async function updateProject(
  projectId: string,
  input: Partial<{
    name: string
    description: string
    area: string
    status: ProjectStatus
    priority: TaskPriority
    budget: number | null
    startDate: Date | null
    endDate: Date | null
  }>,
) {
  return prisma.project.update({ where: { id: projectId }, data: input })
}

export async function deleteProject(projectId: string) {
  await prisma.project.delete({ where: { id: projectId } })
}

export async function addProjectMember(projectId: string, userId: string, projectRole: ProjectRole) {
  return prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, projectRole },
    update: { projectRole },
  })
}

export async function removeProjectMember(projectId: string, userId: string) {
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })
}

// ────────────────────────────────────────────────
// Proyecto ↔ Caso (muchos a muchos)
// ────────────────────────────────────────────────

export async function listProjectCases(projectId: string) {
  return prisma.projectCase.findMany({
    where: { projectId },
    include: { case: { select: { id: true, caseNumber: true, fullName: true, status: true } } },
    orderBy: { linkedAt: "desc" },
  })
}

export async function linkCase(projectId: string, caseId: string, linkedBy: string) {
  return prisma.projectCase.upsert({
    where: { projectId_caseId: { projectId, caseId } },
    create: { projectId, caseId, linkedBy },
    update: {},
  })
}

export async function unlinkCase(projectId: string, caseId: string) {
  await prisma.projectCase.delete({ where: { projectId_caseId: { projectId, caseId } } })
}

// ────────────────────────────────────────────────
// Hitos (Milestones)
// ────────────────────────────────────────────────

export async function listMilestones(projectId: string) {
  return prisma.projectMilestone.findMany({ where: { projectId }, orderBy: { dueDate: "asc" } })
}

export async function createMilestone(
  projectId: string,
  input: { title: string; description?: string; dueDate?: Date },
) {
  return prisma.projectMilestone.create({ data: { projectId, ...input } })
}

export async function updateMilestone(
  id: string,
  input: Partial<{ title: string; description: string | null; dueDate: Date | null; status: MilestoneStatus }>,
) {
  const data = { ...input } as typeof input & { completedAt?: Date | null }
  if (input.status === "completado") data.completedAt = new Date()
  if (input.status === "pendiente") data.completedAt = null
  return prisma.projectMilestone.update({ where: { id }, data })
}

export async function deleteMilestone(id: string) {
  await prisma.projectMilestone.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Procesos (agrupador de tareas por etapa — Kanban filter + eje del Plan)
// ────────────────────────────────────────────────

export async function listProcesses(projectId: string) {
  return prisma.projectProcess.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { tasks: true } } },
  })
}

export async function createProcess(projectId: string, input: { name: string; color?: string; sortOrder?: number }) {
  return prisma.projectProcess.create({ data: { projectId, ...input } })
}

export async function updateProcess(id: string, input: Partial<{ name: string; color: string; sortOrder: number }>) {
  return prisma.projectProcess.update({ where: { id }, data: input })
}

export async function deleteProcess(id: string) {
  await prisma.projectProcess.delete({ where: { id } })
}

/** Vista "Plan" (Gantt agrupado por Proceso): tareas del proyecto con fechas. */
export async function getProjectPlan(projectId: string) {
  const processes = await prisma.projectProcess.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      tasks: {
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          title: true,
          startDate: true,
          dueDate: true,
          priority: true,
          boardColumn: { select: { name: true } },
        },
      },
    },
  })
  const sinProceso = await prisma.task.findMany({
    where: { processId: null, boardColumn: { board: { projectId } } },
    select: {
      id: true,
      title: true,
      startDate: true,
      dueDate: true,
      priority: true,
      boardColumn: { select: { name: true } },
    },
  })
  return { processes, sinProceso }
}

// ────────────────────────────────────────────────
// Archivos de proyecto
// ────────────────────────────────────────────────

export async function listProjectAttachments(projectId: string) {
  return prisma.projectAttachment.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } })
}

export async function addProjectAttachment(
  projectId: string,
  input: { fileUrl: string; fileName: string; uploadedBy: string },
) {
  return prisma.projectAttachment.create({ data: { projectId, ...input } })
}

export async function deleteProjectAttachment(id: string) {
  await prisma.projectAttachment.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Etiquetas (catálogo global + asignación a proyecto/tarea)
// ────────────────────────────────────────────────

export async function listLabels() {
  return prisma.label.findMany({ orderBy: { name: "asc" } })
}

export async function createLabel(input: { name: string; color?: string }) {
  return prisma.label.create({ data: input })
}

export async function updateLabel(id: string, input: Partial<{ name: string; color: string }>) {
  return prisma.label.update({ where: { id }, data: input })
}

export async function deleteLabel(id: string) {
  await prisma.label.delete({ where: { id } })
}

export async function attachProjectLabel(projectId: string, labelId: string) {
  return prisma.projectLabel.upsert({
    where: { projectId_labelId: { projectId, labelId } },
    create: { projectId, labelId },
    update: {},
  })
}

export async function detachProjectLabel(projectId: string, labelId: string) {
  await prisma.projectLabel.delete({ where: { projectId_labelId: { projectId, labelId } } })
}

export async function attachTaskLabel(taskId: string, labelId: string) {
  return prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    create: { taskId, labelId },
    update: {},
  })
}

export async function detachTaskLabel(taskId: string, labelId: string) {
  await prisma.taskLabel.delete({ where: { taskId_labelId: { taskId, labelId } } })
}

// ────────────────────────────────────────────────
// Tareas
// ────────────────────────────────────────────────

export async function listProjectTasks(projectId: string) {
  return prisma.task.findMany({
    where: { boardColumn: { board: { projectId } } },
    orderBy: { createdAt: "desc" },
    include: {
      boardColumn: { select: { id: true, name: true } },
      process: true,
      labels: { include: { label: true } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      _count: { select: { comments: true, attachments: true, checklist: true } },
    },
  })
}

export async function createTask(input: {
  boardColumnId: string
  processId?: string
  title: string
  description?: string
  priority?: TaskPriority
  startDate?: Date
  dueDate?: Date
  estimatedMinutes?: number
  createdBy: string
}) {
  return prisma.task.create({
    data: {
      boardColumnId: input.boardColumnId,
      processId: input.processId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "media",
      startDate: input.startDate,
      dueDate: input.dueDate,
      estimatedMinutes: input.estimatedMinutes,
      createdBy: input.createdBy,
    },
  })
}

/** Detalle completo de una tarea para el modal (metadata + checklist + subtareas/deps + tiempo). */
export async function getTaskDetail(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      boardColumn: { include: { board: { select: { projectId: true } } } },
      process: true,
      labels: { include: { label: true } },
      assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
      checklist: { orderBy: { sortOrder: "asc" } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      },
      attachments: true,
      blockerOf: { include: { blockedTask: { select: { id: true, title: true } } } },
      blockedBy: { include: { blockerTask: { select: { id: true, title: true } } } },
    },
  })
  if (!task) return null
  const timeTrackedMinutes = await sumTaskTimeMinutes(taskId)
  return { ...task, timeTrackedMinutes }
}

export async function updateTask(
  taskId: string,
  input: Partial<{
    title: string
    description: string | null
    priority: TaskPriority
    startDate: Date | null
    dueDate: Date | null
    estimatedMinutes: number | null
    boardColumnId: string
    processId: string | null
  }>,
) {
  return prisma.task.update({ where: { id: taskId }, data: input })
}

export async function deleteTask(taskId: string) {
  await prisma.task.delete({ where: { id: taskId } })
}

export async function assignTask(taskId: string, userId: string) {
  return prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  })
}

export async function unassignTask(taskId: string, userId: string) {
  await prisma.taskAssignee.delete({ where: { taskId_userId: { taskId, userId } } })
}

export async function addTaskComment(taskId: string, userId: string, body: string) {
  return prisma.taskComment.create({
    data: { taskId, userId, body },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })
}

export async function addTaskAttachment(taskId: string, input: { fileUrl: string; uploadedBy: string }) {
  return prisma.taskAttachment.create({ data: { taskId, ...input } })
}

export async function deleteTaskAttachment(id: string) {
  await prisma.taskAttachment.delete({ where: { id } })
}

// ── Checklist ──

export async function addChecklistItem(taskId: string, title: string) {
  const count = await prisma.taskChecklistItem.count({ where: { taskId } })
  return prisma.taskChecklistItem.create({ data: { taskId, title, sortOrder: count } })
}

export async function updateChecklistItem(
  id: string,
  input: Partial<{ title: string; isChecked: boolean; sortOrder: number }>,
) {
  return prisma.taskChecklistItem.update({ where: { id }, data: input })
}

export async function deleteChecklistItem(id: string) {
  await prisma.taskChecklistItem.delete({ where: { id } })
}

// ── Dependencias ──

export async function addTaskDependency(blockerTaskId: string, blockedTaskId: string) {
  if (blockerTaskId === blockedTaskId) {
    throw new BusinessRuleError("Una tarea no puede depender de sí misma")
  }
  return prisma.taskDependency.create({ data: { blockerTaskId, blockedTaskId } })
}

export async function removeTaskDependency(id: string) {
  await prisma.taskDependency.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Cronómetro en vivo (TimeEntry) — Hoja de Tiempo
// Regla de negocio: un usuario solo puede tener UN tramo abierto a la vez,
// en todo el sistema (no por tarea). Se valida acá, no en la base.
// ────────────────────────────────────────────────

export async function getRunningTimer(userId: string) {
  return prisma.timeEntry.findFirst({
    where: { userId, endedAt: null },
    include: { task: { select: { id: true, title: true } } },
  })
}

export async function startTimer(taskId: string, userId: string, note?: string) {
  const running = await prisma.timeEntry.findFirst({ where: { userId, endedAt: null } })
  if (running) {
    throw new BusinessRuleError(
      "Ya tenés un cronómetro corriendo en otra tarea. Detenelo antes de iniciar uno nuevo.",
    )
  }
  return prisma.timeEntry.create({ data: { taskId, userId, note } })
}

export async function stopTimer(timeEntryId: string, userId: string) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } })
  if (!entry) throw new BusinessRuleError("Cronómetro no encontrado")
  if (entry.userId !== userId) throw new BusinessRuleError("No podés detener el cronómetro de otro usuario")
  if (entry.endedAt) throw new BusinessRuleError("Ese cronómetro ya está detenido")
  return prisma.timeEntry.update({ where: { id: timeEntryId }, data: { endedAt: new Date() } })
}

export async function listTaskTimeEntries(taskId: string) {
  return prisma.timeEntry.findMany({
    where: { taskId },
    orderBy: { startedAt: "desc" },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })
}

/** "Hoja de Tiempo" del proyecto: todos los tramos, agrupables por usuario/tarea en el frontend. */
export async function listProjectTimeEntries(projectId: string) {
  return prisma.timeEntry.findMany({
    where: { task: { boardColumn: { board: { projectId } } } },
    orderBy: { startedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, avatarUrl: true } },
      task: { select: { id: true, title: true } },
    },
  })
}

function entryMinutes(startedAt: Date, endedAt: Date | null): number {
  const end = endedAt ?? new Date()
  return Math.max(0, Math.round((end.getTime() - startedAt.getTime()) / 60000))
}

async function sumTaskTimeMinutes(taskId: string): Promise<number> {
  const entries = await prisma.timeEntry.findMany({ where: { taskId }, select: { startedAt: true, endedAt: true } })
  return entries.reduce((sum, e) => sum + entryMinutes(e.startedAt, e.endedAt), 0)
}

async function sumProjectTimeMinutes(projectId: string): Promise<number> {
  const entries = await prisma.timeEntry.findMany({
    where: { task: { boardColumn: { board: { projectId } } } },
    select: { startedAt: true, endedAt: true },
  })
  return entries.reduce((sum, e) => sum + entryMinutes(e.startedAt, e.endedAt), 0)
}

// ────────────────────────────────────────────────
// Campos personalizados (EAV simple) — Proyectos y Casos
// ────────────────────────────────────────────────

export async function listCustomFieldDefinitions(entity: CustomFieldEntity) {
  return prisma.customFieldDefinition.findMany({ where: { entity }, orderBy: { sortOrder: "asc" } })
}

export async function createCustomFieldDefinition(input: {
  entity: CustomFieldEntity
  label: string
  fieldType: CustomFieldType
  options?: string[]
  required?: boolean
  sortOrder?: number
  showInTable?: boolean
  filterable?: boolean
}) {
  return prisma.customFieldDefinition.create({ data: input })
}

export async function updateCustomFieldDefinition(
  id: string,
  input: Partial<{
    label: string
    fieldType: CustomFieldType
    options: string[]
    required: boolean
    sortOrder: number
    showInTable: boolean
    filterable: boolean
  }>,
) {
  return prisma.customFieldDefinition.update({ where: { id }, data: input })
}

export async function deleteCustomFieldDefinition(id: string) {
  await prisma.customFieldDefinition.delete({ where: { id } })
}

/** Combina definiciones + valores existentes para una entidad puntual (ej. un proyecto). */
export async function getCustomFieldValues(entity: CustomFieldEntity, entityId: string) {
  const [definitions, values] = await Promise.all([
    prisma.customFieldDefinition.findMany({ where: { entity }, orderBy: { sortOrder: "asc" } }),
    prisma.customFieldValue.findMany({ where: { entityId } }),
  ])
  const valueByDefinition = new Map(values.map((v) => [v.definitionId, v.value]))
  return definitions.map((def) => ({ definition: def, value: valueByDefinition.get(def.id) ?? null }))
}

export async function setCustomFieldValue(definitionId: string, entityId: string, value: unknown) {
  return prisma.customFieldValue.upsert({
    where: { definitionId_entityId: { definitionId, entityId } },
    create: { definitionId, entityId, value: value as never },
    update: { value: value as never },
  })
}

// ────────────────────────────────────────────────
// Encuestas (uso interno)
// ────────────────────────────────────────────────

export async function listSurveys(filter?: { entity?: SurveyEntity; entityId?: string }) {
  return prisma.survey.findMany({
    where: filter,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true, responses: true } } },
  })
}

export async function createSurvey(input: {
  title: string
  description?: string
  entity?: SurveyEntity
  entityId?: string
  createdBy: string
}) {
  return prisma.survey.create({ data: input })
}

export async function getSurveyDetail(id: string) {
  return prisma.survey.findUnique({
    where: { id },
    include: { questions: { orderBy: { sortOrder: "asc" } } },
  })
}

export async function addSurveyQuestion(
  surveyId: string,
  input: { label: string; type: SurveyQuestionType; options?: string[]; required?: boolean; sortOrder?: number },
) {
  return prisma.surveyQuestion.create({ data: { surveyId, ...input } })
}

export async function deleteSurveyQuestion(id: string) {
  await prisma.surveyQuestion.delete({ where: { id } })
}

export async function deleteSurvey(id: string) {
  await prisma.survey.delete({ where: { id } })
}

export async function submitSurveyResponse(
  surveyId: string,
  respondentUserId: string,
  answers: Array<{ questionId: string; value?: unknown }>,
) {
  return prisma.surveyResponse.create({
    data: {
      surveyId,
      respondentUserId,
      answers: {
        create: answers.map((a) => ({ questionId: a.questionId, value: a.value as never })),
      },
    },
    include: { answers: true },
  })
}

export async function listSurveyResponses(surveyId: string) {
  return prisma.surveyResponse.findMany({
    where: { surveyId },
    orderBy: { submittedAt: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      answers: { include: { question: { select: { id: true, label: true } } } },
    },
  })
}

// ────────────────────────────────────────────────
// Gastos de proyecto (ledger)
// ────────────────────────────────────────────────

export async function listProjectExpenses(projectId: string) {
  return prisma.projectExpense.findMany({
    where: { projectId },
    orderBy: { expenseDate: "desc" },
    include: {
      member: { select: { id: true, name: true } },
      case: { select: { id: true, caseNumber: true, fullName: true } },
    },
  })
}

export async function createProjectExpense(
  projectId: string,
  input: {
    caseId?: string
    memberId: string
    category: string
    title: string
    description?: string
    amount: number
    taxAmount?: number
    expenseDate: Date
    createdBy: string
  },
) {
  return prisma.projectExpense.create({ data: { projectId, ...input } })
}

export async function updateProjectExpense(
  id: string,
  input: Partial<{
    caseId: string | null
    category: string
    title: string
    description: string | null
    amount: number
    taxAmount: number
    expenseDate: Date
  }>,
) {
  return prisma.projectExpense.update({ where: { id }, data: input })
}

export async function deleteProjectExpense(id: string) {
  await prisma.projectExpense.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Notas de proyecto
// ────────────────────────────────────────────────

export async function listProjectNotes(projectId: string) {
  return prisma.projectNote.findMany({
    where: { projectId },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  })
}

export async function createProjectNote(projectId: string, input: { authorId: string; content: string; isPinned?: boolean }) {
  return prisma.projectNote.create({ data: { projectId, ...input } })
}

export async function updateProjectNote(id: string, input: Partial<{ content: string; isPinned: boolean }>) {
  return prisma.projectNote.update({ where: { id }, data: input })
}

export async function deleteProjectNote(id: string) {
  await prisma.projectNote.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Recordatorios (proyecto o tarea)
// ────────────────────────────────────────────────

export async function listReminders(entity: ReminderEntity, entityId: string) {
  return prisma.reminder.findMany({ where: { entity, entityId }, orderBy: { remindAt: "asc" } })
}

export async function createReminder(input: {
  entity: ReminderEntity
  entityId: string
  title: string
  remindAt: Date
  createdBy: string
}) {
  return prisma.reminder.create({ data: input })
}

export async function markReminderDone(id: string) {
  return prisma.reminder.update({ where: { id }, data: { isDone: true } })
}

export async function deleteReminder(id: string) {
  await prisma.reminder.delete({ where: { id } })
}

// ────────────────────────────────────────────────
// Configuración de proyecto
// ────────────────────────────────────────────────

export async function getProjectSettings(projectId: string) {
  const existing = await prisma.projectSettings.findUnique({ where: { projectId } })
  if (existing) return existing
  // proyectos creados antes de esta migración no tienen fila propia todavía
  return prisma.projectSettings.create({ data: { projectId } })
}

export async function updateProjectSettings(
  projectId: string,
  input: Partial<{
    membersCanTrackTime: boolean
    membersCanLogExpenses: boolean
    taskApprovalRequired: boolean
    isArchived: boolean
    extra: unknown
  }>,
) {
  return prisma.projectSettings.upsert({
    where: { projectId },
    create: { projectId, ...input } as never,
    update: input as never,
  })
}

// ────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────

export async function getDashboardSummary(userId: string) {
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

  const [
    activeProjects,
    totalOpenTasks,
    myTasks,
    dueSoon,
    upcomingMilestones,
    teamMembersCount,
    runningTimer,
    recentActivity,
  ] = await Promise.all([
    prisma.project.count({ where: { status: { in: ["planning", "active"] } } }),
    prisma.task.count({ where: { boardColumn: { name: { not: DONE_COLUMN_NAME } } } }),
    prisma.task.count({
      where: { assignees: { some: { userId } }, boardColumn: { name: { not: DONE_COLUMN_NAME } } },
    }),
    prisma.task.count({
      where: { boardColumn: { name: { not: DONE_COLUMN_NAME } }, dueDate: { lte: soon } },
    }),
    prisma.projectMilestone.findMany({
      where: { status: "pendiente", dueDate: { gte: new Date() } },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    prisma.projectMember.findMany({ distinct: ["userId"], select: { userId: true } }).then((r) => r.length),
    getRunningTimer(userId),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { id: true, name: true } } },
    }),
  ])

  // Distribución de tareas por columna (para el donut "Tasks Overview")
  const tasksByStatus = await prisma.task.groupBy({ by: ["boardColumnId"], _count: { _all: true } })
  const columnNames = await prisma.boardColumn.findMany({
    where: { id: { in: tasksByStatus.map((t) => t.boardColumnId) } },
    select: { id: true, name: true },
  })
  const columnNameById = new Map(columnNames.map((c) => [c.id, c.name]))
  const tasksByStatusLabeled = tasksByStatus.reduce<Record<string, number>>((acc, row) => {
    const name = columnNameById.get(row.boardColumnId) ?? "Sin columna"
    acc[name] = (acc[name] ?? 0) + row._count._all
    return acc
  }, {})

  return {
    activeProjects,
    totalOpenTasks,
    myTasks,
    dueSoon,
    teamMembersCount,
    tasksByStatus: tasksByStatusLabeled,
    upcomingMilestones,
    runningTimer,
    recentActivity,
  }
}
