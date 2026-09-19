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
 *
 * Trazabilidad: toda mutación que importa (crear/editar/borrar algo que un
 * humano hizo, no solo un cálculo derivado) queda registrada en AuditLog
 * vía `logActivity`, con quién la hizo. Antes de esto el modelo existía
 * pero nada lo escribía — el widget "actividad reciente" del dashboard
 * siempre devolvía vacío. El `diff` que se guarda es el input que se mandó
 * a cambiar, no un before/after real (evita una consulta extra por
 * escritura); alcanza para auditar "quién tocó qué y cuándo", que es lo
 * que pide CLAUDE.md, sin pretender ser un historial de valores previos.
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
// Auditoría (AuditLog) — trazabilidad de quién hizo qué
// ────────────────────────────────────────────────

async function logActivity(
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  diff?: unknown,
) {
  try {
    await prisma.auditLog.create({
      data: { userId: actorId, entityType, entityId, action, diff: diff === undefined ? undefined : (diff as never) },
    })
  } catch {
    // La auditoría nunca debe tirar abajo la operación real que la generó.
  }
}

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

/**
 * `seeAll`: true para quien tiene permiso global projects.read/write/admin
 * (dirección) — ve TODO el módulo. Si no, solo ve los proyectos de los que
 * es `ProjectMember` (voluntarios/coordinadores asignados a proyectos
 * puntuales, sin visión de organización completa).
 */
export async function listProjects(opts: { userId: string; seeAll: boolean }) {
  const projects = await prisma.project.findMany({
    where: opts.seeAll ? undefined : { members: { some: { userId: opts.userId } } },
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
  const project = await prisma.project.create({
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
  await logActivity(input.ownerId, "project", project.id, "created", { name: input.name, code })
  return project
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
  actorId: string,
) {
  const project = await prisma.project.update({ where: { id: projectId }, data: input })
  await logActivity(actorId, "project", projectId, "updated", input)
  return project
}

export async function deleteProject(projectId: string, actorId: string) {
  await prisma.project.delete({ where: { id: projectId } })
  await logActivity(actorId, "project", projectId, "deleted")
}

export async function addProjectMember(projectId: string, userId: string, projectRole: ProjectRole, actorId: string) {
  const member = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, projectRole },
    update: { projectRole },
  })
  await logActivity(actorId, "project", projectId, "member_added", { userId, projectRole })
  return member
}

export async function removeProjectMember(projectId: string, userId: string, actorId: string) {
  await prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } })
  await logActivity(actorId, "project", projectId, "member_removed", { userId })
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
  const link = await prisma.projectCase.upsert({
    where: { projectId_caseId: { projectId, caseId } },
    create: { projectId, caseId, linkedBy },
    update: {},
  })
  await logActivity(linkedBy, "project", projectId, "case_linked", { caseId })
  return link
}

export async function unlinkCase(projectId: string, caseId: string, actorId: string) {
  await prisma.projectCase.delete({ where: { projectId_caseId: { projectId, caseId } } })
  await logActivity(actorId, "project", projectId, "case_unlinked", { caseId })
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
  actorId: string,
) {
  const milestone = await prisma.projectMilestone.create({ data: { projectId, ...input } })
  await logActivity(actorId, "milestone", milestone.id, "created", { projectId, title: input.title })
  return milestone
}

export async function updateMilestone(
  id: string,
  input: Partial<{ title: string; description: string | null; dueDate: Date | null; status: MilestoneStatus }>,
  actorId: string,
) {
  const data = { ...input } as typeof input & { completedAt?: Date | null }
  if (input.status === "completado") data.completedAt = new Date()
  if (input.status === "pendiente") data.completedAt = null
  const milestone = await prisma.projectMilestone.update({ where: { id }, data })
  await logActivity(actorId, "milestone", id, "updated", input)
  return milestone
}

