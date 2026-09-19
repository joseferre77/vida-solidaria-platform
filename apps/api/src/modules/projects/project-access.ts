/**
 * Autorización a nivel de UN proyecto puntual.
 *
 * Hasta ahora `projects.read/write/admin` (permissions.ts) eran los únicos
 * guardianes de las rutas de Proyectos — pero eso es un permiso GLOBAL, y
 * en `ROLE_PERMISSIONS` solo `direccion_proyectos` y `admin_general` lo
 * tienen. Un voluntario o coordinador agregado como `editor` de un
 * proyecto puntual (`ProjectMember.projectRole`) igual quedaba afuera de
 * TODO lo del módulo, porque nunca llegaba a que se chequeara su rol de
 * miembro: el `requirePermission("projects.write")` global lo cortaba
 * antes.
 *
 * Este archivo conecta las dos capas: para cualquier ruta que actúe sobre
 * un proyecto puntual, el acceso se concede si se cumple CUALQUIERA de:
 *   1. El usuario tiene el permiso global correspondiente
 *      (`projects.admin` siempre alcanza; `projects.write` alcanza para
 *      lectura/escritura; `projects.read` alcanza solo para lectura) —
 *      así `direccion_general`/`direccion_proyectos` siguen viendo/
 *      tocando todo sin que alguien los tenga que agregar como miembro de
 *      cada proyecto uno por uno.
 *   2. El usuario es `ProjectMember` de ESE proyecto con el `projectRole`
 *      que corresponda (cualquiera para leer, creador/editor/admin para
 *      escribir, admin para administrar).
 *
 * Cada ruta pasa un "resolver": una función que, a partir de los params/
 * query/body de la request, encuentra el `projectId` real (a veces es
 * directo, a veces hay que subir de tarea → columna → tablero → proyecto,
 * o de hito/proceso/gasto/nota → proyecto).
 */
import type { FastifyReply, FastifyRequest } from "fastify"
import type { ProjectRole } from "@prisma/client"
import { prisma } from "../../lib/prisma"

type Resolver = (request: FastifyRequest) => Promise<string | null>

const WRITE_ROLES: ProjectRole[] = ["creador", "editor", "admin"]

function globalPermissions(request: FastifyRequest): string[] {
  return request.user?.permissions ?? []
}

function hasGlobal(request: FastifyRequest, ...perms: string[]) {
  const owned = globalPermissions(request)
  return owned.includes("*") || perms.some((p) => owned.includes(p))
}

async function getMembership(projectId: string, userId: string) {
  return prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } })
}

function makeGuard(level: "read" | "write" | "admin", resolve: Resolver, extraGlobalPerms: string[] = []) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    if (!request.user) return reply.code(401).send({ error: "No autenticado" })

    // 1. Permiso global de módulo (oversight de dirección, admin general) —
    //    o algún permiso extra que la ruta puntual acepte (ej. finance.read
    //    para ver gastos aunque no tengas projects.read).
    const base =
      level === "read"
        ? ["projects.read", "projects.write", "projects.admin"]
        : level === "write"
          ? ["projects.write", "projects.admin"]
          : ["projects.admin"]
    if (hasGlobal(request, ...base, ...extraGlobalPerms)) return

    // 2. Rol como miembro de ESTE proyecto puntual.
    const projectId = await resolve(request)
    if (!projectId) return reply.code(404).send({ error: "No encontrado" })

    const membership = await getMembership(projectId, request.user.sub)
    if (!membership) {
      return reply.code(403).send({ error: "No sos miembro de este proyecto" })
    }
    if (level === "admin" && membership.projectRole !== "admin") {
      return reply.code(403).send({ error: "Necesitás rol admin en este proyecto" })
    }
    if (level === "write" && !WRITE_ROLES.includes(membership.projectRole)) {
      return reply.code(403).send({ error: "Tu rol en este proyecto es de solo lectura (visor)" })
    }
    // level === "read": cualquier projectRole alcanza.
  }
}

export const requireProjectRead = (resolve: Resolver, extraGlobalPerms: string[] = []) =>
  makeGuard("read", resolve, extraGlobalPerms)
export const requireProjectWrite = (resolve: Resolver, extraGlobalPerms: string[] = []) =>
  makeGuard("write", resolve, extraGlobalPerms)
export const requireProjectAdmin = (resolve: Resolver, extraGlobalPerms: string[] = []) =>
  makeGuard("admin", resolve, extraGlobalPerms)

/** Para /projects: dirección ve TODO el módulo; el resto solo sus proyectos. */
export function canSeeAllProjects(request: FastifyRequest): boolean {
  return hasGlobal(request, "projects.read", "projects.write", "projects.admin")
}

/**
 * PUT /custom-fields/:defId/values/:entityId es ambiguo a propósito: sirve
 * tanto para valores de Proyecto como de Caso (Módulo 3, todavía sin RBAC
 * propio). Si la definición es de PROYECTO, exigimos rol de escritura en
 * ESE proyecto puntual. Si es de CASO, no hay todavía un esquema de
 * autorización por caso — se deja pasar con el permiso global
 * `projects.write` (el mismo que ya exigía la ruta antes de esta guarda) y
 * queda anotado como pendiente para cuando se construya el módulo de
 * Casos.
 */
