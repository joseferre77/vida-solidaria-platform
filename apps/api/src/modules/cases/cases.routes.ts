/**
 * Fase K bloque D — asignación de casos con roles + notificaciones por
 * email: ver `CASE_ASSIGNMENT_ROLES` y las rutas `/cases/:id/assignments`
 * más abajo, y los `notify(...)` agregados en contactos y cambio de
 * estado. Decisión de diseño (quedaba como pregunta abierta en
 * PLAN_FASE_K.md): "estado de cierre" = `CaseStatus.cerrado` (ya existía
 * como valor del enum), NO `feasibility: no_factible` — son ejes
 * distintos (factibilidad de extracción vs. si el caso sigue abierto), y
 * `cerrado` es más directo para "se terminó el seguimiento de este caso".
 *
 * Módulo: Casos sociales (permiso `cases.read` / `cases.write`).
 *
 * Fase J — reemplazo de la planilla en papel de relevamiento. El endpoint
 * clave es `POST /cases`: un voluntario en la calle, desde el celular,
 * carga una persona/pareja/grupo con su diagnóstico situacional inicial,
 * una ubicación (GPS del momento) y opcionalmente necesidades/habilidades/
 * fotos ya en la misma carga. El resto de las rutas son para el
 * seguimiento posterior (Mesa de Coordinación): bitácora de contactos,
 * cambios de estado, nuevas ubicaciones, más fotos, etc.
 *
 * El número de caso (`C000123`) sale de `Counter` (ya existía en el
 * schema desde Milestone 1, sin usar hasta ahora) con un upsert atómico —
 * no depende de ningún trigger de Postgres.
 *
 * Integrantes (Fase J.1): cuando `caseType` es "pareja" o "grupo_familiar",
 * los campos de persona en `Case` (fullName, dni, healthStatus, etc.)
 * representan al REFERENTE del grupo — el resto de los integrantes vive en
 * `CaseMember`, cada uno con sus propios datos, diagnóstico y necesidades/
 * habilidades (que pueden ser del integrante puntual o del grupo en
 * general — `CaseNeed`/`CaseSkill` tienen `caseMemberId` opcional para eso).
 *
 * Nota de schema (igual que en field-ops/logistics): `Case.createdBy`/
 * `updatedBy`, `CaseContactHistory.userId`, `CaseLocation.recordedBy`,
 * `CasePhoto.uploadedBy` y `CaseStatusHistory.changedBy` son campos
 * sueltos sin relación de Prisma hacia `User` — se resuelven con una
 * consulta aparte.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { notify, usersWithPermission } from "../../lib/notify"
// Import cruzado a Proyectos para la auto-conversión de casos (bloque
// post-Fase-K "Casos II") — mismo patrón ya usado por analytics.routes.ts
// (que importa `listProjects` de este mismo service), no es la primera vez
// que un módulo importa del service de otro.
import { createProject, linkCase } from "../projects/projects.service"

const CASE_TYPES = ["individual", "pareja", "grupo_familiar"] as const
const STAY_TYPES = ["calle", "parador_temporal"] as const
const VIABILITIES = ["alta", "media", "baja"] as const
const FEASIBILITIES = ["factible", "no_factible", "en_pausa"] as const
const CASE_STATUSES = ["activo", "en_seguimiento", "derivado", "cerrado"] as const
const NEED_CATEGORIES = ["salud", "documentacion", "abrigo", "alimentacion", "vivienda", "laboral", "otro"] as const
const NEED_URGENCIES = ["inmediata", "urgente", "normal"] as const
const CASE_ASSIGNMENT_ROLES = [
  "coordinador",
  "visitador_social",
  "psicologo",
  "seguimiento_laboral",
  "seguimiento_conducta",
] as const

const CASE_ASSIGNMENT_ROLE_LABEL: Record<(typeof CASE_ASSIGNMENT_ROLES)[number], string> = {
  coordinador: "Coordinador/a",
  visitador_social: "Visitador/a social",
  psicologo: "Psicólogo/a",
  seguimiento_laboral: "Seguimiento laboral",
  seguimiento_conducta: "Seguimiento de conducta",
}

const assignmentSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(CASE_ASSIGNMENT_ROLES),
})

const needInputSchema = z.object({
  category: z.enum(NEED_CATEGORIES),
  urgency: z.enum(NEED_URGENCIES),
  notes: z.string().trim().optional(),
})

const skillInputSchema = z.object({
  skillLabel: z.string().min(1),
  level: z.string().trim().optional(),
})

const memberInputSchema = z.object({
  fullName: z.string().min(2, "El nombre del integrante es obligatorio"),
  alias: z.string().trim().optional(),
  approxAge: z.number().int().positive().optional(),
  dni: z.string().trim().optional(),
  sex: z.string().trim().optional(),
  healthStatus: z.string().trim().optional(),
  wantsToWork: z.boolean().optional(),
  workAptitude: z.string().trim().optional(),
  legalSituation: z.string().trim().optional(),
  substanceUse: z.string().trim().optional(),
  needs: z.array(needInputSchema).optional(),
  skills: z.array(skillInputSchema).optional(),
  photoUrls: z.array(z.string().url()).optional(),
})

const updateMemberSchema = z.object({
  fullName: z.string().min(2).optional(),
  alias: z.string().trim().nullable().optional(),
  approxAge: z.number().int().positive().nullable().optional(),
  dni: z.string().trim().nullable().optional(),
  sex: z.string().trim().nullable().optional(),
  healthStatus: z.string().trim().nullable().optional(),
  wantsToWork: z.boolean().nullable().optional(),
  workAptitude: z.string().trim().nullable().optional(),
  legalSituation: z.string().trim().nullable().optional(),
  substanceUse: z.string().trim().nullable().optional(),
})

const createCaseSchema = z.object({
  fullName: z.string().min(2, "El nombre es obligatorio"),
  alias: z.string().trim().optional(),
  approxAge: z.number().int().positive().optional(),
  caseType: z.enum(CASE_TYPES).default("individual"),
  dni: z.string().trim().optional(),
  sex: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  healthStatus: z.string().trim().optional(),
  currentSleepSpot: z.string().trim().optional(),
  dayZone: z.string().trim().optional(),
  stayType: z.enum(STAY_TYPES).optional(),
  wantsToWork: z.boolean().optional(),
  workAptitude: z.string().trim().optional(),
  legalSituation: z.string().trim().optional(),
  substanceUse: z.string().trim().optional(),
  mainPhotoUrl: z.string().url().optional(),
  // Toda carga de campo trae al menos una ubicación (de dónde se relevó).
  location: z.object({ lat: z.number(), lng: z.number() }),
  // Fase K bloque E: lo manda el frontend con el momento en que se abrió
  // el formulario "Nuevo caso" (no ahora, al guardar) — ver nota en el
  // schema. Opcional por si algún cliente viejo no lo manda todavía.
  surveyStartedAt: z.string().datetime().optional(),
  needs: z.array(needInputSchema).optional(),
  skills: z.array(skillInputSchema).optional(),
  photoUrls: z.array(z.string().url()).optional(),
  // Solo tiene sentido con caseType "pareja" / "grupo_familiar" — el resto
  // del grupo aparte del referente cargado arriba.
  members: z.array(memberInputSchema).optional(),
})

const updateCaseSchema = z.object({
  fullName: z.string().min(2).optional(),
  alias: z.string().trim().nullable().optional(),
  approxAge: z.number().int().positive().nullable().optional(),
  caseType: z.enum(CASE_TYPES).optional(),
  dni: z.string().trim().nullable().optional(),
  sex: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  healthStatus: z.string().trim().nullable().optional(),
  currentSleepSpot: z.string().trim().nullable().optional(),
  dayZone: z.string().trim().nullable().optional(),
  stayType: z.enum(STAY_TYPES).nullable().optional(),
  wantsToWork: z.boolean().nullable().optional(),
  workAptitude: z.string().trim().nullable().optional(),
  legalSituation: z.string().trim().nullable().optional(),
  substanceUse: z.string().trim().nullable().optional(),
  mainPhotoUrl: z.string().url().nullable().optional(),
  viability: z.enum(VIABILITIES).nullable().optional(),
  feasibility: z.enum(FEASIBILITIES).nullable().optional(),
})

const statusChangeSchema = z.object({
  status: z.enum(CASE_STATUSES),
  closeReason: z.string().trim().optional(),
})

const contactSchema = z.object({
  notes: z.string().min(1),
  moodObserved: z.string().trim().optional(),
})

const locationSchema = z.object({ lat: z.number(), lng: z.number() })
const photoSchema = z.object({ url: z.string().url() })

async function userMapFor(ids: (string | null | undefined)[]) {
  const uniqueIds = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
  if (uniqueIds.length === 0) return new Map<string, { id: string; name: string; email: string }>()
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true, email: true },
  })
  return new Map(users.map((u) => [u.id, u]))
}

/** userIds únicos con asignación ACTIVA (unassignedAt null) a un caso,
 * opcionalmente sin contar a `excludeUserId` (ej. quien acaba de cargar la
 * evolución no necesita que se le notifique a sí mismo). */