export async function deleteMilestone(id: string, actorId: string) {
  await prisma.projectMilestone.delete({ where: { id } })
  await logActivity(actorId, "milestone", id, "deleted")
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

export async function createProcess(
  projectId: string,
  input: { name: string; color?: string; sortOrder?: number },
  actorId: string,
) {
  const process = await prisma.projectProcess.create({ data: { projectId, ...input } })
  await logActivity(actorId, "process", process.id, "created", { projectId, name: input.name })
  return process
}

export async function updateProcess(
  id: string,
  input: Partial<{ name: string; color: string; sortOrder: number }>,
  actorId: string,
) {
  const process = await prisma.projectProcess.update({ where: { id }, data: input })
  await logActivity(actorId, "process", id, "updated", input)
  return process
}

export async function deleteProcess(id: string, actorId: string) {
  await prisma.projectProcess.delete({ where: { id } })
  await logActivity(actorId, "process", id, "deleted")
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
  const attachment = await prisma.projectAttachment.create({ data: { projectId, ...input } })
  await logActivity(input.uploadedBy, "project", projectId, "attachment_added", { fileName: input.fileName })
  return attachment
}

export async function deleteProjectAttachment(id: string, actorId: string) {
  const attachment = await prisma.projectAttachment.delete({ where: { id } })
  await logActivity(actorId, "project", attachment.projectId, "attachment_deleted", { fileName: attachment.fileName })
}

// ────────────────────────────────────────────────
// Etiquetas (catálogo global + asignación a proyecto/tarea)
// ────────────────────────────────────────────────

export async function listLabels() {
  return prisma.label.findMany({ orderBy: { name: "asc" } })
}

export async function createLabel(input: { name: string; color?: string }, actorId: string) {
  const label = await prisma.label.create({ data: input })
  await logActivity(actorId, "label", label.id, "created", input)
  return label
}

export async function updateLabel(id: string, input: Partial<{ name: string; color: string }>, actorId: string) {
  const label = await prisma.label.update({ where: { id }, data: input })
  await logActivity(actorId, "label", id, "updated", input)
  return label
}

export async function deleteLabel(id: string, actorId: string) {
  await prisma.label.delete({ where: { id } })
  await logActivity(actorId, "label", id, "deleted")
}

export async function attachProjectLabel(projectId: string, labelId: string, actorId: string) {
  const link = await prisma.projectLabel.upsert({
    where: { projectId_labelId: { projectId, labelId } },
    create: { projectId, labelId },
    update: {},
  })
  await logActivity(actorId, "project", projectId, "label_attached", { labelId })
  return link
}

export async function detachProjectLabel(projectId: string, labelId: string, actorId: string) {
  await prisma.projectLabel.delete({ where: { projectId_labelId: { projectId, labelId } } })
  await logActivity(actorId, "project", projectId, "label_detached", { labelId })
}

export async function attachTaskLabel(taskId: string, labelId: string, actorId: string) {
  const link = await prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    create: { taskId, labelId },
    update: {},
  })
  await logActivity(actorId, "task", taskId, "label_attached", { labelId })
  return link
}

export async function detachTaskLabel(taskId: string, labelId: string, actorId: string) {
  await prisma.taskLabel.delete({ where: { taskId_labelId: { taskId, labelId } } })
  await logActivity(actorId, "task", taskId, "label_detached", { labelId })
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
  const task = await prisma.task.create({
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
  await logActivity(input.createdBy, "task", task.id, "created", { title: input.title })
  return task
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
  actorId: string,
) {
  const task = await prisma.task.update({ where: { id: taskId }, data: input })
  await logActivity(actorId, "task", taskId, "updated", input)
  return task
}

export async function deleteTask(taskId: string, actorId: string) {
  await prisma.task.delete({ where: { id: taskId } })
  await logActivity(actorId, "task", taskId, "deleted")
}

export async function assignTask(taskId: string, userId: string, actorId: string) {
  const assignee = await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
  })
  await logActivity(actorId, "task", taskId, "assigned", { userId })
  return assignee
}

export async function unassignTask(taskId: string, userId: string, actorId: string) {
  await prisma.taskAssignee.delete({ where: { taskId_userId: { taskId, userId } } })
  await logActivity(actorId, "task", taskId, "unassigned", { userId })
}

export async function addTaskComment(taskId: string, userId: string, body: string) {
  const comment = await prisma.taskComment.create({
    data: { taskId, userId, body },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  })
  await logActivity(userId, "task", taskId, "commented")
  return comment
}

/** Pestaña "Comentarios" de la página de proyecto: agrega los comentarios de TODAS las tareas del proyecto en un solo feed. */
export async function listProjectComments(projectId: string) {
  return prisma.taskComment.findMany({
    where: { task: { boardColumn: { board: { projectId } } } },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      task: { select: { id: true, title: true } },
    },
  })
}

export async function addTaskAttachment(taskId: string, input: { fileUrl: string; uploadedBy: string }) {
  const attachment = await prisma.taskAttachment.create({ data: { taskId, ...input } })
  await logActivity(input.uploadedBy, "task", taskId, "attachment_added")
  return attachment
}

