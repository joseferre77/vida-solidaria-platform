/**
 * Catálogo de permisos granulares y la matriz rol → permisos.
 * Fuente de verdad para el seed (prisma/seed.ts) y para el middleware de
 * autorización. Cambiar acá y correr `pnpm prisma:seed` para propagar.
 *
 * Nota sobre el Módulo 2 (Proyectos) ampliado: los subsistemas nuevos
 * (hitos, cronómetro/TimeEntry, checklist, dependencias, adjuntos,
 * etiquetas, procesos, gastos, notas, recordatorios, campos personalizados
 * y encuestas ATADAS a un proyecto) NO tienen slug propio acá — viven
 * dentro del alcance de "projects.read/write/admin" y se afinan por
 * miembro con `ProjectRole` (creador/editor/visor/admin en `ProjectMember`,
 * chequeado en la capa de servicio, no acá). Solo se agregó un slug nuevo,
 * `surveys.manage`, para encuestas STANDALONE (no atadas a un proyecto).
 */

export const PERMISSIONS = [
  // Core / administración
  "users.manage",
  "roles.manage",
  // Proyectos
  "projects.read",
  "projects.write",
  "projects.admin",
  // Casos (CRM social)
  "cases.read",
  "cases.write",
  // Logística / stock / cocina
  "logistics.read",
  "logistics.write",
  // Operaciones de campo
  "field_ops.read",
  "field_ops.write",
  // Finanzas / donaciones
  "finance.read",
  "finance.write",
  // Encuestas internas (standalone, no atadas a un proyecto puntual)
  "surveys.manage",
  // Analítica
  "analytics.read",
] as const

export type PermissionSlug = (typeof PERMISSIONS)[number]

export const GLOBAL_ROLES = [
  "admin_general",
  "direccion_general",
  "direccion_proyectos",
  "coordinacion_logistica",
  "coordinacion_comercial",
  "coordinacion_recepcion",
  "coordinacion_extraccion",
  "coordinador_relevamiento",
  "voluntario",
] as const

export type GlobalRoleSlug = (typeof GLOBAL_ROLES)[number]

export const ROLE_LABELS: Record<GlobalRoleSlug, string> = {
  admin_general: "Admin General",
  direccion_general: "Dirección General",
  direccion_proyectos: "Dirección de Proyectos",
  coordinacion_logistica: "Coordinación Logística",
  coordinacion_comercial: "Coordinación Comercial",
  coordinacion_recepcion: "Coordinación de Recepción",
  coordinacion_extraccion: "Coordinación de Extracción",
  coordinador_relevamiento: "Coordinador de Relevamiento",
  voluntario: "Voluntario",
}

// rank: menor número = más alcance (se usa para "el rol de proyecto más
// restrictivo gana" y para ordenar en la UI de administración de usuarios)
export const ROLE_RANK: Record<GlobalRoleSlug, number> = {
  admin_general: 1,
  direccion_general: 2,
  direccion_proyectos: 3,
  coordinacion_logistica: 4,
  coordinacion_comercial: 4,
  coordinacion_recepcion: 4,
  coordinacion_extraccion: 4,
  coordinador_relevamiento: 5,
  voluntario: 6,
}

/**
 * Matriz rol → permisos. admin_general tiene todo implícitamente (se
 * resuelve en el middleware, no hace falta listarlo acá).
 */
export const ROLE_PERMISSIONS: Record<Exclude<GlobalRoleSlug, "admin_general">, PermissionSlug[]> = {
  direccion_general: [
    "projects.read",
    "cases.read",
    "logistics.read",
    "field_ops.read",
    "finance.read",
    "surveys.manage",
    "analytics.read",
  ],
  direccion_proyectos: [
    "projects.read",
    "projects.write",
    "projects.admin",
    "surveys.manage",
    "analytics.read",
  ],
  coordinacion_logistica: ["logistics.read", "logistics.write", "field_ops.read"],
  coordinacion_comercial: ["finance.read", "finance.write"],
  coordinacion_recepcion: ["cases.read", "cases.write"],
  coordinacion_extraccion: ["field_ops.read", "field_ops.write", "logistics.read"],
  coordinador_relevamiento: ["cases.read", "cases.write", "field_ops.read", "field_ops.write"],
  voluntario: ["field_ops.read", "field_ops.write"],
}
