"use client"

import { useEffect, useState } from "react"
import {
  addCaseContact,
  addCaseNeed,
  CASE_STATUS_LABEL,
  CASE_STATUSES,
  CASE_TYPE_LABEL,
  changeCaseStatus,
  FEASIBILITY_LABEL,
  FEASIBILITIES,
  getCase,
  listCases,
  NEED_CATEGORIES,
  NEED_CATEGORY_LABEL,
  NEED_URGENCIES,
  NEED_URGENCY_LABEL,
  resolveCaseNeed,
  updateCase,
  VIABILITY_LABEL,
  VIABILITIES,
  type CaseDetail,
  type CaseListItem,
  type CaseStatus,
  type NeedCategory,
  type NeedUrgency,
} from "../../lib/cases"

const STATUS_COLOR: Record<CaseStatus, string> = {
  activo: "bg-yellow/20 text-yellow",
  en_seguimiento: "bg-blue-500/20 text-blue-300",
  derivado: "bg-orange/20 text-orange",
  cerrado: "bg-white/10 text-cream/50",
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

export function Listado({ canWrite, openCaseId }: { canWrite: boolean; openCaseId?: string | null }) {
  const [cases, setCases] = useState<CaseListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("")
  const [selectedId, setSelectedId] = useState<string | null>(openCaseId ?? null)

  function refresh(status?: CaseStatus | "") {
    listCases(status || undefined)
      .then(setCases)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (openCaseId) setSelectedId(openCaseId)
  }, [openCaseId])

  if (!cases) return <p className="text-cream/50">Cargando...</p>

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setStatusFilter("")
            refresh("")
          }}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${statusFilter === "" ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/70"}`}
        >
          Todos
        </button>
        {CASE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatusFilter(s)
              refresh(s)
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${statusFilter === s ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/70"}`}
          >
            {CASE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="space-y-2">
        {cases.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:border-white/25"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-cream/40">{c.caseNumber}</span>
                <span className="text-sm font-medium text-cream">{c.fullName}</span>
                {c.alias && <span className="text-xs text-cream/50">({c.alias})</span>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[c.status]}`}>
                {CASE_STATUS_LABEL[c.status]}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-cream/50">
              <span>{CASE_TYPE_LABEL[c.caseType]}</span>
              {c.viability && <span>· Viabilidad: {VIABILITY_LABEL[c.viability]}</span>}
              {c.openNeedsCount > 0 && <span className="text-orange">· {c.openNeedsCount} necesidad(es) abiertas</span>}
              <span className="ml-auto">{formatDateTime(c.createdAt)}</span>
            </div>
          </button>
        ))}
        {cases.length === 0 && <p className="text-sm text-cream/50">No hay casos cargados todavía.</p>}
      </div>

      {selectedId && (
        <CaseDetailModal
          id={selectedId}
          canWrite={canWrite}
          onClose={() => setSelectedId(null)}
          onChanged={() => refresh(statusFilter)}
        />
      )}
    </div>
  )
}

function CaseDetailModal({
  id,
  canWrite,
  onClose,
  onChanged,
}: {
  id: string
  canWrite: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contactNotes, setContactNotes] = useState("")
  const [savingContact, setSavingContact] = useState(false)
  const [newNeedCategory, setNewNeedCategory] = useState<NeedCategory>("salud")
  const [newNeedUrgency, setNewNeedUrgency] = useState<NeedUrgency>("normal")
  const [closeReason, setCloseReason] = useState("")
  const [showCloseForm, setShowCloseForm] = useState(false)

  function load() {
    getCase(id)
      .then(setDetail)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleStatusChange(status: CaseStatus) {
    if (status === "cerrado" && !showCloseForm) {
      setShowCloseForm(true)
      return
    }
    try {
      await changeCaseStatus(id, status, status === "cerrado" ? closeReason.trim() : undefined)
      setShowCloseForm(false)
      setCloseReason("")
      load()
      onChanged()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function handleMatrixChange(field: "viability" | "feasibility", value: string) {
    try {
      await updateCase(id, { [field]: value || null } as any)
      load()
      onChanged()
    } catch (e: any) {
      setError(e.message)
    }
  }

  if (!detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-2xl border border-white/15 bg-purple-deep p-6 text-cream/60">
          {error ? <p className="text-orange">{error}</p> : "Cargando..."}
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-cream/40">{detail.caseNumber}</p>
            <h2 className="font-display text-xl font-bold text-yellow">{detail.fullName}</h2>
            {detail.alias && <p className="text-sm text-cream/60">({detail.alias})</p>}
          </div>
          <button onClick={onClose} className="text-cream/50 hover:text-cream">
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="mb-4 flex flex-wrap gap-1.5">
          {CASE_STATUSES.map((s) => (
            <button
              key={s}
              disabled={!canWrite}
              onClick={() => handleStatusChange(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                detail.status === s ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/70 hover:bg-white/20"
              } disabled:opacity-50`}
            >
              {CASE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {showCloseForm && (
          <div className="mb-4 rounded-xl border border-orange/30 bg-orange/10 p-3">
            <label className="mb-2 block text-sm text-cream/70">Motivo de cierre</label>
            <textarea
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              className="mb-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
              rows={2}
            />
            <div className="flex gap-2">
              <button onClick={() => handleStatusChange("cerrado")} className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep">
                Confirmar cierre
              </button>
              <button onClick={() => setShowCloseForm(false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-cream">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/60">Viabilidad</span>
            <select
              disabled={!canWrite}
              value={detail.viability ?? ""}
              onChange={(e) => handleMatrixChange("viability", e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-cream outline-none focus:border-yellow disabled:opacity-50"
            >
              <option value="" className="bg-purple-deep">— sin definir —</option>
              {VIABILITIES.map((v) => (
                <option key={v} value={v} className="bg-purple-deep">
                  {VIABILITY_LABEL[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/60">Factibilidad</span>
            <select
              disabled={!canWrite}
              value={detail.feasibility ?? ""}
              onChange={(e) => handleMatrixChange("feasibility", e.target.value)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-cream outline-none focus:border-yellow disabled:opacity-50"
            >
              <option value="" className="bg-purple-deep">— sin definir —</option>
              {FEASIBILITIES.map((f) => (
                <option key={f} value={f} className="bg-purple-deep">
                  {FEASIBILITY_LABEL[f]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-cream/50">Tipo</dt>
          <dd className="text-cream">{CASE_TYPE_LABEL[detail.caseType]}</dd>
          {detail.approxAge && (
            <>
              <dt className="text-cream/50">Edad aprox.</dt>
              <dd className="text-cream">{detail.approxAge}</dd>
            </>
          )}
          {detail.phone && (
            <>
              <dt className="text-cream/50">Teléfono</dt>
              <dd className="text-cream">{detail.phone}</dd>
            </>
          )}
          {detail.dni && (
            <>
              <dt className="text-cream/50">DNI</dt>
              <dd className="text-cream">{detail.dni}</dd>
            </>
          )}
          {detail.dayZone && (
            <>
              <dt className="text-cream/50">Zona</dt>
              <dd className="text-cream">{detail.dayZone}</dd>
            </>
          )}
          {detail.healthStatus && (
            <>
              <dt className="text-cream/50">Salud</dt>
              <dd className="text-cream">{detail.healthStatus}</dd>
            </>
          )}
        </dl>

        {detail.photos.length > 0 && (
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {detail.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.id} src={p.url} alt="" className="aspect-square rounded-lg object-cover" />
            ))}
          </div>
        )}

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-cream">Necesidades</h3>
          {detail.needs.map((n) => (
            <div key={n.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className={n.resolvedAt ? "text-cream/40 line-through" : "text-cream"}>
                {NEED_CATEGORY_LABEL[n.category]} · {NEED_URGENCY_LABEL[n.urgency]}
                {n.notes ? ` — ${n.notes}` : ""}
              </span>
              {canWrite && (
                <button
                  onClick={async () => {
                    await resolveCaseNeed(id, n.id, !n.resolvedAt)
                    load()
                    onChanged()
                  }}
                  className="text-yellow hover:underline"
                >
                  {n.resolvedAt ? "Reabrir" : "Resolver"}
                </button>
              )}
            </div>
          ))}
          {canWrite && (
            <div className="mt-2 flex gap-2">
              <select
                value={newNeedCategory}
                onChange={(e) => setNewNeedCategory(e.target.value as NeedCategory)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
              >
                {NEED_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-purple-deep">
                    {NEED_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <select
                value={newNeedUrgency}
                onChange={(e) => setNewNeedUrgency(e.target.value as NeedUrgency)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
              >
                {NEED_URGENCIES.map((u) => (
                  <option key={u} value={u} className="bg-purple-deep">
                    {NEED_URGENCY_LABEL[u]}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  await addCaseNeed(id, { category: newNeedCategory, urgency: newNeedUrgency })
                  load()
                  onChanged()
                }}
                className="rounded-lg bg-yellow px-3 text-xs font-semibold text-purple-deep"
              >
                + Agregar
              </button>
            </div>
          )}
        </div>

        <div className="mb-2">
          <h3 className="mb-2 text-sm font-semibold text-cream">Bitácora de contactos</h3>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {detail.contactsHistory.map((c) => (
              <div key={c.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                <p className="text-cream/40">
                  {formatDateTime(c.contactedAt)} · {c.user?.name ?? "—"}
                </p>
                <p className="text-cream">{c.notes}</p>
              </div>
            ))}
            {detail.contactsHistory.length === 0 && <p className="text-xs text-cream/40">Sin contactos registrados.</p>}
          </div>
          {canWrite && (
            <div className="mt-2 flex gap-2">
              <input
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                placeholder="Anotar contacto de hoy..."
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-cream outline-none focus:border-yellow"
              />
              <button
                disabled={savingContact || !contactNotes.trim()}
                onClick={async () => {
                  setSavingContact(true)
                  try {
                    await addCaseContact(id, { notes: contactNotes.trim() })
                    setContactNotes("")
                    load()
                    onChanged()
                  } finally {
                    setSavingContact(false)
                  }
                }}
                className="rounded-lg bg-yellow px-3 text-xs font-semibold text-purple-deep disabled:opacity-50"
              >
                Anotar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