export async function deleteTaskAttachment(id: string, actorId: string) {
  const attachment = await prisma.taskAttachment.delete({ where: { id } })
  await logActivity(actorId, "task", attachment.taskId, "attachment_deleted")
}

// ── Checklist ──

export async function addChecklistItem(taskId: string, title: string, actorId: string) {
  const count = await prisma.taskChecklistItem.count({ where: { taskId } })
  const item = await prisma.taskChecklistItem.create({ data: { taskId, title, sortOrder: count } })
  await logActivity(actorId, "task", taskId, "checklist_item_added", { title })
  return item
}

export async function updateChecklistItem(
  id: string,
  input: Partial<{ title: string; isChecked: boolean; sortOrder: number }>,
  actorId: string,
) {
  const item = await prisma.taskChecklistItem.update({ where: { id }, data: input })
  await logActivity(actorId, "task", item.taskId, "checklist_item_updated", input)
  return item
}

export async function deleteChecklistItem(id: string, actorId: string) {
  const item = await prisma.taskChecklistItem.delete({ where: { id } })
  await logActivity(actorId, "task", item.taskId, "checklist_item_deleted", { title: item.title })
}

// ── Dependencias ──

export async function addTaskDependency(blockerTaskId: string, blockedTaskId: string, actorId: string) {
  if (blockerTaskId === blockedTaskId) {
    throw new BusinessRuleError("Una tarea no puede depender de sí misma")
  }
  const dep = await prisma.taskDependency.create({ data: { blockerTaskId, blockedTaskId } })
  await logActivity(actorId, "task", blockerTaskId, "dependency_added", { blockedTaskId })
  return dep
}

export async function removeTaskDependency(id: string, actorId: string) {
  const dep = await prisma.taskDependency.delete({ where: { id } })
  await logActivity(actorId, "task", dep.blockerTaskId, "dependency_removed", { blockedTaskId: dep.blockedTaskId })
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
  const entry = await prisma.timeEntry.create({ data: { taskId, userId, note } })
  await logActivity(userId, "task", taskId, "timer_started")
  return entry
}

export async function stopTimer(timeEntryId: string, userId: string) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: timeEntryId } })
  if (!entry) throw new BusinessRuleError("Cronómetro no encontrado")
  if (entry.userId !== userId) throw new BusinessRuleError("No podés detener el cronómetro de otro usuario")
  if (entry.endedAt) throw new BusinessRuleError("Ese cronómetro ya está detenido")
  const stopped = await prisma.timeEntry.update({ where: { id: timeEntryId }, data: { endedAt: new Date() } })
  await logActivity(userId, "task", entry.taskId, "timer_stopped", {
    minutes: entryMinutes(entry.startedAt, stopped.endedAt),
  })
  return stopped
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

export async function createCustomFieldDefinition(
  input: {
    entity: CustomFieldEntity
    label: string
    fieldType: CustomFieldType
    options?: string[]
    required?: boolean
    sortOrder?: number
    showInTable?: boolean
    filterable?: boolean
  },
  actorId: string,
) {
  const def = await prisma.customFieldDefinition.create({ data: input })
  await logActivity(actorId, "custom_field_definition", def.id, "created", { entity: input.entity, label: input.label })
  return def
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
  actorId: string,
) {
  const def = await prisma.customFieldDefinition.update({ where: { id }, data: input })
  await logActivity(actorId, "custom_field_definition", id, "updated", input)
  return def
}

