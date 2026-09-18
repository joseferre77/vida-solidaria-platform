import type { FastifyInstance } from "fastify"
import { z, ZodError } from "zod"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import * as service from "./projects.service"

const createProjectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  area: z.string().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  area: z.string().optional(),
  status: z.enum(["planning", "active", "paused", "done"]).optional(),
})

const memberSchema = z.object({
  userId: z.string().uuid(),
  projectRole: z.enum(["creador", "editor", "visor", "admin"]).default("editor"),
})

const createTaskSchema = z.object({
  boardColumnId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  dueDate: z.string().datetime().optional(),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["baja", "media", "alta"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  boardColumnId: z.string().uuid().optional(),
})

const assigneeSchema = z.object({ userId: z.string().uuid() })
const commentSchema = z.object({ body: z.string().min(1) })

export async function projectsRoutes(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Datos inválidos", details: error.flatten() })
    }
    throw error
  })

  // ── Proyectos ──
  app.get("/projects", { preHandler: [requireAuth, requirePermission("projects.read")] }, async () => {
    return service.listProjects()
  })

  app.post("/projects", { preHandler: [requireAuth, requirePermission("projects.write")] }, async (request, reply) => {
    const body = createProjectSchema.parse(request.body)
    const project = await service.createProject({ ...body, ownerId: request.user!.sub })
    return reply.code(201).send(project)
  })

  app.get(
    "/projects/:id",
    { preHandler: [requireAuth, requirePermission("projects.read")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const project = await service.getProjectDetail(id)
      if (!project) return reply.code(404).send({ error: "Proyecto no encontrado" })
      return project
    },
  )

  app.patch(
    "/projects/:id",
    { preHandler: [requireAuth, requirePermission("projects.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = updateProjectSchema.parse(request.body)
      return service.updateProject(id, body)
    },
  )

  // ── Miembros ──
  app.post(
    "/projects/:id/members",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = memberSchema.parse(request.body)
      const member = await service.addProjectMember(id, body.userId, body.projectRole)
      return reply.code(201).send(member)
    },
  )

  app.delete(
    "/projects/:id/members/:userId",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await service.removeProjectMember(id, userId)
      return reply.code(204).send()
    },
  )

  // ── Tareas ──
  app.post("/tasks", { preHandler: [requireAuth, requirePermission("projects.write")] }, async (request, reply) => {
    const body = createTaskSchema.parse(request.body)
    const task = await service.createTask({
      ...body,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      createdBy: request.user!.sub,
    })
    return reply.code(201).send(task)
  })

  app.patch("/tasks/:id", { preHandler: [requireAuth, requirePermission("projects.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = updateTaskSchema.parse(request.body)
    return service.updateTask(id, {
      ...body,
      dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null,
    })
  })

  app.delete(
    "/tasks/:id",
    { preHandler: [requireAuth, requirePermission("projects.admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await service.deleteTask(id)
      return reply.code(204).send()
    },
  )

  app.post(
    "/tasks/:id/assignees",
    { preHandler: [requireAuth, requirePermission("projects.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = assigneeSchema.parse(request.body)
      const assignee = await service.assignTask(id, body.userId)
      return reply.code(201).send(assignee)
    },
  )

  app.delete(
    "/tasks/:id/assignees/:userId",
    { preHandler: [requireAuth, requirePermission("projects.write")] },
    async (request, reply) => {
      const { id, userId } = request.params as { id: string; userId: string }
      await service.unassignTask(id, userId)
      return reply.code(204).send()
    },
  )

  app.post(
    "/tasks/:id/comments",
    { preHandler: [requireAuth, requirePermission("projects.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = commentSchema.parse(request.body)
      const comment = await service.addTaskComment(id, request.user!.sub, body.body)
      return reply.code(201).send(comment)
    },
  )

  // ── Resumen para el dashboard ──
  app.get(
    "/dashboard/summary",
    { preHandler: [requireAuth, requirePermission("projects.read")] },
    async (request) => {
      return service.getDashboardSummary(request.user!.sub)
    },
  )
}
