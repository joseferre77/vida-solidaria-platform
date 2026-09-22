"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchMe, hasPermission, logout, type SessionUser } from "../../lib/auth"
import { RoleGate } from "../../components/RoleGate"
import {
  getDashboardSummary,
  listProjects,
  stopTimer,
  type DashboardSummary,
  type ProjectListItem,
} from "../../lib/projects"
import { KITCHEN_STATUS_LABEL, listMyKitchenBatches, type KitchenBatchItem } from "../../lib/logistics"
import { formatDate, formatMinutes, formatMoney, timeAgo } from "../../lib/format"

// Orden categórico fijo (nunca ciclado) para los widgets de distribución —
// ver skill de dataviz: identidad por color siempre acompañada de etiqueta
// de texto, así el orden/las hex exactas no son el único portador de
// significado (ninguna combinación de la paleta de marca pasa el piso de
// separación CVD estricto para 4+ categorías sin esa mitigación).
const CHART_COLORS = ["#ffd400", "#ff8a00", "#c026d3", "#fff8ec", "#7c1fb0"]

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null)
  const [myKitchenBatches, setMyKitchenBatches] = useState<KitchenBatchItem[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) {
        router.replace("/login")
      } else {
        setUser(u)
      }
    })
  }, [router])

  function refresh() {
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
    listProjects()
      .then(setProjects)
      .catch(() => setProjects(null))
    // Fase L — "tablero del voluntario": autogestionado, cualquier usuario
    // logueado ve sus propios lotes de cocina (sea responsable o ayudante),
    // sin requerir permiso de logística — mismo criterio que Presentismo.
    listMyKitchenBatches()
      .then(setMyKitchenBatches)
      .catch(() => setMyKitchenBatches(null))
  }

  useEffect(() => {
    if (user) refresh()
  }, [user])

  // Reloj del cronómetro activo — recalcula el "corriendo hace Xm" cada 30s sin repetir el fetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const runningMinutes = useMemo(() => {
    if (!summary?.runningTimer) return 0
    return Math.max(0, Math.round((now - new Date(summary.runningTimer.startedAt).getTime()) / 60000))
  }, [summary?.runningTimer, now])

  if (user === undefined) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  const canSeeProjects = !!user

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-yellow">Hola, {user?.name}</h1>
          <p className="text-sm text-cream/60">{user?.roles.join(", ")}</p>
        </div>
        <button
          onClick={async () => {
            await logout()
            router.push("/login")
          }}
          className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
        >
          Cerrar sesión
        </button>
      </header>

      {canSeeProjects && summary?.runningTimer && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow/40 bg-yellow/10 px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow" />
            </span>
            <p className="text-sm text-cream">
              Cronómetro corriendo en <span className="font-semibold">{summary.runningTimer.task.title}</span> —{" "}
              {formatMinutes(runningMinutes)}
            </p>
          </div>
          <button
            onClick={async () => {
              await stopTimer(summary.runningTimer!.id)
              refresh()
            }}
            className="rounded-xl bg-yellow px-4 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90"
          >
            Detener
          </button>
        </div>
      )}

      <MyKitchenBatchWidget batches={myKitchenBatches} />

      <RoleGate user={user ?? null} permission="projects.read">
        <p className="mb-2 text-[11px] uppercase tracking-wide text-cream/40">
          {summary?.scopedToOwnProjects ? "Tus proyectos" : "Toda la organización"}
        </p>
      </RoleGate>

      {canSeeProjects && (
        <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Proyectos activos" value={summary?.activeProjects} />
          <StatCard label="Tareas abiertas" value={summary?.totalOpenTasks} />
          <StatCard label="Mis tareas" value={summary?.myTasks} />
          <StatCard
            label="Vencen pronto"
            value={summary?.dueSoon}
            highlight={!!summary?.dueSoon && summary.dueSoon > 0}
          />
          <StatCard label="Miembros de equipo" value={summary?.teamMembersCount} />
        </section>
      )}

      {canSeeProjects && summary && (
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProjectsOverviewWidget projects={projects} />
          <TasksOverviewWidget tasksByStatus={summary.tasksByStatus} />
          <UpcomingMilestonesWidget milestones={summary.upcomingMilestones} />
          <RecentActivityWidget items={summary.recentActivity} scopedToOwn={summary.scopedToOwnProjects} />
          {summary.financeOverview && <FinanceOverviewWidget overview={summary.financeOverview} />}
        </section>
      )}

      {/* Navegación por permiso — Proyectos ya está implementado (Módulo 2);
          el resto son placeholders visuales hasta que se aborde cada módulo. */}
      <nav className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <RoleGate user={user ?? null} permission="projects.read">
          <NavCard label="Proyectos" href="/proyectos" />
        </RoleGate>
        <RoleGate user={user ?? null} permission="cases.read">
          <NavCard label="Casos" href="/casos" />
        </RoleGate>
        {/* "Logística" y "Operaciones de Campo" ya NO son placeholders
            propios acá — ambas viven como pestañas dentro de "Equipos y
            Secciones" (Cocina/Stock y Equipos/Zonas/Presentismo/Check-ins
            respectivamente, ver app/equipos/page.tsx) desde los bloques B/C
            de Fase K. Tener además una tarjeta "próximamente" repetía el
            mismo módulo dos veces y una de las dos siempre mentía. */}
        <RoleGate user={user ?? null} permission="finance.read">
          <NavCard label="Finanzas" disabled />
        </RoleGate>
        <RoleGate user={user ?? null} permission="analytics.read">
          <NavCard label="Analítica" href="/analitica" />
        </RoleGate>
        {(hasPermission(user ?? null, "field_ops.read") || hasPermission(user ?? null, "logistics.read")) && (
          <NavCard label="Equipos y Secciones" href="/equipos" />
        )}
        {/* Fase K bloque B: sin RoleGate a propósito — cualquier usuario
            logueado carga su propia intención semanal, no requiere field_ops.* */}
        <NavCard label="Presentismo" href="/presentismo" />
        {(hasPermission(user ?? null, "projects.admin") ||
          hasPermission(user ?? null, "surveys.manage") ||
          hasPermission(user ?? null, "users.manage")) && (
          <NavCard label="Administración" href="/administracion" />
        )}
      </nav>

      <p className="mt-10 text-xs text-cream/40">
        Módulo 1 (Core &amp; Seguridad) y Módulo 2 (Gestión de Proyectos)
        activos. Las demás secciones son placeholders visuales — cada una se
        implementa como su propio módulo.
      </p>
    </main>
  )
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: number | undefined
  highlight?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-cream/50">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold ${highlight ? "text-orange" : "text-cream"}`}>
        {value ?? "–"}
      </p>
    </div>
  )
}

