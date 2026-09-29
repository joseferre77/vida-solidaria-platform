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
  // Chat de coordinadores (un solo canal, interno)
  "coordination.chat",
] as const

export type PermissionSlug = (typeof PERMISSIONS)[number]

// Fase U: nombres legibles + módulo dueño de cada permiso — para el ABM de
// permisos por usuario (matriz on/off en el perfil). El `label` de
// `Permission` en la DB sigue siendo el slug tal cual (así lo siembra
// seed.ts desde siempre); esto es solo para la UI, no toca la DB.
export const PERMISSION_INFO: Record<PermissionSlug, { label: string; module: string }> = {
  "users.manage": { label: "Gestionar usuarios y roles", module: "Administración" },
  "roles.manage": { label: "Administrar roles del sistema", module: "Administración" },
  "projects.read": { label: "Ver proyectos", module: "Proyectos" },
  "projects.write": { label: "Editar proyectos y tareas", module: "Proyectos" },
  "projects.admin": { label: "Administrar proyectos (config, miembros)", module: "Proyectos" },
  "cases.read": { label: "Ver casos", module: "Casos" },
  "cases.write": { label: "Crear y editar casos", module: "Casos" },
  "logistics.read": { label: "Ver stock y cocina", module: "Logística" },
  "logistics.write": { label: "Cargar movimientos de stock y cocina", module: "Logística" },
  "field_ops.read": { label: "Ver equipos, zonas y check-ins", module: "Operaciones de campo" },
  "field_ops.write": { label: "Cargar check-ins y asignaciones de campo", module: "Operaciones de campo" },
  "finance.read": { label: "Ver finanzas y donaciones", module: "Finanzas" },
  "finance.write": { label: "Cargar movimientos financieros", module: "Finanzas" },
  "surveys.manage": { label: "Crear y administrar encuestas", module: "Encuestas" },
  "analytics.read": { label: "Ver analítica", module: "Analítica" },
  "coordination.chat": { label: "Leer y escribir en el chat de coordinadores", module: "Chat" },
}

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
  "solo_observacion",
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
  solo_observacion: "Solo Observación",
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
  // el rank más alto (menos alcance): puede ver, no puede escribir nada
  solo_observacion: 7,
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
    "coordination.chat",
  ],
  direccion_proyectos: [
    "projects.read",
    "projects.write",
    "projects.admin",
    "surveys.manage",
    "analytics.read",
    "coordination.chat",
  ],
  coordinacion_logistica: ["logistics.read", "logistics.write", "field_ops.read", "coordination.chat"],
  coordinacion_comercial: ["finance.read", "finance.write", "coordination.chat"],
  coordinacion_recepcion: ["cases.read", "cases.write", "coordination.chat"],
  coordinacion_extraccion: ["field_ops.read", "field_ops.write", "logistics.read", "coordination.chat"],
  coordinador_relevamiento: [
    "cases.read",
    "cases.write",
    "field_ops.read",
    "field_ops.write",
    "coordination.chat",
  ],
  voluntario: ["field_ops.read", "field_ops.write"],
  // Solo Observación: acceso de solo lectura a todos los módulos, sin
  // ningún permiso de escritura/borrado/administración. Ojo:
  // `coordination.chat` hoy habilita LEER y ESCRIBIR el chat de
  // coordinadores con el mismo slug (no hay variante de solo lectura
  // todavía — ver coordination.routes.ts), así que este rol NO lo incluye:
  // este usuario no ve el chat de coordinadores hasta que se separe ese
  // permiso en read/write. Tampoco incluye `surveys.manage` (permite
  // crear/editar encuestas, no es de solo lectura).
  solo_observacion: [
    "projects.read",
    "cases.read",
    "logistics.read",
    "field_ops.read",
    "finance.read",
    "analytics.read",
  ],
}
