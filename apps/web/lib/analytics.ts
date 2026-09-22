import { apiFetch } from "./api-client"

/**
 * Fase K bloque G — Analítica e indicadores. Todo sale de agregar sobre
 * los modelos que ya alimentan los bloques anteriores (Casos, Presentismo,
 * Producción de campo) — ver `apps/api/src/modules/analytics/analytics.routes.ts`.
 *
 * Post-Fase-K (pedido de Josecito 21/09/2026): se suman acá `resumen`
 * (usuarios/proyectos/stock), `mapaCasos` (pines del mapa) y los cuatro
 * `export*` de reportes, todos bajo el mismo permiso `analytics.read`.
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
  byStatus: { activo: number; en_seguimiento: number; derivado: number; cerrado: number }
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

export interface ResumenAnalytics {
  totalUsers: number
  totalProjects: number
  projectsByStatus: { planning: number; active: number; paused: number; done: number }
  stock: { totalItems: number; totalValuation: number; belowReorderPoint: number; loaded: boolean }
}

/**
 * Mapeo de color del mapa (pedido de Josecito, campo no especificado por
 * él — se documenta acá y en PLAN_FASE_K.md): reusa el único campo de 4
 * valores que tiene Case, `status`. activo = recién cargado, todavía sin
 * clasificar → rojo. derivado = ya se lo derivó/clasificó a un recurso →
 * naranja. en_seguimiento = en tratamiento activo → amarillo. cerrado =
 * el caso se cerró, la persona fue extraída de calle → verde.
 */
export const CASE_MAP_COLOR: Record<CaseMapPoint["status"], string> = {
  activo: "#ef4444", // rojo — sin clasificación
  derivado: "#ff8a00", // naranja (brand orange) — clasificados
  en_seguimiento: "#ffd400", // amarillo (brand yellow) — en tratamiento / otro filtro
  cerrado: "#22c55e", // verde — extraídos
}

export const CASE_MAP_COLOR_LABEL: Record<CaseMapPoint["status"], string> = {
  activo: "Sin clasificación",
  derivado: "Clasificados",
  en_seguimiento: "En tratamiento",
  cerrado: "Extraídos",
}

export interface CaseMapPoint {
  caseId: string
  caseNumber: string
  fullName: string
  alias: string | null
  status: "activo" | "en_seguimiento" | "derivado" | "cerrado"
  lat: number
  lng: number
  recordedAt: string
}

export interface CasoExportRow {
  caseNumber: string
  fullName: string
  alias: string
  dni: string
  approxAge: number | ""
  sex: string
  phone: string
  status: string
  viability: string
  caseType: string
  createdAt: string
}

export interface CocinaExportRow {
  code: string
  name: string
  unit: string
  category: string
  isReusable: string
  currentQuantity: number | ""
  unitCost: number | ""
  totalValue: number | ""
  reorderPoint: number | ""
}

export interface ProyectoExportRow {
  code: string
  name: string
  area: string
  status: string
  priority: string
  owner: string
  startDate: string
  endDate: string
  progressPct: number
  caseCount: number
  memberCount: number
}

export const getCasosAnalytics = () => apiFetch("/api/analytics/casos") as Promise<CasosAnalytics>

export const getPresentismoAnalytics = (weeks?: number) =>
  apiFetch(`/api/analytics/presentismo${weeks ? `?weeks=${weeks}` : ""}`) as Promise<PresentismoAnalytics>

export const getProduccionAnalytics = (weeks?: number) =>
  apiFetch(`/api/analytics/produccion${weeks ? `?weeks=${weeks}` : ""}`) as Promise<ProduccionAnalytics>

export const getResumenAnalytics = () => apiFetch("/api/analytics/resumen") as Promise<ResumenAnalytics>

export const getMapaCasos = () => apiFetch("/api/analytics/mapa-casos") as Promise<{ points: CaseMapPoint[] }>

export const exportCasos = () =>
  apiFetch("/api/analytics/export/casos") as Promise<{ generatedAt: string; rows: CasoExportRow[] }>

export const exportCocina = () =>
  apiFetch("/api/analytics/export/cocina") as Promise<{ generatedAt: string; rows: CocinaExportRow[] }>

export const exportProyectos = () =>
  apiFetch("/api/analytics/export/proyectos") as Promise<{ generatedAt: string; rows: ProyectoExportRow[] }>
