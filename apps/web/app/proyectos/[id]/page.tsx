"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { fetchMe, type SessionUser } from "../../../lib/auth"
import {
  getProject,
  getProjectAccess,
  getProjectPlan,
  getRunningTimer,
  listBasicUsers,
  listLabels,
  listProcesses,
  listProjectAttachments,
  listProjectComments,
  listProjectExpenses,
  listProjectNotes,
  listProjectTasks,
  listProjectTimeEntries,
  type BasicUser,
  type LabelItem,
  type ProcessItem,
  type ProjectAttachmentItem,
  type ProjectCommentFeedItem,
  type ProjectDetail,
  type ProjectPlan,
  type ExpenseItem,
  type ProjectNoteItem,
  type TaskItem,
  type TimeEntryItem,
} from "../../../lib/projects"
import { TaskDetailModal } from "./TaskDetailModal"
import { ProjectHeaderActions } from "./ProjectHeaderActions"
import { VistaGeneral } from "./tabs/VistaGeneral"
import { Kanban } from "./tabs/Kanban"
import { ListaTareas } from "./tabs/ListaTareas"
import { Procesos } from "./tabs/Procesos"
import { Plan } from "./tabs/Plan"
import { Notas } from "./tabs/Notas"
import { Archivos } from "./tabs/Archivos"
import { Comentarios } from "./tabs/Comentarios"
import { HojaDeTiempo } from "./tabs/HojaDeTiempo"
import { Gastos } from "./tabs/Gastos"

type TabKey = "general" | "lista" | "kanban" | "procesos" | "plan" | "notas" | "archivos" | "comentarios" | "tiempo" | "gastos"

const TABS: { key: TabKey; label: string }[] = [
  { key: "general", label: "Vista General" },
  { key: "lista", label: "Lista de Tareas" },
  { key: "kanban", label: "Kanban" },
  { key: "procesos", label: "Procesos" },
  { key: "plan", label: "Plan" },
  { key: "notas", label: "Notas" },
  { key: "archivos", label: "Archivos" },
  { key: "comentarios", label: "Comentarios" },
  { key: "tiempo", label: "Hoja de Tiempo" },
  { key: "gastos", label: "Gastos" },
]

