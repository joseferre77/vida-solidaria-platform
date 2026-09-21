import { apiFetch } from "./api-client"

/**
 * Fase K bloque G — Analítica e indicadores. Tres endpoints de solo
 * lectura (`analytics.read`), cada uno agregando sobre los modelos que ya
 * alimentan los bloques anteriores (Casos, Presentismo, Producción de
 * campo) — ver `apps/api/src/modules/analytics/analytics.routes.ts`.
 */

export interface CasosAnalytics {
  totalCases: number
  averageAge: number | null
  sexDistribution: { sex: string; count: number }[]
  averageStayDays: number | null
  topSkills: { skillLabel: string; count: number }[]
  withPhone: number
  withoutPhone: number
  byViability: { alta: number; media: number; baja: number; sinDato: number }
}

export interface PresentismoRankingItem {
  user: { id: string; name: string; email: string } | null
  userId: string
  confirmedCount: number
}

export interface PresentismoAnalytics {
  weeks: number
  ranking: PresentismoRankingItem[]
}

export interface ProduccionWeek {
  weekStartDate: string
  items: { itemLabel: string; quantity: number }[]
}

export interface ProduccionAnalytics {
  weeks: number
  series: ProduccionWeek[]
}

export const getCasosAnalytics = () => apiFetch("/api/analytics/casos") as Promise<CasosAnalytics>

export const getPresentismoAnalytics = (weeks?: number) =>
  apiFetch(`/api/analytics/presentismo${weeks ? `?weeks=${weeks}` : ""}`) as Promise<PresentismoAnalytics>

export const getProduccionAnalytics = (weeks?: number) =>
  apiFetch(`/api/analytics/produccion${weeks ? `?weeks=${weeks}` : ""}`) as Promise<ProduccionAnalytics>
