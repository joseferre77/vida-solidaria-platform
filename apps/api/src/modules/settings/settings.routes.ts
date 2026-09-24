/**
 * Fase P: configuración editable desde /administracion → Configuración.
 * Por ahora un solo valor (día de la semana del aviso "¿venís este
 * domingo?"), pensado para sumar más ajustes acá mismo a futuro (ej. el
 * toggle de registro público huérfano, ver notas en schema.prisma) sin
 * tener que armar un módulo nuevo cada vez.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { requireAuth, requirePermission } from "../../middleware/auth.middleware"
import { getWeeklyReminderDay, setSetting, WEEKLY_REMINDER_DAY_KEY } from "../../lib/settings"

const DAY_LABELS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/settings", { preHandler: [requireAuth, requirePermission("users.manage")] }, async () => {
    const weeklyReminderDay = await getWeeklyReminderDay()
    return { weeklyReminderDay, weeklyReminderDayLabel: DAY_LABELS[weeklyReminderDay] }
  })

  app.put(
    "/settings",
    { preHandler: [requireAuth, requirePermission("users.manage")] },
    async (request) => {
      const body = z.object({ weeklyReminderDay: z.number().int().min(0).max(6) }).parse(request.body)
      await setSetting(WEEKLY_REMINDER_DAY_KEY, String(body.weeklyReminderDay), request.user!.sub)
      return { weeklyReminderDay: body.weeklyReminderDay, weeklyReminderDayLabel: DAY_LABELS[body.weeklyReminderDay] }
    },
  )
}
