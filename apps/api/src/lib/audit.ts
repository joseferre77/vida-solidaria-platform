/**
 * Auditoría real (`AuditLog`) — registro de "quién hizo qué" en cualquier
 * módulo, para el widget de actividad reciente del dashboard y (Fase U)
 * para la pestaña "Actividad" del perfil de cada usuario.
 *
 * Antes vivía duplicada como función privada en cada módulo que la usaba
 * (projects.service.ts, cases.routes.ts) — Fase U la centraliza acá para
 * poder extenderla al resto de los módulos (Logística/Stock/Cocina,
 * Operaciones de Campo, Administración de usuarios) sin repetir el mismo
 * try/catch cuatro veces. Mismo comportamiento de siempre: nunca tira
 * abajo la operación real que la generó si guardar el log falla.
 */
import { prisma } from "./prisma"

export async function logActivity(
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
