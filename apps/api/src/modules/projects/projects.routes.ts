import type { FastifyInstance } from "fastify"
import { z, ZodError } from "zod"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import * as service from "./projects.service"
import { BusinessRuleError } from "./projects.service"
import {
  canSeeAllProjects,
  fromBoardColumnBody,
  fromChecklistItemIdParam,
  fromDependencyIdParam,
  fromExpenseIdParam,
  fromMilestoneIdParam,
  fromNoteIdParam,
  fromProcessIdParam,
  fromProjectAttachmentIdParam,
  fromProjectIdParam,
  fromReminderBody,
  fromReminderIdParam,
  fromReminderQuery,
  fromTaskAttachmentIdParam,
  fromTaskIdParam,
  fromTimeEntryIdParam,
  guardCustomFieldValue,
  requireProjectAdmin,
  requireProjectRead,
  requireProjectWrite,
} from "./project-access"

// ── Schemas ──

const priorityEnum = z.enum(["baja", "media", "alta"])
const projectRoleEnum = z.enum(["creador", "editor", "visor", "admin"])
const milestoneStatusEnum = z.enum(["pendiente", "completado"])
const customFieldEntityEnum = z.enum(["PROJECT", "CASE"])
const customFieldTypeEnum = z.enum(["TEXT", "TEXTAREA", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"])
const surveyEntityEnum = z.enum(["PROJECT", "CASE", "STANDALONE"])
const surveyQuestionTypeEnum = z.enum([
  "TEXT",
  "NUMBER",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE",
  "SCALE",
  "BOOLEAN",
  "DATE",
])
const reminderEntityEnum = z.enum(["PROJECT", "TASK"])

const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  area: z.string().optional(),
  priority: priorityEnum.optional(),
  budget: z.number().nonnegative().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  area: z.string().optional(),
  status: z.enum(["planning", "active", "paused", "done"]).optional(),
  priority: priorityEnum.optional(),
  budget: z.number().nonnegative().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
})

const memberSchema = z.object({ userId: z.string().uuid(), projectRole: projectRoleEnum.default("editor") })

const createTaskSchema = z.object({
  boardColumnId: z.string().uuid(),
  processId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: priorityEnum.optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: priorityEnum.optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  estimatedMinutes: z.number().int().nonnegative().nullable().optional(),
  boardColumnId: z.string().uuid().optional(),
  processId: z.string().uuid().nullable().optional(),
})

const assigneeSchema = z.object({ userId: z.string().uuid() })
const commentSchema = z.object({ body: z.string().min(1) })
const attachmentSchema = z.object({ fileUrl: z.string().url(), fileName: z.string().min(1) })
const taskAttachmentSchema = z.object({ fileUrl: z.string().url() })

const caseLinkSchema = z.object({ caseId: z.string().uuid() })

const milestoneSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
})
const updateMilestoneSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  status: milestoneStatusEnum.optional(),
})

const processSchema = z.object({ name: z.string().min(1), color: z.string().optional(), sortOrder: z.number().int().optional() })
const updateProcessSchema = processSchema.partial()

const labelSchema = z.object({ name: z.string().min(1), color: z.string().optional() })
const labelIdSchema = z.object({ labelId: z.string().uuid() })

const checklistItemSchema = z.object({ title: z.string().min(1) })
const updateChecklistItemSchema = z.object({
  title: z.string().min(1).optional(),
  isChecked: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})

const dependencySchema = z.object({ blockedTaskId: z.string().uuid() })

const startTimerSchema = z.object({ note: z.string().optional() })

const customFieldDefSchema = z.object({
  entity: customFieldEntityEnum,
  label: z.string().min(1),
  fieldType: customFieldTypeEnum,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  showInTable: z.boolean().optional(),
  filterable: z.boolean().optional(),
})
const updateCustomFieldDefSchema = customFieldDefSchema.omit({ entity: true }).partial()
const customFieldValueSchema = z.object({ value: z.unknown() })

const surveySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  entity: surveyEntityEnum.optional(),
  entityId: z.string().uuid().optional(),
})
const surveyQuestionSchema = z.object({
  label: z.string().min(1),
  type: surveyQuestionTypeEnum,
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
})
const surveyResponseSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().uuid(), value: z.unknown() })),
})

const expenseSchema = z.object({
  caseId: z.string().uuid().optional(),
  memberId: z.string().uuid(),
  category: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().optional(),
  expenseDate: z.string().datetime(),
})
const updateExpenseSchema = expenseSchema.omit({ memberId: true }).partial()

const noteSchema = z.object({ content: z.string().min(1), isPinned: z.boolean().optional() })
const updateNoteSchema = noteSchema.partial()

const reminderSchema = z.object({ title: z.string().min(1), remindAt: z.string().datetime() })

const settingsSchema = z.object({
  membersCanTrackTime: z.boolean().optional(),
  membersCanLogExpenses: z.boolean().optional(),
  taskApprovalRequired: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  extra: z.unknown().optional(),
})

export async function projectsRoutes(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Datos inválidos", details: error.flatten() })
    }
    if (error instanceof BusinessRuleError) {
      return reply.code(409).send({ error: error.message })
    }
    throw error
  })

  // ── Proyectos ──
  app.get("/projects", { preHandler: [requireAuth] }, async (request) => {
    return service.listProjects({ userId: request.user!.sub, seeAll: canSeeAllProjects(request) })
  })

  app.post("/projects", { preHandler: [requireAuth, requirePermission("projects.write")] }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body)
    const project = await service.createProject({
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      ownerId: request.user!.sub,
    })
    return reply.code(201).send(project)
  })

  app.get(
    "/projects/:id",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const project = await service.getProjectDetail(id)
      if (!project) return reply.code(404).send({ error: "Proyecto no encontrado" })
      return project
    },
  )

  app.patch("/projects/:id", { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = updateProjectSchema.parse(request.body)
    return service.updateProject(id, {
      ...body,
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate === undefined ? undefined : body.endDate ? new Date(body.endDate) : null,
    }, request.user!.sub)
  })

  app.delete(
    "/projects/:id",
    { preHandler: [requireAuth, requireProjectAdmin(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await service.deleteProject(id, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Miembros ──
  app.post(
    "/projects/:id/members",
    { preHandler: [requireAuth, requireProjectAdmin(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = memberSchema.parse(request.body)
      const member = await service.addProjectMember(id, body.userId, body.projectRole, request.user!.sub)
      return reply.code(201).send(member)
    },
  )

  app.delete(
    "/projects/:id/members/:userId",
    { preHandler: [requireAuth, requireProjectAdmin(fromProjectIdParam)] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await service.removeProjectMember(id, userId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Proyecto ↔ Caso ──
  app.get(
    "/projects/:id/cases",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectCases(id)
    },
  )

  app.post(
    "/projects/:id/cases",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = caseLinkSchema.parse(request.body)
      const link = await service.linkCase(id, body.caseId, request.user!.sub)
      return reply.code(201).send(link)
    },
  )

  app.delete(
    "/projects/:id/cases/:caseId",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id, caseId } = request.params as { id: string; caseId: string }
      await service.unlinkCase(id, caseId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Hitos ──
  app.get(
    "/projects/:id/milestones",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listMilestones(id)
    },
  )

  app.post(
    "/projects/:id/milestones",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = milestoneSchema.parse(request.body)
      const milestone = await service.createMilestone(id, {
        ...body,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      }, request.user!.sub)
      return reply.code(201).send(milestone)
    },
  )

  app.patch(
    "/milestones/:milestoneId",
    { preHandler: [requireAuth, requireProjectWrite(fromMilestoneIdParam)] },
    async (request) => {
      const { milestoneId } = request.params as { milestoneId: string }
      const body = updateMilestoneSchema.parse(request.body)
      return service.updateMilestone(milestoneId, {
        ...body,
        dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
      }, request.user!.sub)
    },
  )

  app.delete(
    "/milestones/:milestoneId",
    { preHandler: [requireAuth, requireProjectWrite(fromMilestoneIdParam)] },
    async (request, reply) => {
      const { milestoneId } = request.params as { milestoneId: string }
      await service.deleteMilestone(milestoneId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Procesos ──
  app.get(
    "/projects/:id/processes",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProcesses(id)
    },
  )

  app.post(
    "/projects/:id/processes",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = processSchema.parse(request.body)
      const process = await service.createProcess(id, body, request.user!.sub)
      return reply.code(201).send(process)
    },
  )

  app.patch(
    "/processes/:processId",
    { preHandler: [requireAuth, requireProjectWrite(fromProcessIdParam)] },
    async (request) => {
      const { processId } = request.params as { processId: string }
      const body = updateProcessSchema.parse(request.body)
      return service.updateProcess(processId, body, request.user!.sub)
    },
  )

  app.delete(
    "/processes/:processId",
    { preHandler: [requireAuth, requireProjectWrite(fromProcessIdParam)] },
    async (request, reply) => {
      const { processId } = request.params as { processId: string }
      await service.deleteProcess(processId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.get(
    "/projects/:id/plan",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.getProjectPlan(id)
    },
  )

  // ── Archivos de proyecto ──
  app.get(
    "/projects/:id/attachments",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectAttachments(id)
    },
  )

  app.post(
    "/projects/:id/attachments",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = attachmentSchema.parse(request.body)
      const attachment = await service.addProjectAttachment(id, { ...body, uploadedBy: request.user!.sub })
      return reply.code(201).send(attachment)
    },
  )

  app.delete(
    "/attachments/:attachmentId",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectAttachmentIdParam)] },
    async (request, reply) => {
      const { attachmentId } = request.params as { attachmentId: string }
      await service.deleteProjectAttachment(attachmentId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Etiquetas ──
  app.get("/labels", { preHandler: [requireAuth] }, async () => {
    return service.listLabels()
  })

  app.post("/labels", { preHandler: [requireAuth, requirePermission("projects.admin")] }, async (request, reply) => {
    const body = labelSchema.parse(request.body)
    const label = await service.createLabel(body, request.user!.sub)
    return reply.code(201).send(label)
  })

  app.patch(
    "/labels/:labelId",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request) => {
      const { labelId } = request.params as { labelId: string }
      const body = labelSchema.partial().parse(request.body)
      return service.updateLabel(labelId, body, request.user!.sub)
    },
  )

  app.delete(
    "/labels/:labelId",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const { labelId } = request.params as { labelId: string }
      await service.deleteLabel(labelId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/projects/:id/labels",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = labelIdSchema.parse(request.body)
      const link = await service.attachProjectLabel(id, body.labelId, request.user!.sub)
      return reply.code(201).send(link)
    },
  )

  app.delete(
    "/projects/:id/labels/:labelId",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id, labelId } = request.params as { id: string; labelId: string }
      await service.detachProjectLabel(id, labelId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/tasks/:id/labels",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = labelIdSchema.parse(request.body)
      const link = await service.attachTaskLabel(id, body.labelId, request.user!.sub)
      return reply.code(201).send(link)
    },
  )

  app.delete(
    "/tasks/:id/labels/:labelId",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id, labelId } = request.params as { id: string; labelId: string }
      await service.detachTaskLabel(id, labelId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Tareas ──
  app.get(
    "/projects/:id/tasks",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectTasks(id)
    },
  )

  app.post("/tasks", { preHandler: [requireAuth, requireProjectWrite(fromBoardColumnBody)] }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body)
    const task = await service.createTask({
      ...body,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      createdBy: request.user!.sub,
    })
    return reply.code(201).send(task)
  })

  app.get(
    "/tasks/:id",
    { preHandler: [requireAuth, requireProjectRead(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const task = await service.getTaskDetail(id)
      if (!task) return reply.code(404).send({ error: "Tarea no encontrada" })
      return task
    },
  )

  app.patch("/tasks/:id", { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = updateTaskSchema.parse(request.body)
    return service.updateTask(id, {
      ...body,
      startDate: body.startDate === undefined ? undefined : body.startDate ? new Date(body.startDate) : null,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
    }, request.user!.sub)
  })

  app.delete(
    "/tasks/:id",
    { preHandler: [requireAuth, requireProjectAdmin(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await service.deleteTask(id, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/tasks/:id/assignees",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = assigneeSchema.parse(request.body)
      const assignee = await service.assignTask(id, body.userId, request.user!.sub)
      return reply.code(201).send(assignee)
    },
  )

  app.delete(
    "/tasks/:id/assignees/:userId",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await service.unassignTask(id, userId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/tasks/:id/comments",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = commentSchema.parse(request.body)
      const comment = await service.addTaskComment(id, request.user!.sub, body.body)
      return reply.code(201).send(comment)
    },
  )

  app.post(
    "/tasks/:id/attachments",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = taskAttachmentSchema.parse(request.body)
      const attachment = await service.addTaskAttachment(id, { ...body, uploadedBy: request.user!.sub })
      return reply.code(201).send(attachment)
    },
  )

  app.delete(
    "/task-attachments/:attachmentId",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskAttachmentIdParam)] },
    async (request, reply) => {
      const { attachmentId } = request.params as { attachmentId: string }
      await service.deleteTaskAttachment(attachmentId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Checklist ──
  app.post(
    "/tasks/:id/checklist",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = checklistItemSchema.parse(request.body)
      const item = await service.addChecklistItem(id, body.title, request.user!.sub)
      return reply.code(201).send(item)
    },
  )

  app.patch(
    "/checklist/:itemId",
    { preHandler: [requireAuth, requireProjectWrite(fromChecklistItemIdParam)] },
    async (request) => {
      const { itemId } = request.params as { itemId: string }
      const body = updateChecklistItemSchema.parse(request.body)
      return service.updateChecklistItem(itemId, body, request.user!.sub)
    },
  )

  app.delete(
    "/checklist/:itemId",
    { preHandler: [requireAuth, requireProjectWrite(fromChecklistItemIdParam)] },
    async (request, reply) => {
      const { itemId } = request.params as { itemId: string }
      await service.deleteChecklistItem(itemId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Dependencias ──
  app.post(
    "/tasks/:id/dependencies",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = dependencySchema.parse(request.body)
      const dep = await service.addTaskDependency(id, body.blockedTaskId, request.user!.sub)
      return reply.code(201).send(dep)
    },
  )

  app.delete(
    "/dependencies/:depId",
    { preHandler: [requireAuth, requireProjectWrite(fromDependencyIdParam)] },
    async (request, reply) => {
      const { depId } = request.params as { depId: string }
      await service.removeTaskDependency(depId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Cronómetro (Hoja de Tiempo) ──
  app.get(
    "/timer/running",
    { preHandler: [requireAuth] },
    async (request) => {
      return service.getRunningTimer(request.user!.sub)
    },
  )

  app.post(
    "/tasks/:id/timer/start",
    { preHandler: [requireAuth, requireProjectWrite(fromTaskIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = startTimerSchema.parse(request.body ?? {})
      const entry = await service.startTimer(id, request.user!.sub, body.note)
      return reply.code(201).send(entry)
    },
  )

  app.post(
    "/timer/:entryId/stop",
    { preHandler: [requireAuth, requireProjectRead(fromTimeEntryIdParam)] },
    async (request) => {
      const { entryId } = request.params as { entryId: string }
      return service.stopTimer(entryId, request.user!.sub)
    },
  )

  app.get(
    "/tasks/:id/time-entries",
    { preHandler: [requireAuth, requireProjectRead(fromTaskIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listTaskTimeEntries(id)
    },
  )

  app.get(
    "/projects/:id/time-entries",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectTimeEntries(id)
    },
  )

  // ── Campos personalizados ──
  app.get(
    "/custom-fields",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request) => {
      const { entity } = request.query as { entity: "PROJECT" | "CASE" }
      return service.listCustomFieldDefinitions(customFieldEntityEnum.parse(entity))
    },
  )

  app.post(
    "/custom-fields",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const body = customFieldDefSchema.parse(request.body)
      const def = await service.createCustomFieldDefinition(body, request.user!.sub)
      return reply.code(201).send(def)
    },
  )

  app.patch(
    "/custom-fields/:defId",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request) => {
      const { defId } = request.params as { defId: string }
      const body = updateCustomFieldDefSchema.parse(request.body)
      return service.updateCustomFieldDefinition(defId, body, request.user!.sub)
    },
  )

  app.delete(
    "/custom-fields/:defId",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const { defId } = request.params as { defId: string }
      await service.deleteCustomFieldDefinition(defId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.get(
    "/projects/:id/custom-field-values",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.getCustomFieldValues("PROJECT", id)
    },
  )

  app.put(
    "/custom-fields/:defId/values/:entityId",
    { preHandler: [guardCustomFieldValue] },
    async (request) => {
      const { defId, entityId } = request.params as { defId: string; entityId: string }
      const body = customFieldValueSchema.parse(request.body)
      return service.setCustomFieldValue(defId, entityId, body.value, request.user!.sub)
    },
  )

  // ── Encuestas ──
  app.get("/surveys", { preHandler: [requireAuth, requirePermission("surveys.manage")] }, async (request) => {
    const { entity, entityId } = request.query as { entity?: string; entityId?: string }
    return service.listSurveys(
      entity ? { entity: surveyEntityEnum.parse(entity), entityId } : undefined,
    )
  })

  app.post("/surveys", { preHandler: [requireAuth, requirePermission("surveys.manage")] }, async (request, reply) => {
    const body = surveySchema.parse(request.body)
    const survey = await service.createSurvey({ ...body, createdBy: request.user!.sub })
    return reply.code(201).send(survey)
  })

  app.get(
    "/surveys/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const survey = await service.getSurveyDetail(id)
      if (!survey) return reply.code(404).send({ error: "Encuesta no encontrada" })
      return survey
    },
  )

  app.delete(
    "/surveys/:id",
    { preHandler: [requireAuth, requirePermission("surveys.manage")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await service.deleteSurvey(id, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/surveys/:id/questions",
    { preHandler: [requireAuth, requirePermission("surveys.manage")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = surveyQuestionSchema.parse(request.body)
      const question = await service.addSurveyQuestion(id, body, request.user!.sub)
      return reply.code(201).send(question)
    },
  )

  app.delete(
    "/survey-questions/:questionId",
    { preHandler: [requireAuth, requirePermission("surveys.manage")] },
    async (request, reply) => {
      const { questionId } = request.params as { questionId: string }
      await service.deleteSurveyQuestion(questionId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  app.post(
    "/surveys/:id/responses",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = surveyResponseSchema.parse(request.body)
      const response = await service.submitSurveyResponse(id, request.user!.sub, body.answers)
      return reply.code(201).send(response)
    },
  )

  app.get(
    "/surveys/:id/responses",
    { preHandler: [requireAuth, requirePermission("surveys.manage")] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listSurveyResponses(id)
    },
  )

  // ── Gastos ──
  app.get(
    "/projects/:id/expenses",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam, ["finance.read"])] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectExpenses(id)
    },
  )

  app.post(
    "/projects/:id/expenses",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = expenseSchema.parse(request.body)
      const expense = await service.createProjectExpense(id, {
        ...body,
        expenseDate: new Date(body.expenseDate),
        createdBy: request.user!.sub,
      })
      return reply.code(201).send(expense)
    },
  )

  app.patch(
    "/expenses/:expenseId",
    { preHandler: [requireAuth, requireProjectWrite(fromExpenseIdParam)] },
    async (request) => {
      const { expenseId } = request.params as { expenseId: string }
      const body = updateExpenseSchema.parse(request.body)
      return service.updateProjectExpense(expenseId, {
        ...body,
        expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined,
      }, request.user!.sub)
    },
  )

  app.delete(
    "/expenses/:expenseId",
    { preHandler: [requireAuth, requireProjectAdmin(fromExpenseIdParam)] },
    async (request, reply) => {
      const { expenseId } = request.params as { expenseId: string }
      await service.deleteProjectExpense(expenseId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Notas ──
  app.get(
    "/projects/:id/notes",
    { preHandler: [requireAuth, requireProjectRead(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.listProjectNotes(id)
    },
  )

  app.post(
    "/projects/:id/notes",
    { preHandler: [requireAuth, requireProjectWrite(fromProjectIdParam)] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = noteSchema.parse(request.body)
      const note = await service.createProjectNote(id, { ...body, authorId: request.user!.sub })
      return reply.code(201).send(note)
    },
  )

  app.patch(
    "/notes/:noteId",
    { preHandler: [requireAuth, requireProjectWrite(fromNoteIdParam)] },
    async (request) => {
      const { noteId } = request.params as { noteId: string }
      const body = updateNoteSchema.parse(request.body)
      return service.updateProjectNote(noteId, body, request.user!.sub)
    },
  )

  app.delete(
    "/notes/:noteId",
    { preHandler: [requireAuth, requireProjectWrite(fromNoteIdParam)] },
    async (request, reply) => {
      const { noteId } = request.params as { noteId: string }
      await service.deleteProjectNote(noteId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Recordatorios ──
  app.get(
    "/reminders",
    { preHandler: [requireAuth, requireProjectRead(fromReminderQuery)] },
    async (request) => {
      const { entity, entityId } = request.query as { entity: string; entityId: string }
      return service.listReminders(reminderEntityEnum.parse(entity), entityId)
    },
  )

  app.post(
    "/reminders",
    { preHandler: [requireAuth, requireProjectWrite(fromReminderBody)] },
    async (request, reply) => {
      const body = z
        .object({ entity: reminderEntityEnum, entityId: z.string().uuid() })
        .merge(reminderSchema)
        .parse(request.body)
      const reminder = await service.createReminder({
        ...body,
        remindAt: new Date(body.remindAt),
        createdBy: request.user!.sub,
      })
      return reply.code(201).send(reminder)
    },
  )

  app.post(
    "/reminders/:reminderId/done",
    { preHandler: [requireAuth, requireProjectWrite(fromReminderIdParam)] },
    async (request) => {
      const { reminderId } = request.params as { reminderId: string }
      return service.markReminderDone(reminderId, request.user!.sub)
    },
  )

  app.delete(
    "/reminders/:reminderId",
    { preHandler: [requireAuth, requireProjectWrite(fromReminderIdParam)] },
    async (request, reply) => {
      const { reminderId } = request.params as { reminderId: string }
      await service.deleteReminder(reminderId, request.user!.sub)
      return reply.code(204).send()
    },
  )

  // ── Configuración de proyecto ──
  app.get(
    "/projects/:id/settings",
    { preHandler: [requireAuth, requireProjectAdmin(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      return service.getProjectSettings(id)
    },
  )

  app.patch(
    "/projects/:id/settings",
    { preHandler: [requireAuth, requireProjectAdmin(fromProjectIdParam)] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = settingsSchema.parse(request.body)
      return service.updateProjectSettings(id, body, request.user!.sub)
    },
  )

  // ── Resumen para el dashboard ──
  app.get(
    "/dashboard/summary",
    { preHandler: [requireAuth] },
    async (request) => {
      return service.getDashboardSummary(request.user!.sub)
    },
  )
}
