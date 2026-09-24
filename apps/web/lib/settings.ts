/**
 * Fase P: configuración editable desde /administracion → Configuración.
 * Ver apps/api/src/modules/settings/settings.routes.ts.
 */
import { apiFetch } from "./api-client"

export interface AppSettingsData {
  weeklyReminderDay: number
  weeklyReminderDayLabel: string
}

export function getSettings(): Promise<AppSettingsData> {
  return apiFetch("/api/settings")
}

export function updateWeeklyReminderDay(weeklyReminderDay: number): Promise<AppSettingsData> {
  return apiFetch("/api/settings", { method: "PUT", body: JSON.stringify({ weeklyReminderDay }) })
}
