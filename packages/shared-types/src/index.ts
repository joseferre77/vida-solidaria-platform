/**
 * Placeholder — acá van los tipos compartidos (roles, enums de Prisma
 * espejados para el frontend, contratos de request/response de la API)
 * a medida que se implementa cada módulo. Ver ARCHITECTURE.md.
 */

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

export type GlobalRole = (typeof GLOBAL_ROLES)[number]

export const PROJECT_ROLES = ["creador", "editor", "visor", "admin"] as const
export type ProjectRole = (typeof PROJECT_ROLES)[number]
