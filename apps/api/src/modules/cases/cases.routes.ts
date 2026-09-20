/**
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

const CASE_TYPES = ["individual", "pareja", "grupo_familiar"] as const
const STAY_TYPES = ["calle", "parador_temporal"] as const
const VIABILITIES = ["alta", "media", "baja"] as const
const FEASIBILITIES = ["factible", "no_factible", "en_pausa"] as const
const CASE_STATUSES = ["activo", "en_seguimiento", "derivado", "cerrado"] as const
const NEED_CATEGORIES = ["salud", "documentacion", "abrigo", "alimentacion", "vivienda", "laboral", "otro"] as const
const NEED_URGENCIES = ["inmediata", "urgente", "normal"] as const

const needInputSchema = z.object({
  category: z.enum(NEED_CATEGORIES),
  urgency: z.enum(NEED_URGENCIES),
  notes: z.string().trim().optional(),
})

const skillInputSchema = z.object({
  skillLabel: z.string().min(1),
  level: z.string().trim().optional(),
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
  needs: z.array(needInputSchema).optional(),
  skills: z.array(skillInputSchema).optional(),
  photoUrls: z.array(z.string().url()).optional(),
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

async function nextCaseNumber() {
  const counter = await prisma.counter.upsert({
    where: { name: "case_number" },
    update: { value: { increment: 1 } },
    create: { name: "case_number", value: 1 },
  })
  return `C${String(counter.value).padStart(6, "0")}`
}

const CASE_DETAIL_INCLUDE = {
  contactsHistory: { orderBy: { contactedAt: "desc" as const } },
  locations: { orderBy: { recordedAt: "desc" as const } },
  photos: { orderBy: { takenAt: "desc" as const } },
  skills: true,
  needs: { orderBy: { createdAt: "desc" as const } },
  statusHistory: { orderBy: { changedAt: "desc" as const } },
}

async function serializeCaseDetail(c: any) {
  const users = await userMapFor([
    c.createdBy,
    c.updatedBy,
    ...c.contactsHistory.map((x: any) => x.userId),
    ...c.locations.map((x: any) => x.recordedBy),
    ...c.photos.map((x: any) => x.uploadedBy),
    ...c.statusHistory.map((x: any) => x.changedBy),
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
    photos: c.photos.map((x: any) => ({
      id: x.id,
      url: x.url,
      takenAt: x.takenAt,
      uploadedBy: users.get(x.uploadedBy) ?? null,
    })),
    skills: c.skills.map((x: any) => ({ id: x.id, skillLabel: x.skillLabel, level: x.level })),
    needs: c.needs.map((x: any) => ({
      id: x.id,
      category: x.category,
      urgency: x.urgency,
      notes: x.notes,
      resolvedAt: x.resolvedAt,
      createdAt: x.createdAt,
    })),
    statusHistory: c.statusHistory.map((x: any) => ({
      toStatus: x.toStatus,
      fromStatus: x.fromStatus,
      changedAt: x.changedAt,
      changedBy: users.get(x.changedBy) ?? null,
    })),
  }
}

export async function casesRoutes(app: FastifyInstance) {
  app.get("/cases", { preHandler: [requireAuth, requirePermission("cases.read")] }, async (request) => {
    const { status } = request.query as { status?: string }
    const cases = await prisma.case.findMany({
      where: { status: (status as (typeof CASE_STATUSES)[number]) || undefined },
      include: { needs: true },
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
      viability: c.viability,
      feasibility: c.feasibility,
      createdAt: c.createdAt,
      openNeedsCount: c.needs.filter((n) => !n.resolvedAt).length,
    }))
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

    const created = await prisma.case.create({
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
        createdBy: userId,
        locations: { create: { lat: body.location.lat, lng: body.location.lng, recordedBy: userId } },
        needs: body.needs?.length ? { create: body.needs } : undefined,
        skills: body.skills?.length ? { create: body.skills } : undefined,
        photos: body.photoUrls?.length
          ? { create: body.photoUrls.map((url) => ({ url, uploadedBy: userId })) }
          : undefined,
        statusHistory: { create: { toStatus: "activo", changedBy: userId } },
      },
      include: CASE_DETAIL_INCLUDE,
    })
    return reply.code(201).send(await serializeCaseDetail(created))
  })

  app.patch("/cases/:id", { preHandler: [requireAuth, requirePermission("cases.write")] }, async (request) => {
    const { id } = request.params as { id: string }
    const body = updateCaseSchema.parse(request.body)
    const updated = await prisma.case.update({
      where: { id },
      data: { ...body, updatedBy: request.user!.sub },
      include: CASE_DETAIL_INCLUDE,
    })
    return serializeCaseDetail(updated)
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
      return serializeCaseDetail(updated)
    },
  )

  app.post(
    "/cases/:id/contacts",
    { preHandler: [requireAuth, requirePermission("cases.write")] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = contactSchema.parse(request.body)
      await prisma.caseContactHistory.create({ data: { caseId: id, userId: request.user!.sub, ...body } })
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
}