export async function guardCustomFieldValue(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user) return reply.code(401).send({ error: "No autenticado" })
  const { defId, entityId } = request.params as { defId: string; entityId: string }
  const definition = await prisma.customFieldDefinition.findUnique({ where: { id: defId } })
  if (!definition) return reply.code(404).send({ error: "Campo personalizado no encontrado" })

  if (definition.entity === "CASE") {
    if (hasGlobal(request, "projects.write", "projects.admin", "cases.write")) return
    return reply.code(403).send({ error: "Falta permiso para cargar campos de Casos" })
  }

  // entity === "PROJECT": entityId es un projectId real.
  return requireProjectWrite(async () => entityId)(request, reply)
}

// ────────────────────────────────────────────────
// Resolvers: de los params/query/body de cada ruta al projectId real.
// ────────────────────────────────────────────────

/** Rutas donde :id YA es el projectId (ej. /projects/:id, /projects/:id/tasks). */
export const fromProjectIdParam: Resolver = async (request) => {
  const { id } = request.params as { id: string }
  return id ?? null
}

/** Rutas donde :id es un taskId (ej. /tasks/:id, /tasks/:id/comments). */
export const fromTaskIdParam: Resolver = async (request) => {
  const { id } = request.params as { id: string }
  const task = await prisma.task.findUnique({
    where: { id },
    select: { boardColumn: { select: { board: { select: { projectId: true } } } } },
  })
  return task?.boardColumn.board.projectId ?? null
}

/** POST /tasks: no hay :id todavía, el proyecto se deduce de boardColumnId en el body. */
export const fromBoardColumnBody: Resolver = async (request) => {
  const body = request.body as { boardColumnId?: string }
  if (!body.boardColumnId) return null
  const column = await prisma.boardColumn.findUnique({
    where: { id: body.boardColumnId },
    select: { board: { select: { projectId: true } } },
  })
  return column?.board.projectId ?? null
}

export const fromMilestoneIdParam: Resolver = async (request) => {
  const { milestoneId } = request.params as { milestoneId: string }
  const m = await prisma.projectMilestone.findUnique({ where: { id: milestoneId }, select: { projectId: true } })
  return m?.projectId ?? null
}

export const fromProcessIdParam: Resolver = async (request) => {
  const { processId } = request.params as { processId: string }
  const p = await prisma.projectProcess.findUnique({ where: { id: processId }, select: { projectId: true } })
  return p?.projectId ?? null
}

export const fromProjectAttachmentIdParam: Resolver = async (request) => {
  const { attachmentId } = request.params as { attachmentId: string }
  const a = await prisma.projectAttachment.findUnique({ where: { id: attachmentId }, select: { projectId: true } })
  return a?.projectId ?? null
}

export const fromTaskAttachmentIdParam: Resolver = async (request) => {
  const { attachmentId } = request.params as { attachmentId: string }
  const a = await prisma.taskAttachment.findUnique({
    where: { id: attachmentId },
    select: { task: { select: { boardColumn: { select: { board: { select: { projectId: true } } } } } } },
  })
  return a?.task.boardColumn.board.projectId ?? null
}

export const fromChecklistItemIdParam: Resolver = async (request) => {
  const { itemId } = request.params as { itemId: string }
  const item = await prisma.taskChecklistItem.findUnique({
    where: { id: itemId },
    select: { task: { select: { boardColumn: { select: { board: { select: { projectId: true } } } } } } },
  })
  return item?.task.boardColumn.board.projectId ?? null
}

export const fromDependencyIdParam: Resolver = async (request) => {
  const { depId } = request.params as { depId: string }
  const dep = await prisma.taskDependency.findUnique({
    where: { id: depId },
    select: { blockerTask: { select: { boardColumn: { select: { board: { select: { projectId: true } } } } } } },
  })
  return dep?.blockerTask.boardColumn.board.projectId ?? null
}

export const fromTimeEntryIdParam: Resolver = async (request) => {
  const { entryId } = request.params as { entryId: string }
  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: { task: { select: { boardColumn: { select: { board: { select: { projectId: true } } } } } } },
  })
  return entry?.task.boardColumn.board.projectId ?? null
}

export const fromExpenseIdParam: Resolver = async (request) => {
  const { expenseId } = request.params as { expenseId: string }
  const e = await prisma.projectExpense.findUnique({ where: { id: expenseId }, select: { projectId: true } })
  return e?.projectId ?? null
}

export const fromNoteIdParam: Resolver = async (request) => {
  const { noteId } = request.params as { noteId: string }
  const n = await prisma.projectNote.findUnique({ where: { id: noteId }, select: { projectId: true } })
  return n?.projectId ?? null
}

/** Recordatorios: entity+entityId puede venir en el body (POST) o la query (GET). */
async function resolveReminderEntity(entity: string | undefined, entityId: string | undefined) {
  if (!entity || !entityId) return null
  if (entity === "PROJECT") return entityId
  if (entity === "TASK") {
    const task = await prisma.task.findUnique({
      where: { id: entityId },
      select: { boardColumn: { select: { board: { select: { projectId: true } } } } },
    })
    return task?.boardColumn.board.projectId ?? null
  }
  return null
}

export const fromReminderBody: Resolver = async (request) => {
  const body = request.body as { entity?: string; entityId?: string }
  return resolveReminderEntity(body.entity, body.entityId)
}

export const fromReminderQuery: Resolver = async (request) => {
  const query = request.query as { entity?: string; entityId?: string }
  return resolveReminderEntity(query.entity, query.entityId)
}

export const fromReminderIdParam: Resolver = async (request) => {
  const { reminderId } = request.params as { reminderId: string }
  const reminder = await prisma.reminder.findUnique({ where: { id: reminderId } })
  if (!reminder) return null
  return resolveReminderEntity(reminder.entity, reminder.entityId)
}