export async function deleteCustomFieldDefinition(id: string, actorId: string) {
  await prisma.customFieldDefinition.delete({ where: { id } })
  await logActivity(actorId, "custom_field_definition", id, "deleted")
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

export async function setCustomFieldValue(definitionId: string, entityId: string, value: unknown, actorId: string) {
  const record = await prisma.customFieldValue.upsert({
    where: { definitionId_entityId: { definitionId, entityId } },
    create: { definitionId, entityId, value: value as never },
    update: { value: value as never },
  })
  await logActivity(actorId, "custom_field_value", entityId, "custom_field_set", { definitionId })
  return record
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
  const survey = await prisma.survey.create({ data: input })
  await logActivity(input.createdBy, "survey", survey.id, "created", { title: input.title })
  return survey
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
  actorId: string,
) {
  const question = await prisma.surveyQuestion.create({ data: { surveyId, ...input } })
  await logActivity(actorId, "survey", surveyId, "question_added", { label: input.label })
  return question
}

export async function deleteSurveyQuestion(id: string, actorId: string) {
  const question = await prisma.surveyQuestion.delete({ where: { id } })
  await logActivity(actorId, "survey", question.surveyId, "question_deleted", { label: question.label })
}

export async function deleteSurvey(id: string, actorId: string) {
  await prisma.survey.delete({ where: { id } })
  await logActivity(actorId, "survey", id, "deleted")
}

export async function submitSurveyResponse(
  surveyId: string,
  respondentUserId: string,
  answers: Array<{ questionId: string; value?: unknown }>,
) {
  const response = await prisma.surveyResponse.create({
    data: {
      surveyId,
      respondentUserId,
      answers: {
        create: answers.map((a) => ({ questionId: a.questionId, value: a.value as never })),
      },
    },
    include: { answers: true },
  })
  await logActivity(respondentUserId, "survey", surveyId, "response_submitted")
  return response
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
  const expense = await prisma.projectExpense.create({ data: { projectId, ...input } })
  await logActivity(input.createdBy, "project", projectId, "expense_added", {
    title: input.title,
    amount: input.amount,
    category: input.category,
  })
  return expense
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
  actorId: string,
) {
  const expense = await prisma.projectExpense.update({ where: { id }, data: input })
  await logActivity(actorId, "project", expense.projectId, "expense_updated", { expenseId: id, ...input })
  return expense
}

export async function deleteProjectExpense(id: string, actorId: string) {
  const expense = await prisma.projectExpense.delete({ where: { id } })
  await logActivity(actorId, "project", expense.projectId, "expense_deleted", {
    title: expense.title,
    amount: expense.amount,
  })
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

export async function createProjectNote(
  projectId: string,
  input: { authorId: string; content: string; isPinned?: boolean },
) {
  const note = await prisma.projectNote.create({ data: { projectId, ...input } })
  await logActivity(input.authorId, "project", projectId, "note_added")
  return note
}

export async function updateProjectNote(
  id: string,
  input: Partial<{ content: string; isPinned: boolean }>,
  actorId: string,
) {
  const note = await prisma.projectNote.update({ where: { id }, data: input })
  await logActivity(actorId, "project", note.projectId, "note_updated", { noteId: id })
  return note
}

export async function deleteProjectNote(id: string, actorId: string) {
  const note = await prisma.projectNote.delete({ where: { id } })
  await logActivity(actorId, "project", note.projectId, "note_deleted", { noteId: id })
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
  const reminder = await prisma.reminder.create({ data: input })
  await logActivity(input.createdBy, input.entity.toLowerCase(), input.entityId, "reminder_created", {
    title: input.title,
  })
  return reminder
}

export async function markReminderDone(id: string, actorId: string) {
  const reminder = await prisma.reminder.update({ where: { id }, data: { isDone: true } })
  await logActivity(actorId, reminder.entity.toLowerCase(), reminder.entityId, "reminder_done", { title: reminder.title })
  return reminder
}

export async function deleteReminder(id: string, actorId: string) {
  const reminder = await prisma.reminder.delete({ where: { id } })
  await logActivity(actorId, reminder.entity.toLowerCase(), reminder.entityId, "reminder_deleted", {
    title: reminder.title,
  })
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
  actorId: string,
) {
  const settings = await prisma.projectSettings.upsert({
    where: { projectId },
    create: { projectId, ...input } as never,
    update: input as never,
  })
  await logActivity(actorId, "project", projectId, "settings_updated", input)
  return settings
}

// ────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────

const MONTH_LABELS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

/**
 * Widget "Ingresos vs gastos" del dashboard (versión Vida Solidaria del
 * Invoice Overview de RedVivo): combina FundTransaction (ingresos/egresos
 * de donaciones, tabla que ya existía desde el schema inicial pero sin
 * módulo de Finanzas construido todavía) con ProjectExpense (gastos de
 * proyecto, nuevo). Últimos 6 meses, sin dependencia de locale de Node
 * (labels de mes hardcodeados) para que no varíe según el ICU del server.
 */
async function getFinanceOverview() {
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  start.setMonth(start.getMonth() - 5)

  const [transactions, expenses] = await Promise.all([
    prisma.fundTransaction.findMany({
      where: { occurredAt: { gte: start } },
      select: { type: true, amount: true, occurredAt: true },
    }),
    prisma.projectExpense.findMany({
      where: { expenseDate: { gte: start } },
      select: { amount: true, taxAmount: true, expenseDate: true },
    }),
  ])

  const months: { key: string; label: string; income: number; expense: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()], income: 0, expense: 0 })
  }
  const byKey = new Map(months.map((m) => [m.key, m]))
  const keyOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}`

  for (const t of transactions) {
    const bucket = byKey.get(keyOf(t.occurredAt))
    if (!bucket) continue
    if (t.type === "ingreso") bucket.income += Number(t.amount)
    else bucket.expense += Number(t.amount)
  }
  for (const e of expenses) {
    const bucket = byKey.get(keyOf(e.expenseDate))
    if (!bucket) continue
    bucket.expense += Number(e.amount) + Number(e.taxAmount)
  }

  return {
    incomeTotal: months.reduce((sum, m) => sum + m.income, 0),
    expenseTotal: months.reduce((sum, m) => sum + m.expense, 0),
    months,
  }
}

/**
 * `seeAll` es exactamente el mismo criterio que `canSeeAllProjects` en
 * project-access.ts (permiso global projects.read/write/admin). Antes esta
 * función devolvía conteos de TODA la organización sin importar quién
 * preguntara — un voluntario agregado a un único proyecto puntual veía
 * "12 proyectos activos" y la actividad reciente de proyectos a los que no
 * tiene acceso. Mismo bug de fondo que el que motivó project-access.ts,
 * ahora corregido acá: sin `seeAll`, todo se filtra a los proyectos de los
 * que el usuario es `ProjectMember`.
 *
 * Excepción deliberada: `recentActivity` (AuditLog) usa `entityType` +
 * `entityId` polimórfico (a veces es un projectId, a veces un taskId, un
 * milestoneId, etc.) — reconstruir con precisión "toda actividad de MIS
 * proyectos" requeriría juntar los IDs de tareas/hitos/procesos/notas/
 * gastos/recordatorios de esos proyectos primero. Para no abrir ese
 * costado, sin `seeAll` el feed muestra solo las acciones del propio
 * usuario (siempre seguro, nunca expone actividad ajena) — se etiqueta
 * distinto en el frontend ("Tu actividad" vs "Actividad reciente").
 */
export async function getDashboardSummary(userId: string, opts: { seeAll: boolean; permissions: string[] }) {
  const { seeAll, permissions } = opts
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const canSeeFinance = permissions.includes("*") || permissions.includes("finance.read")

  const myProjectFilter = { members: { some: { userId } } }
  const projectScope = seeAll ? {} : myProjectFilter
  const taskProjectScope = seeAll ? {} : { boardColumn: { board: { project: myProjectFilter } } }

  const [
    activeProjects,
    totalOpenTasks,
    myTasks,
    dueSoon,
    upcomingMilestones,
    teamMembersCount,
    runningTimer,
    recentActivity,
    financeOverview,
  ] = await Promise.all([
    prisma.project.count({ where: { status: { in: ["planning", "active"] }, ...projectScope } }),
    prisma.task.count({ where: { boardColumn: { name: { not: DONE_COLUMN_NAME } }, ...taskProjectScope } }),
    prisma.task.count({
      where: { assignees: { some: { userId } }, boardColumn: { name: { not: DONE_COLUMN_NAME } } },
    }),
    prisma.task.count({
      where: { boardColumn: { name: { not: DONE_COLUMN_NAME } }, dueDate: { lte: soon }, ...taskProjectScope },
    }),
    prisma.projectMilestone.findMany({
      where: { status: "pendiente", dueDate: { gte: new Date() }, ...(seeAll ? {} : { project: myProjectFilter }) },
      orderBy: { dueDate: "asc" },
      take: 5,
      include: { project: { select: { id: true, name: true, code: true } } },
    }),
    seeAll
      ? prisma.projectMember.findMany({ distinct: ["userId"], select: { userId: true } }).then((r) => r.length)
      : prisma.projectMember
          .findMany({ where: { project: myProjectFilter }, distinct: ["userId"], select: { userId: true } })
          .then((r) => r.length),
    getRunningTimer(userId),
    prisma.auditLog.findMany({
      where: seeAll ? undefined : { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { id: true, name: true } } },
    }),
    canSeeFinance ? getFinanceOverview() : Promise.resolve(null),
  ])

  // Distribución de tareas por columna (para el widget "Tasks Overview")
  const tasksByStatus = await prisma.task.groupBy({
    by: ["boardColumnId"],
    _count: { _all: true },
    where: taskProjectScope,
  })
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
    scopedToOwnProjects: !seeAll,
    activeProjects,
    totalOpenTasks,
    myTasks,
    dueSoon,
    teamMembersCount,
    tasksByStatus: tasksByStatusLabeled,
    upcomingMilestones,
    runningTimer,
    recentActivity,
    financeOverview,
  }
}
