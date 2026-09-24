/**
 * Fase P: helper mínimo para leer/escribir `app_settings` (clave/valor).
 * Por ahora la usa el día configurable del aviso semanal de asistencia
 * (ver `scheduled-ticks.ts` y `modules/settings/settings.routes.ts`); a
 * futuro reemplaza también el toggle de registro público huérfano
 * (`volunteer_registration_enabled`, ver notas en schema.prisma).
 */
import { prisma } from "./prisma"

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  return row?.value ?? null
}

export async function setSetting(key: string, value: string, updatedBy?: string) {
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value, updatedBy },
    update: { value, updatedBy },
  })
}

/** Día de la semana (0=domingo..6=sábado) en que se manda el aviso "¿venís
 * este domingo?". Viernes (5) es el default histórico si nunca se configuró. */
export const WEEKLY_REMINDER_DAY_KEY = "weekly_reminder_day"
export const WEEKLY_REMINDER_DAY_DEFAULT = 5

export async function getWeeklyReminderDay(): Promise<number> {
  const raw = await getSetting(WEEKLY_REMINDER_DAY_KEY)
  if (raw === null) return WEEKLY_REMINDER_DAY_DEFAULT
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 6) return WEEKLY_REMINDER_DAY_DEFAULT
  return parsed
}