async function activeAssigneeIds(caseId: string, excludeUserId?: string) {
  const assignments = await prisma.caseAssignment.findMany({
    where: { caseId, unassignedAt: null },
    select: { userId: true },
  })
  const ids = Array.from(new Set(assignments.map((a) => a.userId)))
  return excludeUserId ? ids.filter((id) => id !== excludeUserId) : ids
}

async function nextCaseNumber() {
  const counter = await prisma.counter.upsert({
    where: { name: "case_number" },
    update: { value: { increment: 1 } },
    create: { name: "case_number", value: 1 },
  })
  return `C${String(counter.value).padStart(6, "0")}`
}

// ────────────────────────────────────────────────
// Auditoría mínima (AuditLog) — pedido explícito de Josecito: "quien baja
// información, quien modifica" en los casos, mientras la Auditoría
// completa queda pospuesta ("continuamos después con armar una
// Auditoría"). Mismo patrón que `logActivity` en projects.service.ts —
// se duplica acá en vez de importarlo para no acoplar los dos módulos más
// de lo necesario (el import cruzado de arriba ya es el mínimo indispensable
// para la auto-conversión a Proyecto).
async function logActivity(actorId: string, entityType: string, entityId: string, action: string, diff?: unknown) {
  try {
    await prisma.auditLog.create({
      data: { userId: actorId, entityType, entityId, action, diff: diff === undefined ? undefined : (diff as never) },
    })
  } catch {
    // La auditoría nunca debe tirar abajo la operación real que la generó.
  }
}

