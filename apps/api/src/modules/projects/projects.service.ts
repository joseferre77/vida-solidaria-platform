/**
 * Módulo 2 — Gestión de Proyectos.
 * Capa de servicio: toda la lógica de negocio vive acá, las rutas
 * (projects.routes.ts) solo validan input y traducen a HTTP.
 */
import { prisma } from "../../lib/prisma"
import type { ProjectRole, ProjectStatus, TaskPriority } from "@prisma/client"

const DEFAULT_COLUMNS = ["Backlog", "En curso", "Bloqueado", "Hecho"]

export async function listProjects() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      members: { select: { userId: true } },
      boards: {
        select: {
          columns: {
            select: {
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
    const now = new Date()
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      area: p.area,
      status: p.status,
      owner: p.owner,
      createdAt: p.createdAt,
      memberCount: p.members.length,
      taskCount: allTasks.length,
      overdueTaskCount: allTasks.filter((t) => t.dueDate && t.dueDate < now).length,
    }
  })
}

export async function createProject(input: {
  name: string
  description?: string
  area?: string
  ownerId: string
}) {
  return prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      area: input.area,
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
    },
    include: { boards: { include: { columns: true } }, members: true },
  })
}

export async function getProjectDetail(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      },
      boards: {
        include: {
          columns: {
            orderBy: { sortOrder: "asc" },
            include: {
              tasks: {
                orderBy: { createdAt: "asc" },
                include: {
                  assignees: {
                    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
                  },
                  _count: { select: { comments: true, attachments: true } },
                },
              },
            },
          },
        },
      },
    },
  })
}

export async function updateProject(
  projectId: string,
  input: Partial<{ name: string; description: string; area: string; status: ProjectStatus }>,
) {
  return prisma.project.update({ where: { id: projectId }, data: input })
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

export async function createTask(input: {
  boardColumnId: string
  title: string
  description?: string
  priority?: TaskPriority
  dueDate?: Date
  createdBy: string
}) {
  return prisma.task.create({
    data: {
      boardColumnId: input.boardColumnId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "media",
      dueDate: input.dueDate,
      createdBy: input.createdBy,
    },
  })
}

export async function updateTask(
  taskId: string,
  input: Partial<{
    title: string
    description: string | null
    priority: TaskPriority
    dueDate: Date | null
    boardColumnId: string
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

export async function getDashboardSummary(userId: string) {
  const [activeProjects, totalOpenTasks, myTasks, dueSoon] = await Promise.all([
    prisma.project.count({ where: { status: { in: ["planning", "active"] } } }),
    prisma.task.count({ where: { boardColumn: { name: { not: "Hecho" } } } }),
    prisma.task.count({ where: { assignees: { some: { userId } }, boardColumn: { name: { not: "Hecho" } } } }),
    prisma.task.count({
      where: {
        boardColumn: { name: { not: "Hecho" } },
        dueDate: { lte: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) },
      },
    }),
  ])

  return { activeProjects, totalOpenTasks, myTasks, dueSoon }
}
