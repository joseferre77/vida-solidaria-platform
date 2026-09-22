"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import {
  CASE_MAP_COLOR,
  CASE_MAP_COLOR_LABEL,
  exportCasos,
  exportCocina,
  exportProyectos,
  getCasosAnalytics,
  getMapaCasos,
  getPresentismoAnalytics,
  getProduccionAnalytics,
  getResumenAnalytics,
  type CaseMapPoint,
  type CasosAnalytics,
  type PresentismoAnalytics,
  type ProduccionAnalytics,
  type ResumenAnalytics,
} from "../../lib/analytics"
import { downloadCsv, downloadKpiPdf, downloadTablePdf } from "../../lib/reports"

/**
 * Fase K bloque G — Analítica e indicadores. Módulo nuevo, todo de solo
 * lectura sobre datos que ya cargan los bloques anteriores (Casos,
 * Presentismo/equipos semanales, Producción de campo) — ver
 * `apps/api/src/modules/analytics/analytics.routes.ts`. Página propia
 * (`/analitica`) en vez de una pestaña dentro de /administracion: es un
 * módulo de lectura para todo el equipo con `analytics.read`, no una
 * tarea administrativa puntual.
 *
 * Paleta de las series categóricas (sexo/viabilidad/producción): amarillo
 * → naranja → magenta, ya usados como acento en el resto de la plataforma
 * sobre el mismo fondo violeta oscuro — se reutilizan acá en vez de
 * introducir una paleta nueva para mantener consistencia visual.
 *
 * Post-Fase-K (pedido de Josecito 21/09/2026): se agregan acá el resumen
 * (usuarios/proyectos/stock), el gráfico de torta de casos por estado, el
 * mapa interactivo y los 4 botones de exportación de reportes. El mapa
 * (react-leaflet) se carga con `next/dynamic` y `ssr:false` porque Leaflet
 * toca `window` al importarse — revienta en el render de servidor.
 */

const CasosMap = dynamic(() => import("./CasosMap"), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center text-sm text-cream/40">Cargando mapa...</div>,
})

const WEEK_OPTIONS = [4, 8, 12, 26] as const

const CATEGORICAL = ["#ffd400", "#ff8a00", "#c026d3", "#7c1fb0"]

const cardCls = "rounded-2xl border border-white/15 bg-white/5 p-4"
const kpiLabelCls = "text-[11px] text-cream/50"
const kpiValueCls = "text-2xl font-semibold text-cream"

const currencyFmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/20 bg-purple-deep px-3 py-2 text-xs shadow-xl">
      {label && <p className="mb-1 font-medium text-cream">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function AnaliticaPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)

  const [casos, setCasos] = useState<CasosAnalytics | null>(null)
  const [presentismo, setPresentismo] = useState<PresentismoAnalytics | null>(null)
  const [produccion, setProduccion] = useState<ProduccionAnalytics | null>(null)
  const [resumen, setResumen] = useState<ResumenAnalytics | null>(null)
  const [mapaPoints, setMapaPoints] = useState<CaseMapPoint[] | null>(null)
  const [presentismoWeeks, setPresentismoWeeks] = useState<number>(8)
  const [produccionWeeks, setProduccionWeeks] = useState<number>(8)
  const [error, setError] = useState<string | null>(null)
  // Reportes: qué botón está generando ahora (deshabilita ese botón nada
  // más, no toda la sección — cada reporte pide sus datos al toque, no
  // están precargados) y si algo falló al generarlo.
  const [exportingKey, setExportingKey] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  useEffect(() => {
    if (!user || !hasPermission(user, "analytics.read")) return
    getCasosAnalytics()
      .then(setCasos)
      .catch((e) => setError(e.message))
    getResumenAnalytics()
      .then(setResumen)
      .catch((e) => setError(e.message))
    getMapaCasos()
      .then((r) => setMapaPoints(r.points))
      .catch((e) => setError(e.message))
  }, [user])

  useEffect(() => {
    if (!user || !hasPermission(user, "analytics.read")) return
    getPresentismoAnalytics(presentismoWeeks)
      .then(setPresentismo)
      .catch((e) => setError(e.message))
  }, [user, presentismoWeeks])

  useEffect(() => {
    if (!user || !hasPermission(user, "analytics.read")) return
    getProduccionAnalytics(produccionWeeks)
      .then(setProduccion)
      .catch((e) => setError(e.message))
  }, [user, produccionWeeks])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  if (!hasPermission(user, "analytics.read")) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-6">
        <p className="text-sm text-cream/60">No tenés permiso para ver esta sección.</p>
      </main>
    )
  }

  // Datos de los charts, derivados acá (no en el fetch) para no repetir
  // el "sin dato todavía" en cada render.
  const sexData = casos?.sexDistribution.map((s) => ({ name: s.sex, value: s.count })) ?? []
  const viabilityData = casos
    ? [
        { name: "Alta", value: casos.byViability.alta },
        { name: "Media", value: casos.byViability.media },
        { name: "Baja", value: casos.byViability.baja },
        { name: "Sin dato", value: casos.byViability.sinDato },
      ]
    : []
  // Casos por estado — mismos 4 valores y mismos colores que el mapa, para
  // que el gráfico de torta y los pines se lean como la misma clasificación.
  const statusData = casos
    ? [
        { key: "activo" as const, name: CASE_MAP_COLOR_LABEL.activo, value: casos.byStatus.activo },
        { key: "derivado" as const, name: CASE_MAP_COLOR_LABEL.derivado, value: casos.byStatus.derivado },
        { key: "en_seguimiento" as const, name: CASE_MAP_COLOR_LABEL.en_seguimiento, value: casos.byStatus.en_seguimiento },
        { key: "cerrado" as const, name: CASE_MAP_COLOR_LABEL.cerrado, value: casos.byStatus.cerrado },
      ]
    : []

  const projectStatusData = resumen
    ? [
        { name: "Planificación", value: resumen.projectsByStatus.planning },
        { name: "En proceso", value: resumen.projectsByStatus.active },
        { name: "Pausado", value: resumen.projectsByStatus.paused },
        { name: "Terminado", value: resumen.projectsByStatus.done },
      ]
    : []

  // Serie de producción: recharts quiere un array de objetos { semana, <itemLabel>: cantidad, ... }
  // — se pivotea acá el `series` del backend (una fila por semana, ya agrupada por ítem).
  const produccionItemLabels = Array.from(
    new Set((produccion?.series ?? []).flatMap((w) => w.items.map((i) => i.itemLabel))),
  )
  const produccionData = (produccion?.series ?? []).map((w) => {
    const row: Record<string, string | number> = { semana: w.weekStartDate }
    for (const item of w.items) row[item.itemLabel] = item.quantity
    return row
  })

  const todayStr = new Date().toISOString().slice(0, 10)

  async function withExportGuard(key: string, fn: () => Promise<void>) {
    setExportError(null)
    setExportingKey(key)
    try {
      await fn()
    } catch (e: any) {
      setExportError(e?.message ?? "No se pudo generar el reporte.")
    } finally {
      setExportingKey(null)
    }
  }

  async function handleCasosCsv() {
    await withExportGuard("casos-csv", async () => {
      const { rows } = await exportCasos()
      downloadCsv(
        `vida-solidaria-casos-${todayStr}.csv`,
        ["N° caso", "Nombre", "Alias", "DNI", "Edad", "Sexo", "Teléfono", "Estado", "Viabilidad", "Tipo", "Fecha de carga"],
        rows.map((r) => [r.caseNumber, r.fullName, r.alias, r.dni, r.approxAge, r.sex, r.phone, r.status, r.viability, r.caseType, r.createdAt]),
      )
    })
  }

  async function handleCasosPdf() {
    await withExportGuard("casos-pdf", async () => {
      const { rows } = await exportCasos()
      await downloadTablePdf("Reporte de Casos", `vida-solidaria-casos-${todayStr}.pdf`, [
        {
          head: ["N° caso", "Nombre", "Alias", "Edad", "Sexo", "Estado", "Viabilidad", "Carga"],
          body: rows.map((r) => [r.caseNumber, r.fullName, r.alias, r.approxAge, r.sex, r.status, r.viability, r.createdAt]),
        },
      ])
    })
  }

  async function handleCocinaCsv() {
    await withExportGuard("cocina-csv", async () => {
      const { rows } = await exportCocina()
      downloadCsv(
        `vida-solidaria-cocina-${todayStr}.csv`,
        ["Código", "Nombre", "Unidad", "Categoría", "Tipo", "Cantidad actual", "Costo unitario", "Valor total", "Punto de pedido"],
        rows.map((r) => [r.code, r.name, r.unit, r.category, r.isReusable, r.currentQuantity, r.unitCost, r.totalValue, r.reorderPoint]),
      )
    })
  }

  async function handleCocinaPdf() {
    await withExportGuard("cocina-pdf", async () => {
      const { rows } = await exportCocina()
      await downloadTablePdf("Reporte de Cocina / Stock", `vida-solidaria-cocina-${todayStr}.pdf`, [
        {
          head: ["Código", "Nombre", "Unidad", "Tipo", "Cant. actual", "Valor total", "Pto. pedido"],
          body: rows.map((r) => [r.code, r.name, r.unit, r.isReusable, r.currentQuantity, r.totalValue, r.reorderPoint]),
        },
      ])
    })
  }

  async function handleProyectosCsv() {
    await withExportGuard("proyectos-csv", async () => {
      const { rows } = await exportProyectos()
      downloadCsv(
        `vida-solidaria-proyectos-${todayStr}.csv`,
        ["Código", "Nombre", "Área", "Estado", "Prioridad", "Responsable", "Inicio", "Fin", "Avance %", "Casos", "Miembros"],
        rows.map((r) => [r.code, r.name, r.area, r.status, r.priority, r.owner, r.startDate, r.endDate, r.progressPct, r.caseCount, r.memberCount]),
      )
    })
  }

  async function handleProyectosPdf() {
    await withExportGuard("proyectos-pdf", async () => {
      const { rows } = await exportProyectos()
      await downloadTablePdf("Reporte de Proyectos", `vida-solidaria-proyectos-${todayStr}.pdf`, [
        {
          head: ["Código", "Nombre", "Estado", "Responsable", "Avance %", "Casos"],
          body: rows.map((r) => [r.code, r.name, r.status, r.owner, `${r.progressPct}%`, r.caseCount]),
        },
      ])
    })
  }

  function generalSections() {
    return [
      {
        heading: "Casos",
        items: [
          { label: "Casos cargados", value: casos?.totalCases ?? "—" },
          { label: "Edad promedio", value: casos?.averageAge ?? "—" },
          { label: "Permanencia promedio (días)", value: casos?.averageStayDays ?? "—" },
          { label: "Sin clasificación", value: casos?.byStatus.activo ?? "—" },
          { label: "Clasificados", value: casos?.byStatus.derivado ?? "—" },
          { label: "En tratamiento", value: casos?.byStatus.en_seguimiento ?? "—" },
          { label: "Extraídos", value: casos?.byStatus.cerrado ?? "—" },
        ],
      },
      {
        heading: "Organización",
        items: [
          { label: "Usuarios totales", value: resumen?.totalUsers ?? "—" },
          { label: "Proyectos totales", value: resumen?.totalProjects ?? "—" },
          { label: "Proyectos en proceso", value: resumen?.projectsByStatus.active ?? "—" },
          { label: "Proyectos terminados", value: resumen?.projectsByStatus.done ?? "—" },
          { label: "Proyectos pausados", value: resumen?.projectsByStatus.paused ?? "—" },
        ],
      },
      {
        heading: "Stock / cocina",
        items: [
          { label: "Insumos y equipos cargados", value: resumen?.stock.totalItems ?? "—" },
          { label: "Bajo punto de pedido", value: resumen?.stock.belowReorderPoint ?? "—" },
          { label: "Valuación total", value: resumen ? currencyFmt.format(resumen.stock.totalValuation) : "—" },
        ],
      },
      {
        heading: "Presentismo y producción",
        items: [
          { label: `Voluntarios con asistencia confirmada (${presentismoWeeks} sem.)`, value: presentismo?.ranking.length ?? "—" },
          { label: `Semanas con entregas registradas (${produccionWeeks} sem.)`, value: produccion?.series.length ?? "—" },
        ],
      },
    ]
  }

  async function handleGeneralCsv() {
    await withExportGuard("general-csv", async () => {
      const rows = generalSections().flatMap((s) => s.items.map((i) => [s.heading, i.label, i.value] as (string | number)[]))
      downloadCsv(`vida-solidaria-reporte-general-${todayStr}.csv`, ["Sección", "Indicador", "Valor"], rows)
    })
  }

  async function handleGeneralPdf() {
    await withExportGuard("general-pdf", async () => {
      await downloadKpiPdf("Reporte General", `vida-solidaria-reporte-general-${todayStr}.pdf`, generalSections())
    })
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-yellow">Analítica</h1>
        <p className="mt-1 text-xs text-cream/50">
          Indicadores de Casos, presentismo de campo, producción, stock y proyectos — se arman solos a medida que se
          carga más información en el resto de la plataforma.
        </p>
      </header>

      {error && <p className="mb-4 rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange">{error}</p>}

      {/* ── Casos ── */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-bold text-cream">Casos</h2>

        {!casos ? (
          <p className="text-sm text-cream/50">Cargando...</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className={cardCls}>
                <p className={kpiLabelCls}>Casos cargados</p>
                <p className={kpiValueCls}>{casos.totalCases}</p>
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Edad promedio</p>
                <p className={kpiValueCls}>{casos.averageAge ?? "—"}</p>
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Permanencia promedio</p>
                <p className={kpiValueCls}>{casos.averageStayDays != null ? `${casos.averageStayDays} d` : "—"}</p>
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Con / sin teléfono</p>
                <p className={kpiValueCls}>
                  {casos.withPhone} / {casos.withoutPhone}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">Distribución por sexo</p>
                {sexData.length === 0 ? (
                  <p className="text-xs text-cream/40">Sin casos cargados todavía.</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sexData} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(255,248,236,0.5)", fontSize: 11 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={70}
                          tick={{ fill: "rgba(255,248,236,0.7)", fontSize: 11 }}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                        <Bar dataKey="value" name="Casos" radius={[0, 4, 4, 0]}>
                          {sexData.map((_, i) => (
                            <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">Por viabilidad</p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={viabilityData} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: "rgba(255,248,236,0.5)", fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={70}
                        tick={{ fill: "rgba(255,248,236,0.7)", fontSize: 11 }}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                      <Bar dataKey="value" name="Casos" radius={[0, 4, 4, 0]}>
                        {viabilityData.map((_, i) => (
                          <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">
                  Por estado (misma clasificación que el mapa, más abajo)
                </p>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                        {statusData.map((s) => (
                          <Cell key={s.key} fill={CASE_MAP_COLOR[s.key]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,248,236,0.7)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">Habilidades más recurrentes</p>
                {casos.topSkills.length === 0 ? (
                  <p className="text-xs text-cream/40">Sin habilidades cargadas todavía.</p>
                ) : (
                  <div className="space-y-1.5">
                    {casos.topSkills.map((s) => (
                      <div key={s.skillLabel} className="flex items-center justify-between text-sm">
                        <span className="text-cream/80">{s.skillLabel}</span>
                        <span className="font-semibold text-yellow">{s.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Mapa de casos ── */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-bold text-cream">Mapa de casos</h2>
        <p className="mb-3 text-xs text-cream/50">
          Última ubicación relevada de cada caso. Tocá un pin para ver el detalle del caso.
        </p>
        <div className="mb-3 flex flex-wrap gap-3 text-xs">
          {(["activo", "derivado", "en_seguimiento", "cerrado"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-cream/70">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: CASE_MAP_COLOR[k] }} />
              {CASE_MAP_COLOR_LABEL[k]}
            </span>
          ))}
        </div>
        {mapaPoints === null ? (
          <p className="text-sm text-cream/50">Cargando...</p>
        ) : mapaPoints.length === 0 ? (
          <p className={`${cardCls} text-xs text-cream/40`}>
            Todavía no hay casos con ubicación GPS relevada (se carga desde "Nuevo caso" → Ubicación).
          </p>
        ) : (
          <CasosMap points={mapaPoints} />
        )}
      </section>

      {/* ── Resumen (usuarios, proyectos, stock) ── */}
      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-bold text-cream">Resumen general</h2>
        {!resumen ? (
          <p className="text-sm text-cream/50">Cargando...</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className={cardCls}>
                <p className={kpiLabelCls}>Usuarios totales</p>
                <p className={kpiValueCls}>{resumen.totalUsers}</p>
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Proyectos totales</p>
                <p className={kpiValueCls}>{resumen.totalProjects}</p>
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Insumos/equipos en stock</p>
                <p className={kpiValueCls}>{resumen.stock.totalItems}</p>
                {!resumen.stock.loaded && <p className="mt-0.5 text-[10px] text-cream/40">Todavía no se cargó stock.</p>}
              </div>
              <div className={cardCls}>
                <p className={kpiLabelCls}>Bajo punto de pedido</p>
                <p className={`${kpiValueCls} ${resumen.stock.belowReorderPoint > 0 ? "text-orange" : ""}`}>
                  {resumen.stock.belowReorderPoint}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">Proyectos por estado</p>
                {resumen.totalProjects === 0 ? (
                  <p className="text-xs text-cream/40">Sin proyectos cargados todavía.</p>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={projectStatusData} dataKey="value" nameKey="name" outerRadius={75} paddingAngle={2}>
                          {projectStatusData.map((_, i) => (
                            <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,248,236,0.7)" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className={cardCls}>
                <p className="mb-2 text-sm font-medium text-cream">Valuación de stock</p>
                <p className="text-3xl font-semibold text-cream">{currencyFmt.format(resumen.stock.totalValuation)}</p>
                <p className="mt-1 text-xs text-cream/50">
                  Suma de cantidad actual × costo unitario de los insumos NO reusables (no incluye equipamiento
                  prestado, que no se valúa por unidad).
                </p>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── Presentismo ── */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-cream">Presentismo</h2>
          <div className="flex gap-1">
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setPresentismoWeeks(w)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  presentismoWeeks === w ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/70"
                }`}
              >
                {w} sem.
              </button>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <p className="mb-2 text-sm text-cream/60">
            Ranking por asistencias confirmadas en los últimos {presentismoWeeks} domingos.
          </p>
          {!presentismo ? (
            <p className="text-sm text-cream/50">Cargando...</p>
          ) : presentismo.ranking.length === 0 ? (
            <p className="text-xs text-cream/40">Sin asistencias confirmadas en este período.</p>
          ) : (
            <div className="space-y-1.5">
              {presentismo.ranking.map((r, i) => (
                <div key={r.userId} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className="text-cream">
                    <span className="mr-2 text-cream/40">#{i + 1}</span>
                    {r.user?.name ?? "—"}
                  </span>
                  <span className="font-semibold text-yellow">{r.confirmedCount}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Producción ── */}
      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-cream">Producción</h2>
          <div className="flex gap-1">
            {WEEK_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setProduccionWeeks(w)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  produccionWeeks === w ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/70"
                }`}
              >
                {w} sem.
              </button>
            ))}
          </div>
        </div>

        <div className={cardCls}>
          <p className="mb-2 text-sm text-cream/60">Bandejas y litros entregados por domingo.</p>
          {!produccion ? (
            <p className="text-sm text-cream/50">Cargando...</p>
          ) : produccionData.length === 0 ? (
            <p className="text-xs text-cream/40">Sin entregas registradas en este período.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={produccionData} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="semana" tick={{ fill: "rgba(255,248,236,0.5)", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "rgba(255,248,236,0.5)", fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "rgba(255,248,236,0.7)" }} />
                  {produccionItemLabels.map((label, i) => (
                    <Bar key={label} dataKey={label} name={label} fill={CATEGORICAL[i % CATEGORICAL.length]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* ── Reportes ── */}
      <section>
        <h2 className="mb-3 font-display text-lg font-bold text-cream">Reportes</h2>
        <p className="mb-3 text-xs text-cream/50">
          Cada reporte se genera al momento con los datos actuales — CSV listo para abrir en Excel, o PDF listo para
          imprimir/exportar, con encabezado y pie de página de Vida Solidaria.
        </p>
        {exportError && <p className="mb-3 rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange">{exportError}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <ReportRow
            label="Reporte general"
            description="Todos los KPI de esta página en un solo archivo."
            onCsv={handleGeneralCsv}
            onPdf={handleGeneralPdf}
            busy={exportingKey}
            csvKey="general-csv"
            pdfKey="general-pdf"
          />
          <ReportRow
            label="Reporte casos"
            description="Listado completo de casos cargados."
            onCsv={handleCasosCsv}
            onPdf={handleCasosPdf}
            busy={exportingKey}
            csvKey="casos-csv"
            pdfKey="casos-pdf"
          />
          <ReportRow
            label="Reporte cocina (stock, equipos, etc)"
            description="Catálogo completo con cantidades y valuación."
            onCsv={handleCocinaCsv}
            onPdf={handleCocinaPdf}
            busy={exportingKey}
            csvKey="cocina-csv"
            pdfKey="cocina-pdf"
          />
          <ReportRow
            label="Reporte proyectos"
            description="Todos los proyectos con estado y avance."
            onCsv={handleProyectosCsv}
            onPdf={handleProyectosPdf}
            busy={exportingKey}
            csvKey="proyectos-csv"
            pdfKey="proyectos-pdf"
          />
        </div>
      </section>
    </main>
  )
}

function ReportRow({
  label,
  description,
  onCsv,
  onPdf,
  busy,
  csvKey,
  pdfKey,
}: {
  label: string
  description: string
  onCsv: () => void
  onPdf: () => void
  busy: string | null
  csvKey: string
  pdfKey: string
}) {
  return (
    <div className={cardCls}>
      <p className="text-sm font-medium text-cream">{label}</p>
      <p className="mb-3 text-xs text-cream/50">{description}</p>
      <div className="flex gap-2">
        <button
          onClick={onCsv}
          disabled={busy !== null}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-cream hover:bg-white/15 disabled:opacity-40"
        >
          {busy === csvKey ? "Generando..." : "Generar CSV"}
        </button>
        <button
          onClick={onPdf}
          disabled={busy !== null}
          className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-40"
        >
          {busy === pdfKey ? "Generando..." : "Generar PDF"}
        </button>
      </div>
    </div>
  )
}