const CASE_DETAIL_INCLUDE = {
  contactsHistory: { orderBy: { contactedAt: "desc" as const } },
  locations: { orderBy: { recordedAt: "desc" as const } },
  // Solo fotos del caso/referente acá — las de cada integrante van dentro
  // de `members[].photos` (ver abajo), para no duplicarlas ni mezclarlas.
  photos: { where: { caseMemberId: null }, orderBy: { takenAt: "desc" as const } },
  skills: true,
  needs: { orderBy: { createdAt: "desc" as const } },
  statusHistory: { orderBy: { changedAt: "desc" as const } },
  assignments: { orderBy: { assignedAt: "desc" as const } },
  // Proyecto(s) vinculado(s) — normalmente uno solo (el que generó la
  // auto-conversión o el que se vinculó a mano desde Proyectos), pero
  // ProjectCase es muchos-a-muchos así que se listan todos por las dudas.
  projects: { include: { project: { select: { id: true, code: true, name: true, status: true } } } },
  members: {
    orderBy: { createdAt: "asc" as const },
    include: {
      needs: { orderBy: { createdAt: "desc" as const } },
      skills: true,
      photos: { orderBy: { takenAt: "desc" as const } },
    },
  },
}

function serializeNeed(x: any) {
  return {
    id: x.id,
    category: x.category,
    urgency: x.urgency,
    notes: x.notes,
    resolvedAt: x.resolvedAt,
    createdAt: x.createdAt,
  }
}

function serializeSkill(x: any) {
  return { id: x.id, skillLabel: x.skillLabel, level: x.level }
}

function serializePhoto(x: any, users: Map<string, { id: string; name: string; email: string }>) {
  return { id: x.id, url: x.url, takenAt: x.takenAt, uploadedBy: users.get(x.uploadedBy) ?? null }
}

async function serializeCaseDetail(c: any) {
  const users = await userMapFor([
    c.createdBy,
    c.updatedBy,
    ...c.contactsHistory.map((x: any) => x.userId),
    ...c.locations.map((x: any) => x.recordedBy),
    ...c.photos.map((x: any) => x.uploadedBy),
    ...c.statusHistory.map((x: any) => x.changedBy),
    ...c.assignments.map((x: any) => x.userId),
    ...c.members.flatMap((m: any) => m.photos.map((p: any) => p.uploadedBy)),
  ])
  return {
    id: c.id,
    caseNumber: c.caseNumber,
    fullName: c.fullName,
    alias: c.alias,
    approxAge: c.approxAge,
    mainPhotoUrl: c.mainPhotoUrl,
    healthStatus: c.healthStatus,
    currentSleepSpot: c.currentSleepSpot,
    status: c.status,
    caseType: c.caseType,
    dni: c.dni,
    sex: c.sex,
    phone: c.phone,
    dayZone: c.dayZone,
    stayType: c.stayType,
    wantsToWork: c.wantsToWork,
    workAptitude: c.workAptitude,
    legalSituation: c.legalSituation,
    substanceUse: c.substanceUse,
    viability: c.viability,
    feasibility: c.feasibility,
    closeReason: c.closeReason,
    surveyStartedAt: c.surveyStartedAt,
    createdAt: c.createdAt,
    createdBy: users.get(c.createdBy) ?? null,
    updatedBy: c.updatedBy ? (users.get(c.updatedBy) ?? null) : null,
    contactsHistory: c.contactsHistory.map((x: any) => ({
      id: x.id,
      notes: x.notes,
      moodObserved: x.moodObserved,
      contactedAt: x.contactedAt,
      user: users.get(x.userId) ?? null,
    })),
    locations: c.locations.map((x: any) => ({
      id: x.id,
      lat: x.lat,
      lng: x.lng,
      recordedAt: x.recordedAt,
      recordedBy: users.get(x.recordedBy) ?? null,
    })),
    photos: c.photos.map((x: any) => serializePhoto(x, users)),
    skills: c.skills.map(serializeSkill),
    needs: c.needs.map(serializeNeed),
    statusHistory: c.statusHistory.map((x: any) => ({
      toStatus: x.toStatus,
      fromStatus: x.fromStatus,
      changedAt: x.changedAt,
      changedBy: users.get(x.changedBy) ?? null,
    })),
    assignments: c.assignments.map((x: any) => ({
      id: x.id,
      user: users.get(x.userId) ?? null,
      role: x.role,
      roleLabel: CASE_ASSIGNMENT_ROLE_LABEL[x.role as (typeof CASE_ASSIGNMENT_ROLES)[number]],
      assignedAt: x.assignedAt,
      unassignedAt: x.unassignedAt,
    })),
    projects: c.projects.map((x: any) => ({ id: x.project.id, code: x.project.code, name: x.project.name, status: x.project.status })),
    members: c.members.map((m: any) => ({
      id: m.id,
      fullName: m.fullName,
      alias: m.alias,
      approxAge: m.approxAge,
      dni: m.dni,
      sex: m.sex,
      healthStatus: m.healthStatus,
      wantsToWork: m.wantsToWork,
      workAptitude: m.workAptitude,
      legalSituation: m.legalSituation,
      substanceUse: m.substanceUse,
      createdAt: m.createdAt,
      needs: m.needs.map(serializeNeed),
      skills: m.skills.map(serializeSkill),
      photos: m.photos.map((x: any) => serializePhoto(x, users)),
    })),
  }
}

