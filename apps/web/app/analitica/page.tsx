"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { fetchMe, hasPermission, type SessionUser } from "../../lib/auth"
import {
  getCasosAnalytics,
  getPresentismoAnalytics,
  getProduccionAnalytics,
  type CasosAnalytics,
  type PresentismoAnalytics,
  type ProduccionAnalytics,
} from "../../lib/analytics"

/**
 * Fase K bloque G — Analítica e indicadores. Módulo nuevo, todo de solo
 * lectura sobre datos que ya cargan los bloques anteriores (Casos,
 * Presentismo/equipos semanales, Producción de campo) — ver
 * `apps/api/src/modules/analytics/analytics.routes.ts`. Página propia
 * (`/analitica`) en vez de una pestaña dentro de /administracion: es un
 * módulo de lectura para todo el equipo con `analytics.read`, no una
 * tarea administrativa puntual.
 *
 * Paleta de las 3 series categóricas (sexo/viabilidad/producción):
 * amarillo → naranja → magenta, ya usados como acento en el resto de la
 * plataforma sobre el mismo fondo violeta oscuro — se reutilizan acá en
 * vez de introducir una paleta nueva para mantener consistencia visual.
 */

const WEEK_OPTIONS = [4, 8, 12, 26] as const

const CATEGORICAL = ["#ffd400", "#ff8a00", "#c026d3", "#7c1fb0"]

const cardCls = "rounded-2xl border border-white/15 bg-white/5 p-4"
const kpiLabelCls = "text-[11px] text-cream/50"
const kpiValueCls = "text-2xl font-semibold text-cream"

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
  const [presentismoWeeks, setPresentismoWeeks] = useState<number>(8)
  const [produccionWeeks, setProduccionWeeks] = useState<number>(8)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-yellow">Analítica</h1>
        <p className="mt-1 text-xs text-cream/50">
          Indicadores de Casos, presentismo de campo y producción — se arman solos a medida que se carga más
          información en el resto de la plataforma.
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
            </div>

            <div className={`${cardCls} mt-4`}>
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
      <section>
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
    </main>
  )
}