function Widget({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/15 bg-white/5 p-4 ${className ?? ""}`}>
      <h2 className="mb-3 font-display text-sm font-semibold text-cream/90">{title}</h2>
      {children}
    </div>
  )
}

// Fase L — "tablero del voluntario": vista personal tipo remito de "te toca
// cocinar, te asignamos esto". Solo se muestra si hay algo activo (no
// entregado) para esta persona — nada que mostrarle a quien no está
// asignado a ninguna cocina.
function MyKitchenBatchWidget({ batches }: { batches: KitchenBatchItem[] | null }) {
  const active = (batches ?? []).filter((b) => b.status !== "entregado")
  if (active.length === 0) return null

  return (
    <section className="mb-6 space-y-3">
      {active.map((b) => {
        const activeEquipment = b.equipment.filter((e) => !e.returnedAt)
        return (
          <div key={b.id} className="rounded-2xl border border-yellow/40 bg-yellow/10 p-5">
            <p className="font-display text-base font-bold text-yellow">
              Te toca cocinar — {b.name}
            </p>
            <p className="mt-1 text-xs text-cream/60">
              {KITCHEN_STATUS_LABEL[b.status]} · {b.targetServings} porciones objetivo
              {b.responsible && <> · responsable: {b.responsible.name}</>}
            </p>
            {(b.ingredients.length > 0 || activeEquipment.length > 0) && (
              <div className="mt-3 text-sm text-cream/80">
                <p className="mb-1 text-xs uppercase tracking-wide text-cream/40">Te asignamos</p>
                <ul className="space-y-0.5">
                  {b.ingredients.map((i) => (
                    <li key={i.stockItemId}>
                      · {i.quantityAssigned} {i.unit} {i.stockItemName}
                    </li>
                  ))}
                  {activeEquipment.map((e) => (
                    <li key={e.custodyId}>
                      · {e.quantity} {e.stockItemName} (en manos de {e.holder?.name ?? "—"})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Link href="/equipos?tab=cocina" className="mt-3 inline-block text-xs text-yellow hover:underline">
              Ver detalle en Cocina →
            </Link>
          </div>
        )
      })}
    </section>
  )
}

function ProjectsOverviewWidget({ projects }: { projects: ProjectListItem[] | null }) {
  const top = (projects ?? []).slice(0, 6)
  return (
    <Widget title="Proyectos — avance">
      {top.length === 0 ? (
        <p className="text-sm text-cream/50">Todavía no hay proyectos.</p>
      ) : (
        <div className="space-y-3">
          {top.map((p) => (
            <Link key={p.id} href={`/proyectos/${p.id}`} className="block group">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="truncate font-medium text-cream group-hover:text-yellow">{p.name}</span>
                <span className="shrink-0 text-cream/50">{p.progressPct}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-yellow" style={{ width: `${p.progressPct}%` }} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </Widget>
  )
}

function TasksOverviewWidget({ tasksByStatus }: { tasksByStatus: Record<string, number> }) {
  const entries = Object.entries(tasksByStatus)
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  return (
    <Widget title="Tareas por estado">
      {total === 0 ? (
        <p className="text-sm text-cream/50">No hay tareas todavía.</p>
      ) : (
        <>
          <div className="mb-3 flex h-4 w-full overflow-hidden rounded-full bg-white/10">
            {entries.map(([name, count], i) => (
              <div
                key={name}
                title={`${name}: ${count}`}
                style={{ width: `${(count / total) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                className="h-full first:rounded-l-full last:rounded-r-full"
              />
            ))}
          </div>
          <ul className="space-y-1 text-xs">
            {entries.map(([name, count], i) => (
              <li key={name} className="flex items-center justify-between text-cream/70">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                  />
                  {name}
                </span>
                <span className="font-medium text-cream">{count}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Widget>
  )
}

function UpcomingMilestonesWidget({
  milestones,
}: {
  milestones: DashboardSummary["upcomingMilestones"]
}) {
  return (
    <Widget title="Próximos hitos">
      {milestones.length === 0 ? (
        <p className="text-sm text-cream/50">No hay hitos pendientes próximos.</p>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-cream">{m.title}</p>
                <p className="truncate text-xs text-cream/50">
                  {m.project.code} · {m.project.name}
                </p>
              </div>
              <span className="shrink-0 text-xs text-cream/60">{formatDate(m.dueDate)}</span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

function RecentActivityWidget({
  items,
  scopedToOwn,
}: {
  items: DashboardSummary["recentActivity"]
  scopedToOwn: boolean
}) {
  return (
    <Widget title={scopedToOwn ? "Tu actividad reciente" : "Actividad reciente"}>
      {items.length === 0 ? (
        <p className="text-sm text-cream/50">Todavía no hay actividad registrada.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="text-xs text-cream/70">
              <span className="font-medium text-cream">{a.user?.name ?? "Alguien"}</span>{" "}
              {actionLabel(a.action, a.entityType)} <span className="text-cream/40">· {timeAgo(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}

function FinanceOverviewWidget({ overview }: { overview: NonNullable<DashboardSummary["financeOverview"]> }) {
  const max = Math.max(1, ...overview.months.flatMap((m) => [m.income, m.expense]))
  return (
    <Widget title="Ingresos vs gastos (6 meses)" className="lg:col-span-2">
      <div className="mb-3 flex gap-6 text-sm">
        <p>
          <span className="text-cream/50">Ingresos </span>
          <span className="font-semibold text-yellow">{formatMoney(overview.incomeTotal)}</span>
        </p>
        <p>
          <span className="text-cream/50">Gastos </span>
          <span className="font-semibold text-orange">{formatMoney(overview.expenseTotal)}</span>
        </p>
      </div>
      <div className="flex items-end gap-3" style={{ height: 96 }}>
        {overview.months.map((m) => (
          <div key={m.key} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: 72 }}>
              <div
                title={`Ingresos: ${formatMoney(m.income)}`}
                className="w-2.5 rounded-t bg-yellow"
                style={{ height: `${(m.income / max) * 100}%` }}
              />
              <div
                title={`Gastos: ${formatMoney(m.expense)}`}
                className="w-2.5 rounded-t bg-orange"
                style={{ height: `${(m.expense / max) * 100}%` }}
              />
            </div>
            <span className="text-[10px] uppercase text-cream/40">{m.label}</span>
          </div>
        ))}
      </div>
    </Widget>
  )
}

function actionLabel(action: string, entityType: string): string {
  const ENTITY_LABEL: Record<string, string> = {
    project: "un proyecto",
    task: "una tarea",
    milestone: "un hito",
    process: "un proceso",
    label: "una etiqueta",
    survey: "una encuesta",
    reminder: "un recordatorio",
    custom_field_definition: "un campo personalizado",
    custom_field_value: "un campo personalizado",
  }
  const ACTION_LABEL: Record<string, string> = {
    created: "creó",
    updated: "actualizó",
    deleted: "eliminó",
    member_added: "agregó un miembro a",
    member_removed: "quitó un miembro de",
    case_linked: "vinculó un caso a",
    case_unlinked: "desvinculó un caso de",
    attachment_added: "adjuntó un archivo en",
    attachment_deleted: "borró un archivo de",
    label_attached: "etiquetó",
    label_detached: "desetiquetó",
    assigned: "asignó",
    unassigned: "desasignó",
    commented: "comentó en",
    checklist_item_added: "agregó un ítem de checklist en",
    checklist_item_updated: "actualizó un ítem de checklist en",
    checklist_item_deleted: "borró un ítem de checklist de",
    dependency_added: "agregó una dependencia en",
    dependency_removed: "quitó una dependencia de",
    timer_started: "inició el cronómetro en",
    timer_stopped: "detuvo el cronómetro en",
    expense_added: "cargó un gasto en",
    expense_updated: "actualizó un gasto de",
    expense_deleted: "borró un gasto de",
    note_added: "agregó una nota en",
    note_updated: "editó una nota de",
    note_deleted: "borró una nota de",
    reminder_created: "creó un recordatorio en",
    reminder_done: "completó un recordatorio de",
    reminder_deleted: "borró un recordatorio de",
    settings_updated: "cambió la configuración de",
    question_added: "agregó una pregunta a",
    question_deleted: "borró una pregunta de",
    response_submitted: "respondió",
    custom_field_set: "completó un campo personalizado en",
  }
  const verb = ACTION_LABEL[action] ?? action
  const noun = ENTITY_LABEL[entityType] ?? entityType
  return `${verb} ${noun}`
}

function NavCard({ label, href, disabled }: { label: string; href?: string; disabled?: boolean }) {
  if (disabled || !href) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center font-display font-semibold text-cream/40">
        {label}
        <p className="mt-1 text-[10px] font-normal uppercase tracking-wide text-cream/30">Próximamente</p>
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="block rounded-2xl border border-white/15 bg-white/5 p-5 text-center font-display font-semibold text-cream/80 transition hover:border-yellow/50 hover:bg-white/10"
    >
      {label}
    </Link>
  )
}