export async function casesRoutes(app: FastifyInstance) {
  // Fase K bloque "Casos II" (pedido de Josecito 22/09/2026) — buscador y
  // filtros que faltaban en el listado: nombre/alias/dni (`q`, mismo
  // criterio insensible a mayúsculas que /cases/search), rango de fecha de
  // carga, tipo de caso, sexo y "vinculado a proyecto" (`linkedToProject`),
  // combinables entre sí y con el filtro de estado que ya existía. También
  // se agrega `projectId` a cada fila (el primer proyecto vinculado, si
  // hay) para poder pintar el badge "En proyecto" y navegar directo sin
  // pedir el detalle completo del caso.
  app.get("/cases", { preHandler: [requireAuth, requirePermission("cases.read")] }, async (request) => {
    const { status, q, dateFrom, dateTo, caseType, sex, linkedToProject } = request.query as {
      status?: string
      q?: string
      dateFrom?: string
      dateTo?: string
      caseType?: string
      sex?: string
      linkedToProject?: string
    }
    const query = (q ?? "").trim()
    const textFilter = (field: "fullName" | "alias" | "dni") => ({
      [field]: { contains: query, mode: "insensitive" as const },
    })

    const cases = await prisma.case.findMany({
      where: {
        status: (status as (typeof CASE_STATUSES)[number]) || undefined,
        caseType: (caseType as (typeof CASE_TYPES)[number]) || undefined,
        sex: sex || undefined,
        ...(query.length >= 2 ? { OR: [textFilter("fullName"), textFilter("alias"), textFilter("dni")] } : {}),
        ...(dateFrom || dateTo
          ? { createdAt: { gte: dateFrom ? new Date(dateFrom) : undefined, lte: dateTo ? new Date(dateTo) : undefined } }
          : {}),
        ...(linkedToProject === "true" ? { projects: { some: {} } } : {}),
        ...(linkedToProject === "false" ? { projects: { none: {} } } : {}),
      },
      include: { needs: true, members: { select: { id: true } }, projects: { select: { projectId: true }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      fullName: c.fullName,
      alias: c.alias,
      approxAge: c.approxAge,
      mainPhotoUrl: c.mainPhotoUrl,
      status: c.status,
      caseType: c.caseType,
      sex: c.sex,
      viability: c.viability,
      feasibility: c.feasibility,
      createdAt: c.createdAt,
      openNeedsCount: c.needs.filter((n) => !n.resolvedAt).length,
      memberCount: c.members.length,
      projectId: c.projects[0]?.projectId ?? null,
    }))
  })

  // Cabecera de KPIs de /casos (pedido de Josecito 22/09/2026): conteos
  // simples, todo en un solo `groupBy` de estado + 2 counts puntuales, sin
  // N+1. "Relevados el último domingo" usa el domingo más próximo hacia
  // atrás (incluido hoy si hoy es domingo) en huso horario de Argentina,
  // porque la organización sale a relevar los domingos (ver manual de
  // marca: "Salimos todos los domingos a las 19 hs") — no es una ventana
  // de "últimos 7 días" genérica.
  app.get("/cases/kpis", { preHandler: [requireAuth, requirePermission("cases.read")] }, async () => {
    const nowAR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
    const lastSunday = new Date(nowAR)
    lastSunday.setDate(nowAR.getDate() - nowAR.getDay())
    lastSunday.setHours(0, 0, 0, 0)
    const nextSunday = new Date(lastSunday)
    nextSunday.setDate(lastSunday.getDate() + 7)

    const [byStatus, relevadosUltimoDomingo, enProyecto, total] = await Promise.all([
      prisma.case.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.case.count({ where: { createdAt: { gte: lastSunday, lt: nextSunday } } }),
      prisma.case.count({ where: { projects: { some: {} } } }),
      prisma.case.count(),
    ])
    const statusCounts = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0])) as Record<
      (typeof CASE_STATUSES)[number],
      number
    >
    for (const row of byStatus) statusCounts[row.status] = row._count._all

    return {
      total,
      activo: statusCounts.activo,
      enSeguimiento: statusCounts.en_seguimiento,
      derivado: statusCounts.derivado,
      cerrado: statusCounts.cerrado,
      enProyecto,
      relevadosUltimoDomingo,
    }
  })

  // Fase K bloque E — buscador anti-duplicados: primer paso del flujo
  // "Nuevo caso" en el frontend, para chequear si la persona ya está
  // cargada (como referente O como integrante de un grupo/pareja) antes
  // de crear un caso nuevo. `q` busca por nombre, alias o DNI con
  // coincidencia parcial e insensible a mayúsculas — igual criterio en
  // los tres campos. Requiere al menos 2 caracteres para no traer medio
  // padrón con una sola letra.
  app.get("/cases/search", { preHandler: [requireAuth, requirePermission("cases.read")] }, async (request) => {
    const { q } = request.query as { q?: string }
    const query = (q ?? "").trim()
    if (query.length < 2) return []

    const textFilter = (field: "fullName" | "alias" | "dni") => ({
      [field]: { contains: query, mode: "insensitive" as const },
    })

    const [directMatches, memberMatches] = await Promise.all([
      prisma.case.findMany({
        where: { OR: [textFilter("fullName"), textFilter("alias"), textFilter("dni")] },
        select: { id: true, caseNumber: true, fullName: true, alias: true, dni: true, status: true, caseType: true },
        take: 20,
      }),
      prisma.caseMember.findMany({
        where: { OR: [textFilter("fullName"), textFilter("alias"), textFilter("dni")] },
        select: {
          fullName: true,
          case: {
            select: { id: true, caseNumber: true, fullName: true, alias: true, dni: true, status: true, caseType: true },
          },
        },
        take: 20,
      }),
    ])

    // Un mismo caso puede aparecer por las dos vías (ej. coincide el
    // referente Y un integrante) — se deduplica por id de caso, y si
    // matcheó por un integrante se guarda su nombre para mostrarlo
    // ("via integrante: Juan Pérez") y que quien busca entienda por qué
    // apareció ese caso.
    const results = new Map<string, { id: string; caseNumber: string; fullName: string; alias: string | null; dni: string | null; status: string; caseType: string; matchedMember: string | null }>()
    for (const c of directMatches) {
      results.set(c.id, { ...c, matchedMember: null })
    }
    for (const m of memberMatches) {
      if (!results.has(m.case.id)) {
        results.set(m.case.id, { ...m.case, matchedMember: m.fullName })
      }
    }
    return Array.from(results.values()).slice(0, 20)
  })

  app.get("/cases/:id", { preHandler: [requireAuth, requirePermission("cases.read")] }, async (request) => {
    const { id } = request.params as { id: string }
    const c = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
    return serializeCaseDetail(c)
  })

  app.post("/cases", { preHandler: [requireAuth, requirePermission("cases.write")] }, async (request, reply) => {
    const body = createCaseSchema.parse(request.body)
    const userId = request.user!.sub
    const caseNumber = await nextCaseNumber()

    // Los integrantes adicionales (pareja/grupo familiar) necesitan el id
    // del caso ya creado para poder cargar sus propias necesidades/
    // habilidades (CaseNeed/CaseSkill requieren caseId además de
    // caseMemberId) — por eso el caso se crea primero y los integrantes
    // se agregan después, todo dentro de la misma transacción.
    const created = await prisma.$transaction(async (tx) => {
      const caseRecord = await tx.case.create({
        data: {
          caseNumber,
          fullName: body.fullName,
          alias: body.alias,
          approxAge: body.approxAge,
          caseType: body.caseType,
          dni: body.dni,
          sex: body.sex,
          phone: body.phone,
          healthStatus: body.healthStatus,
          currentSleepSpot: body.currentSleepSpot,
          dayZone: body.dayZone,
          stayType: body.stayType,
          wantsToWork: body.wantsToWork,
          workAptitude: body.workAptitude,
          legalSituation: body.legalSituation,
          substanceUse: body.substanceUse,
          mainPhotoUrl: body.mainPhotoUrl,
          surveyStartedAt: body.surveyStartedAt ? new Date(body.surveyStartedAt) : undefined,
          createdBy: userId,
          locations: { create: { lat: body.location.lat, lng: body.location.lng, recordedBy: userId } },
          needs: body.needs?.length ? { create: body.needs } : undefined,
          skills: body.skills?.length ? { create: body.skills } : undefined,
          photos: body.photoUrls?.length
            ? { create: body.photoUrls.map((url) => ({ url, uploadedBy: userId })) }
            : undefined,
          statusHistory: { create: { toStatus: "activo", changedBy: userId } },
        },
      })

      for (const m of body.members ?? []) {
        await tx.caseMember.create({
          data: {
            caseId: caseRecord.id,
            fullName: m.fullName,
            alias: m.alias,
            approxAge: m.approxAge,
            dni: m.dni,
            sex: m.sex,
            healthStatus: m.healthStatus,
            wantsToWork: m.wantsToWork,
            workAptitude: m.workAptitude,
            legalSituation: m.legalSituation,
            substanceUse: m.substanceUse,
            needs: m.needs?.length ? { create: m.needs.map((n) => ({ ...n, caseId: caseRecord.id })) } : undefined,
            skills: m.skills?.length ? { create: m.skills.map((s) => ({ ...s, caseId: caseRecord.id })) } : undefined,
            photos: m.photoUrls?.length
              ? { create: m.photoUrls.map((url) => ({ url, uploadedBy: userId, caseId: caseRecord.id })) }
              : undefined,
          },
        })
      }

      return tx.case.findUniqueOrThrow({ where: { id: caseRecord.id }, include: CASE_DETAIL_INCLUDE })
    })
    await logActivity(userId, "case", created.id, "created", { caseNumber, fullName: body.fullName })

    const notifyIds = (await usersWithPermission("cases.read")).map((u) => u.id).filter((id) => id !== userId)
    if (notifyIds.length > 0) {
      await notify(notifyIds, {
        title: `Caso nuevo: ${created.caseNumber}`,
        link: `/casos/${created.id}`,
        type: "case_created",
      })
    }

    return reply.code(201).send(await serializeCaseDetail(created))
  })

  // Decisión de diseño (pedido de Josecito 22/09/2026, "ayudame vos"):
  // Viabilidad = qué tan viable es la situación de LA PERSONA para llevar
  // el caso a buen término (salud, redes, voluntad propia — alta/media/
  // baja). Factibilidad = si es factible para VIDA SOLIDARIA intervenir
  // AHORA con los recursos/capacidad operativa del equipo (factible/
  // no_factible/en_pausa). Dejan de ser redundantes: uno mira a la
  // persona, el otro a la organización. Cuando cualquiera de los dos dice
  // "sí, avancemos" (viability alta/media, o feasibility factible) y el
  // caso todavía no tiene un Proyecto vinculado, se auto-convierte: se crea
  // un Proyecto, se linkea (ProjectCase) y si el caso seguía "activo" pasa
  // a "en_seguimiento" (que es, en la práctica, "tiene un proyecto interno
  // en curso"). Es idempotente: el guard es "no tiene proyecto vinculado
  // todavía", así que ediciones posteriores no duplican el proyecto.
  app.patch("/cases/:id", { preHandler: [requireAuth, requirePermission("cases.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = updateCaseSchema.parse(request.body)
    const actorId = request.user!.sub
    const before = await prisma.case.findUniqueOrThrow({ where: { id } })

    const nextViability = body.viability !== undefined ? body.viability : before.viability
    const nextFeasibility = body.feasibility !== undefined ? body.feasibility : before.feasibility
    const triggersProject = nextViability === "alta" || nextViability === "media" || nextFeasibility === "factible"
    const existingLink = triggersProject ? await prisma.projectCase.findFirst({ where: { caseId: id } }) : null
    const shouldAutoConvert = triggersProject && !existingLink
    const shouldBumpStatus = shouldAutoConvert && before.status === "activo"

    const updated = await prisma.case.update({
      where: { id },
      data: {
        ...body,
        updatedBy: actorId,
        ...(shouldBumpStatus
          ? {
              status: "en_seguimiento" as const,
              statusHistory: { create: { fromStatus: before.status, toStatus: "en_seguimiento", changedBy: actorId } },
            }
          : {}),
      },
      include: CASE_DETAIL_INCLUDE,
    })
    await logActivity(actorId, "case", id, "updated", body)

    let finalCase = updated
    if (shouldAutoConvert) {
      const project = await createProject({
        name: `Caso ${updated.caseNumber} — ${updated.fullName}`,
        description:
          "Proyecto creado automáticamente al evaluar el caso como viable y/o factible (ver Casos > detalle del caso).",
        area: "Casos sociales",
        priority: nextViability === "alta" ? "alta" : "media",
        ownerId: actorId,
      })
      await linkCase(project.id, id, actorId)

      const notifyIds = Array.from(new Set([...(await activeAssigneeIds(id)), actorId]))
      await notify(notifyIds, {
        title: `Caso convertido a proyecto: ${updated.caseNumber}`,
        body: `${updated.fullName} — se creó el proyecto ${project.code} a partir de la evaluación de viabilidad/factibilidad.`,
        link: `/proyectos/${project.id}`,
        type: "case_converted_to_project",
        email: {
          subject: `Vida Solidaria — el caso ${updated.caseNumber} pasó a Proyecto`,
          html: `<p>El caso <strong>${updated.caseNumber} — ${updated.fullName}</strong> se convirtió automáticamente en el proyecto <strong>${project.code} — ${project.name}</strong>.</p>`,
        },
      })

      finalCase = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
    }

    return serializeCaseDetail(finalCase)
  })

  app.patch(
    "/cases/:id/status",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id } = request.params as { id: string }
      const body = statusChangeSchema.parse(request.body)
      const current = await prisma.case.findUniqueOrThrow({ where: { id } })
      const updated = await prisma.case.update({
        where: { id },
        data: {
          status: body.status,
          closeReason: body.status === "cerrado" ? body.closeReason : current.closeReason,
          updatedBy: request.user!.sub,
          statusHistory: { create: { fromStatus: current.status, toStatus: body.status, changedBy: request.user!.sub } },
        },
        include: CASE_DETAIL_INCLUDE,
      })
      await logActivity(request.user!.sub, "case", id, "status_changed", { from: current.status, to: body.status })

      // "Estado de cierre" = CaseStatus.cerrado (ver nota de diseño arriba
      // del archivo) — se avisa al equipo asignado con el motivo, si el
      // caso no estaba ya cerrado antes (evita reenviar el mismo aviso si
      // se vuelve a guardar el mismo estado).
      if (body.status === "cerrado" && current.status !== "cerrado") {
        const notifyIds = await activeAssigneeIds(id)
        await notify(notifyIds, {
          title: `Caso cerrado: ${updated.caseNumber}`,
          body: body.closeReason || "Sin motivo especificado.",
          link: "/casos",
          type: "case_closed",
          email: {
            subject: `Vida Solidaria — se cerró el caso ${updated.caseNumber} (${updated.fullName})`,
            html: `<p>Se cerró el caso <strong>${updated.caseNumber} — ${updated.fullName}</strong>.</p><p><strong>Motivo:</strong> ${body.closeReason || "Sin motivo especificado."}</p>`,
          },
        })
      }

      return serializeCaseDetail(updated)
    },
  )

  // Auditoría mínima del export a PDF (pedido explícito de Josecito: "con
  // una auditoría de quien baja información" — la Auditoría completa se
  // deja para después, esto es lo puntual para el botón de exportar). El
  // frontend llama este endpoint justo antes de disparar la descarga/
  // compartir del PDF de perfil de caso.
  app.post(
    "/cases/:id/export-log",
    { preHandler: [requireAuth, requirePermission("cases.read")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { via } = z.object({ via: z.enum(["descarga", "compartir"]).default("descarga") }).parse(request.body ?? {})
      await logActivity(request.user!.sub, "case", id, "exported_pdf", { via })
      return reply.code(204).send()
    },
  )

  app.post(
    "/cases/:id/contacts",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = contactSchema.parse(request.body)
      const author = request.user!.sub
      const [, caseRecord] = await Promise.all([
        prisma.caseContactHistory.create({ data: { caseId: id, userId: author, ...body } }),
        prisma.case.findUniqueOrThrow({ where: { id } }),
      ])

      // Aviso a todo el equipo asignado (menos a quien la cargó) de que hay
      // una entrada nueva en la bitácora — así no dependen de entrar a
      // revisar el caso para enterarse de una evolución.
      const notifyIds = await activeAssigneeIds(id, author)
      await notify(notifyIds, {
        title: `Nueva evolución en el caso ${caseRecord.caseNumber}`,
        body: body.notes.length > 140 ? `${body.notes.slice(0, 140)}…` : body.notes,
        link: "/casos",
        type: "case_contact",
        email: {
          subject: `Vida Solidaria — nueva evolución en el caso ${caseRecord.caseNumber} (${caseRecord.fullName})`,
          html: `<p>Se cargó una nueva entrada en la bitácora del caso <strong>${caseRecord.caseNumber} — ${caseRecord.fullName}</strong>:</p><p>${body.notes}</p>`,
        },
      })

      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.post(
    "/cases/:id/locations",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = locationSchema.parse(request.body)
      await prisma.caseLocation.create({ data: { caseId: id, recordedBy: request.user!.sub, ...body } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.post(
    "/cases/:id/photos",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = photoSchema.parse(request.body)
      await prisma.casePhoto.create({ data: { caseId: id, uploadedBy: request.user!.sub, ...body } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.post("/cases/:id/needs", { preHandler: [requireAuth, requirePermission("cases.write")] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = needInputSchema.parse(request.body)
    await prisma.caseNeed.create({ data: { caseId: id, ...body } })
    const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
    return reply.code(201).send(await serializeCaseDetail(updated))
  })

  app.patch(
    "/cases/:id/needs/:needId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, needId } = request.params as { id: string; needId: string }
      const { resolved } = z.object({ resolved: z.boolean() }).parse(request.body)
      await prisma.caseNeed.update({ where: { id: needId }, data: { resolvedAt: resolved ? new Date() : null } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  app.post("/cases/:id/skills", { preHandler: [requireAuth, requirePermission("cases.write")] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = skillInputSchema.parse(request.body)
    await prisma.caseSkill.create({ data: { caseId: id, ...body } })
    const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
    return reply.code(201).send(await serializeCaseDetail(updated))
  })

  app.delete(
    "/cases/:id/skills/:skillId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, skillId } = request.params as { id: string; skillId: string }
      await prisma.caseSkill.delete({ where: { id: skillId } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  // ── Integrantes (pareja / grupo familiar) ──

  app.post(
    "/cases/:id/members",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = memberInputSchema.parse(request.body)
      const userId = request.user!.sub
      await prisma.caseMember.create({
        data: {
          caseId: id,
          fullName: body.fullName,
          alias: body.alias,
          approxAge: body.approxAge,
          dni: body.dni,
          sex: body.sex,
          healthStatus: body.healthStatus,
          wantsToWork: body.wantsToWork,
          workAptitude: body.workAptitude,
          legalSituation: body.legalSituation,
          substanceUse: body.substanceUse,
          needs: body.needs?.length ? { create: body.needs.map((n) => ({ ...n, caseId: id })) } : undefined,
          skills: body.skills?.length ? { create: body.skills.map((s) => ({ ...s, caseId: id })) } : undefined,
          photos: body.photoUrls?.length
            ? { create: body.photoUrls.map((url) => ({ url, uploadedBy: userId, caseId: id })) }
            : undefined,
        },
      })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.patch(
    "/cases/:id/members/:memberId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, memberId } = request.params as { id: string; memberId: string }
      const body = updateMemberSchema.parse(request.body)
      await prisma.caseMember.update({ where: { id: memberId }, data: body })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  app.delete(
    "/cases/:id/members/:memberId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, memberId } = request.params as { id: string; memberId: string }
      await prisma.caseMember.delete({ where: { id: memberId } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  app.post(
    "/cases/:id/members/:memberId/needs",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string }
      const body = needInputSchema.parse(request.body)
      await prisma.caseNeed.create({ data: { caseId: id, caseMemberId: memberId, ...body } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.patch(
    "/cases/:id/members/:memberId/needs/:needId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, needId } = request.params as { id: string; memberId: string; needId: string }
      const { resolved } = z.object({ resolved: z.boolean() }).parse(request.body)
      await prisma.caseNeed.update({ where: { id: needId }, data: { resolvedAt: resolved ? new Date() : null } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  app.post(
    "/cases/:id/members/:memberId/skills",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string }
      const body = skillInputSchema.parse(request.body)
      await prisma.caseSkill.create({ data: { caseId: id, caseMemberId: memberId, ...body } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.delete(
    "/cases/:id/members/:memberId/skills/:skillId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, skillId } = request.params as { id: string; memberId: string; skillId: string }
      await prisma.caseSkill.delete({ where: { id: skillId } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  app.post(
    "/cases/:id/members/:memberId/photos",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id, memberId } = request.params as { id: string; memberId: string }
      const body = photoSchema.parse(request.body)
      await prisma.casePhoto.create({
        data: { caseId: id, caseMemberId: memberId, uploadedBy: request.user!.sub, ...body },
      })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.delete(
    "/cases/:id/members/:memberId/photos/:photoId",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request) => {
      const { id, photoId } = request.params as { id: string; memberId: string; photoId: string }
      await prisma.casePhoto.delete({ where: { id: photoId } })
      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )

  // ── Asignaciones de roles (bloque D) ──

  app.post(
    "/cases/:id/assignments",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = assignmentSchema.parse(request.body)
      const caseRecord = await prisma.case.findUniqueOrThrow({ where: { id } })
      await prisma.caseAssignment.create({ data: { caseId: id, userId: body.userId, role: body.role } })

      await notify([body.userId], {
        title: `Te asignaron al caso ${caseRecord.caseNumber} como ${CASE_ASSIGNMENT_ROLE_LABEL[body.role]}`,
        body: caseRecord.fullName,
        link: "/casos",
        type: "case_assignment",
        email: {
          subject: `Vida Solidaria — te asignaron al caso ${caseRecord.caseNumber}`,
          html: `<p>Te asignaron como <strong>${CASE_ASSIGNMENT_ROLE_LABEL[body.role]}</strong> al caso <strong>${caseRecord.caseNumber} — ${caseRecord.fullName}</strong>.</p>`,
        },
      })

      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return reply.code(201).send(await serializeCaseDetail(updated))
    },
  )

  app.patch(
    "/cases/:id/assignments/:assignmentId/unassign",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id, assignmentId } = request.params as { id: string; assignmentId: string }
      const assignment = await prisma.caseAssignment.findUnique({ where: { id: assignmentId } })
      if (!assignment || assignment.caseId !== id) {
        return reply.code(404).send({ error: "Asignación no encontrada" })
      }
      if (assignment.unassignedAt) {
        return reply.code(400).send({ error: "Esta asignación ya estaba desasignada" })
      }
      const caseRecord = await prisma.case.findUniqueOrThrow({ where: { id } })
      await prisma.caseAssignment.update({ where: { id: assignmentId }, data: { unassignedAt: new Date() } })

      await notify([assignment.userId], {
        title: `Te desasignaron del caso ${caseRecord.caseNumber}`,
        body: caseRecord.fullName,
        link: "/casos",
        type: "case_unassignment",
        email: {
          subject: `Vida Solidaria — te desasignaron del caso ${caseRecord.caseNumber}`,
          html: `<p>Te desasignaron como <strong>${CASE_ASSIGNMENT_ROLE_LABEL[assignment.role]}</strong> del caso <strong>${caseRecord.caseNumber} — ${caseRecord.fullName}</strong>.</p>`,
        },
      })

      const updated = await prisma.case.findUniqueOrThrow({ where: { id }, include: CASE_DETAIL_INCLUDE })
      return serializeCaseDetail(updated)
    },
  )
}