/**
 * Fase D — la página de un proyecto ahora es un shell con barra de
 * pestañas (antes era solo el Kanban). Los datos "núcleo" (proyecto,
 * usuarios, procesos, tareas planas) se cargan siempre porque varias
 * pestañas y el header los necesitan; los datos propios de cada pestaña
 * (notas, archivos, gastos, etc.) se cargan recién al entrar a esa
 * pestaña, para no pedir 10 endpoints de una si la persona solo mira el
 * Kanban.
 */
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined)
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [users, setUsers] = useState<BasicUser[]>([])
  const [processes, setProcesses] = useState<ProcessItem[]>([])
  const [allTasks, setAllTasks] = useState<TaskItem[]>([])
  const [labels, setLabels] = useState<LabelItem[]>([])
  const [runningTimer, setRunningTimer] = useState<Awaited<ReturnType<typeof getRunningTimer>>>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>("general")
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const [notes, setNotes] = useState<ProjectNoteItem[] | null>(null)
  const [attachments, setAttachments] = useState<ProjectAttachmentItem[] | null>(null)
  const [expenses, setExpenses] = useState<ExpenseItem[] | null>(null)
  const [timeEntries, setTimeEntries] = useState<TimeEntryItem[] | null>(null)
  const [comments, setComments] = useState<ProjectCommentFeedItem[] | null>(null)
  const [plan, setPlan] = useState<ProjectPlan | null>(null)

  useEffect(() => {
    fetchMe().then((u) => {
      if (!u) return router.replace("/login")
      setUser(u)
    })
  }, [router])

  async function refreshCore() {
    try {
      const [p, u, procs, tasks, lbls, timer] = await Promise.all([
        getProject(id),
        listBasicUsers(),
        listProcesses(id),
        listProjectTasks(id),
        listLabels(),
        getRunningTimer(),
      ])
      setProject(p)
      setUsers(u)
      setProcesses(procs)
      setAllTasks(tasks)
      setLabels(lbls)
      setRunningTimer(timer)
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (user) refreshCore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id])

  async function refreshTabData(tab: TabKey) {
    try {
      if (tab === "notas") setNotes(await listProjectNotes(id))
      else if (tab === "archivos") setAttachments(await listProjectAttachments(id))
      else if (tab === "gastos") setExpenses(await listProjectExpenses(id))
      else if (tab === "tiempo") setTimeEntries(await listProjectTimeEntries(id))
      else if (tab === "comentarios") setComments(await listProjectComments(id))
      else if (tab === "plan") setPlan(await getProjectPlan(id))
    } catch (e: any) {
      setError(e.message)
    }
  }

  useEffect(() => {
    if (user) refreshTabData(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeTab, id])

  async function onChanged() {
    await Promise.all([refreshCore(), refreshTabData(activeTab)])
  }

  if (user === undefined || (user && !project && !error)) {
    return <p className="p-8 text-cream/60">Cargando...</p>
  }

  if (error && !project) {
    return <p className="p-8 text-orange">{error}</p>
  }

  if (!project) return null

  const access = getProjectAccess(user, project)

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <header className="mb-6">
        <Link href="/proyectos" className="text-xs text-cream/50 hover:underline">
          ← Todos los proyectos
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-yellow">{project.name}</h1>
            <p className="mt-1 text-xs text-cream/50">
              {project.code} · {project.members.length} miembro{project.members.length === 1 ? "" : "s"}
            </p>
          </div>
          <ProjectHeaderActions
            project={project}
            allTasks={allTasks}
            runningTaskId={runningTimer?.taskId ?? null}
            runningEntryId={runningTimer?.id ?? null}
            canWrite={access.canWrite}
            canAdmin={access.canAdmin}
            onChanged={onChanged}
            onProjectDeleted={() => router.replace("/proyectos")}
          />
        </div>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
              activeTab === t.key ? "border-yellow text-yellow" : "border-transparent text-cream/50 hover:text-cream/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <p className="mb-4 rounded-xl border border-orange/40 bg-orange/10 p-3 text-sm text-orange">{error}</p>}

      {activeTab === "general" && <VistaGeneral project={project} users={users} canAdmin={access.canAdmin} onChanged={onChanged} />}
      {activeTab === "lista" && <ListaTareas tasks={allTasks} onOpenTask={setOpenTaskId} />}
      {activeTab === "kanban" && (
        <Kanban project={project} processes={processes} canWrite={access.canWrite} onOpenTask={setOpenTaskId} onChanged={onChanged} />
      )}
      {activeTab === "procesos" && (
        <Procesos projectId={id} processes={processes} canWrite={access.canWrite} onChanged={onChanged} />
      )}
      {activeTab === "plan" && (plan ? <Plan plan={plan} /> : <p className="text-cream/50">Cargando...</p>)}
      {activeTab === "notas" &&
        (notes ? <Notas projectId={id} notes={notes} canWrite={access.canWrite} onChanged={onChanged} /> : <p className="text-cream/50">Cargando...</p>)}
      {activeTab === "archivos" &&
        (attachments ? (
          <Archivos projectId={id} attachments={attachments} canWrite={access.canWrite} onChanged={onChanged} />
        ) : (
          <p className="text-cream/50">Cargando...</p>
        ))}
      {activeTab === "comentarios" &&
        (comments ? <Comentarios comments={comments} onOpenTask={setOpenTaskId} /> : <p className="text-cream/50">Cargando...</p>)}
      {activeTab === "tiempo" && (timeEntries ? <HojaDeTiempo entries={timeEntries} /> : <p className="text-cream/50">Cargando...</p>)}
      {activeTab === "gastos" &&
        (expenses ? (
          <Gastos projectId={id} expenses={expenses} users={users} canWrite={access.canWrite} canDelete={access.canAdmin} onChanged={onChanged} />
        ) : (
          <p className="text-cream/50">Cargando...</p>
        ))}

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          boardColumns={project.boards[0]?.columns.map((c) => ({ id: c.id, name: c.name })) ?? []}
          processes={processes}
          users={users}
          allTasks={allTasks.map((t) => ({ id: t.id, title: t.title }))}
          canWrite={access.canWrite}
          canDelete={access.canAdmin}
          onClose={() => setOpenTaskId(null)}
          onChanged={onChanged}
        />
      )}
    </main>
  )
}
