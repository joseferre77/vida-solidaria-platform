"use client"

import { useEffect, useState } from "react"
import {
  addCaseContact,
  addCaseMember,
  addCaseMemberNeed,
  addCaseMemberPhoto,
  addCaseMemberSkill,
  addCaseNeed,
  addCaseSkill,
  assignCaseUser,
  CASE_ASSIGNMENT_ROLE_LABEL,
  CASE_ASSIGNMENT_ROLES,
  CASE_STATUS_LABEL,
  CASE_STATUSES,
  CASE_TYPE_LABEL,
  changeCaseStatus,
  deleteCaseMember,
  deleteCaseMemberPhoto,
  deleteCaseMemberSkill,
  deleteCaseSkill,
  FEASIBILITY_LABEL,
  FEASIBILITIES,
  getCase,
  listCases,
  NEED_CATEGORIES,
  NEED_CATEGORY_LABEL,
  NEED_URGENCIES,
  NEED_URGENCY_LABEL,
  resolveCaseMemberNeed,
  resolveCaseNeed,
  STAY_TYPE_LABEL,
  unassignCaseUser,
  updateCase,
  uploadCaseFile,
  VIABILITY_LABEL,
  VIABILITIES,
  type CaseAssignmentRole,
  type CaseDetail,
  type CaseListItem,
  type CaseMemberItem,
  type CaseStatus,
  type NeedCategory,
  type NeedUrgency,
} from "../../lib/cases"
import { listBasicUsers, type BasicUser } from "../../lib/projects"

const STATUS_COLOR: Record<CaseStatus, string> = {
  activo: "bg-yellow/20 text-yellow",
  en_seguimiento: "bg-blue-500/20 text-blue-300",
  derivado: "bg-orange/20 text-orange",
  cerrado: "bg-white/10 text-cream/50",
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/**
 * Popup para ver una foto grande y compartirla — se abre al tocar/clickear
 * cualquier foto de un caso o de un integrante. Usa el Web Share API nativo
 * del celular cuando está disponible (compartir por WhatsApp, etc.) y si no
 * existe, copia el link de la foto al portapapeles como respaldo.
 */
function PhotoLightbox({
  photos,
  startIndex,
  onClose,
}: {
  photos: { id: string; url: string }[]
  startIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(startIndex)
  const [copied, setCopied] = useState(false)
  const photo = photos[index]

  if (!photo) return null

  async function handleShare() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: photo.url })
        return
      }
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(photo.url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // el usuario canceló el share nativo — no hacer nada
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute right-4 top-4 text-2xl text-white/80 hover:text-white">
        ✕
      </button>

      <div
        className="relative flex max-h-[75vh] w-full max-w-lg flex-1 items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {photos.length > 1 && (
          <button
            onClick={() => setIndex((index - 1 + photos.length) % photos.length)}
            className="absolute left-0 z-10 rounded-full bg-black/50 px-3 py-2 text-xl text-white"
          >
            ‹
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.url} alt="" className="max-h-[75vh] max-w-full rounded-lg object-contain" />
        {photos.length > 1 && (
          <button
            onClick={() => setIndex((index + 1) % photos.length)}
            className="absolute right-0 z-10 rounded-full bg-black/50 px-3 py-2 text-xl text-white"
          >
            ›
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {photos.length > 1 && (
          <span className="text-xs text-white/60">
            {index + 1} / {photos.length}
          </span>
        )}
        <button onClick={handleShare} className="rounded-full bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep">
          {copied ? "¡Link copiado!" : "Compartir"}
        </button>
      </div>
    </div>
  )
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
              {c.memberCount > 0 && <span>· +{c.memberCount} integrante(s)</span>}
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
  const [newSkillLabel, setNewSkillLabel] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

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
          {detail.sex && (
            <>
              <dt className="text-cream/50">Sexo</dt>
              <dd className="text-cream">{detail.sex}</dd>
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
          {detail.stayType && (
            <>
              <dt className="text-cream/50">Permanencia</dt>
              <dd className="text-cream">{STAY_TYPE_LABEL[detail.stayType]}</dd>
            </>
          )}
          {detail.currentSleepSpot && (
            <>
              <dt className="text-cream/50">Dónde duerme</dt>
              <dd className="text-cream">{detail.currentSleepSpot}</dd>
            </>
          )}
          {detail.wantsToWork !== null && (
            <>
              <dt className="text-cream/50">¿Quiere trabajar?</dt>
              <dd className="text-cream">{detail.wantsToWork ? "Sí" : "No"}</dd>
            </>
          )}
          {detail.workAptitude && (
            <>
              <dt className="text-cream/50">Aptitud / oficio</dt>
              <dd className="text-cream">{detail.workAptitude}</dd>
            </>
          )}
        </dl>

        {(detail.healthStatus || detail.legalSituation || detail.substanceUse || detail.closeReason) && (
          <div className="mb-4 space-y-1.5 text-sm">
            {detail.healthStatus && (
              <p>
                <span className="text-cream/50">Salud:</span> <span className="text-cream">{detail.healthStatus}</span>
              </p>
            )}
            {detail.legalSituation && (
              <p>
                <span className="text-cream/50">Situación legal:</span>{" "}
                <span className="text-cream">{detail.legalSituation}</span>
              </p>
            )}
            {detail.substanceUse && (
              <p>
                <span className="text-cream/50">Consumo:</span> <span className="text-cream">{detail.substanceUse}</span>
              </p>
            )}
            {detail.status === "cerrado" && detail.closeReason && (
              <p>
                <span className="text-cream/50">Motivo de cierre:</span>{" "}
                <span className="text-cream">{detail.closeReason}</span>
              </p>
            )}
          </div>
        )}

        {detail.photos.length > 0 && (
          <div className="mb-4 grid grid-cols-4 gap-1.5">
            {detail.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="aspect-square overflow-hidden rounded-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {lightboxIndex !== null && (
          <PhotoLightbox photos={detail.photos} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
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

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-cream">
            Habilidades{detail.caseType !== "individual" ? " (referente)" : ""}
          </h3>
          {detail.skills.map((s) => (
            <div key={s.id} className="mb-1.5 flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className="text-cream">
                {s.skillLabel}
                {s.level ? ` — ${s.level}` : ""}
              </span>
              {canWrite && (
                <button
                  onClick={async () => {
                    await deleteCaseSkill(id, s.id)
                    load()
                    onChanged()
                  }}
                  className="text-orange hover:underline"
                >
                  Quitar
                </button>
              )}
            </div>
          ))}
          {detail.skills.length === 0 && <p className="text-xs text-cream/40">Sin habilidades cargadas.</p>}
          {canWrite && (
            <div className="mt-2 flex gap-2">
              <input
                value={newSkillLabel}
                onChange={(e) => setNewSkillLabel(e.target.value)}
                placeholder="Ej: electricista"
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-cream outline-none focus:border-yellow"
              />
              <button
                onClick={async () => {
                  if (!newSkillLabel.trim()) return
                  await addCaseSkill(id, { skillLabel: newSkillLabel.trim() })
                  setNewSkillLabel("")
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

        {detail.locations.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-sm font-semibold text-cream">Ubicaciones registradas</h3>
            <div className="space-y-1.5">
              {detail.locations.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                  <span className="text-cream/70">
                    {formatDateTime(l.recordedAt)} · {l.recordedBy?.name ?? "—"}
                  </span>
                  <a
                    href={mapsLink(l.lat, l.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-yellow hover:underline"
                  >
                    Ver en mapa
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {(detail.caseType !== "individual" || detail.members.length > 0) && (
          <MembersSection id={id} members={detail.members} canWrite={canWrite} onChanged={() => { load(); onChanged() }} />
        )}

        <AssignmentsSection
          id={id}
          assignments={detail.assignments}
          canWrite={canWrite}
          onChanged={() => { load(); onChanged() }}
        />

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

        <p className="border-t border-white/10 pt-3 text-[11px] text-cream/40">
          Cargado por {detail.createdBy?.name ?? "—"} el {formatDateTime(detail.createdAt)}
          {detail.updatedBy && <> · última edición: {detail.updatedBy.name}</>}
        </p>
      </div>
    </div>
  )
}

/**
 * Fase K bloque D — quién lleva el caso. Al asignar/desasignar se avisa
 * por notificación + email a esa persona (ver cases.routes.ts); acá solo
 * se muestra el equipo activo y se arma/deshace la asignación. El
 * historial (gente ya desasignada) no se muestra acá a propósito, para no
 * saturar la ficha — queda en la base para el ranking del bloque G.
 */
function AssignmentsSection({
  id,
  assignments,
  canWrite,
  onChanged,
}: {
  id: string
  assignments: CaseDetail["assignments"]
  canWrite: boolean
  onChanged: () => void
}) {
  const [allUsers, setAllUsers] = useState<BasicUser[] | null>(null)
  const [pickUserId, setPickUserId] = useState("")
  const [pickRole, setPickRole] = useState<CaseAssignmentRole>("coordinador")
  const [error, setError] = useState<string | null>(null)

  const active = assignments.filter((a) => !a.unassignedAt)

  useEffect(() => {
    if (canWrite && !allUsers) {
      listBasicUsers()
        .then(setAllUsers)
        .catch((e) => setError(e.message))
    }
  }, [canWrite, allUsers])

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-semibold text-cream">Equipo asignado</h3>
      {error && <p className="mb-2 text-xs text-orange">{error}</p>}
      <div className="space-y-1.5">
        {active.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
            <span className="text-cream">
              {a.user?.name ?? "—"} <span className="text-cream/50">— {a.roleLabel}</span>
            </span>
            {canWrite && (
              <button
                onClick={async () => {
                  try {
                    await unassignCaseUser(id, a.id)
                    onChanged()
                  } catch (e: any) {
                    setError(e.message)
                  }
                }}
                className="text-orange hover:underline"
              >
                Desasignar
              </button>
            )}
          </div>
        ))}
        {active.length === 0 && <p className="text-xs text-cream/40">Todavía nadie asignado a este caso.</p>}
      </div>

      {canWrite && allUsers && (
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            value={pickUserId}
            onChange={(e) => setPickUserId(e.target.value)}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-purple-deep">
              Elegir persona...
            </option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id} className="bg-purple-deep">
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={pickRole}
            onChange={(e) => setPickRole(e.target.value as CaseAssignmentRole)}
            className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
          >
            {CASE_ASSIGNMENT_ROLES.map((r) => (
              <option key={r} value={r} className="bg-purple-deep">
                {CASE_ASSIGNMENT_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            disabled={!pickUserId}
            onClick={async () => {
              try {
                await assignCaseUser(id, { userId: pickUserId, role: pickRole })
                setPickUserId("")
                onChanged()
              } catch (e: any) {
                setError(e.message)
              }
            }}
            className="rounded-lg bg-yellow px-3 text-xs font-semibold text-purple-deep disabled:opacity-50"
          >
            + Asignar
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Fase J.1 — el resto del grupo (pareja / grupo familiar) además del
 * referente. Cada integrante tiene sus propios datos, diagnóstico y
 * necesidades/habilidades — antes no había dónde cargarlos.
 */
function MembersSection({
  id,
  members,
  canWrite,
  onChanged,
}: {
  id: string
  members: CaseMemberItem[]
  canWrite: boolean
  onChanged: () => void
}) {
  const [showAdd, setShowAdd] = useState(false)

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-cream">Integrantes del grupo ({members.length})</h3>
        {canWrite && (
          <button onClick={() => setShowAdd((v) => !v)} className="text-xs text-yellow hover:underline">
            {showAdd ? "Cancelar" : "+ Agregar integrante"}
          </button>
        )}
      </div>

      {showAdd && (
        <AddMemberForm
          id={id}
          onDone={() => {
            setShowAdd(false)
            onChanged()
          }}
        />
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <MemberCard key={m.id} id={id} member={m} canWrite={canWrite} onChanged={onChanged} />
        ))}
        {members.length === 0 && !showAdd && (
          <p className="text-xs text-cream/40">Todavía no se cargó a nadie más del grupo.</p>
        )}
      </div>
    </div>
  )
}

function MemberCard({
  id,
  member,
  canWrite,
  onChanged,
}: {
  id: string
  member: CaseMemberItem
  canWrite: boolean
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [newNeedCategory, setNewNeedCategory] = useState<NeedCategory>("salud")
  const [newNeedUrgency, setNewNeedUrgency] = useState<NeedUrgency>("normal")
  const [newSkill, setNewSkill] = useState("")
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  async function handlePhotoInput(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingPhoto(true)
    try {
      for (const file of Array.from(files)) {
        const res = await uploadCaseFile(file)
        await addCaseMemberPhoto(id, member.id, res.fileUrl)
      }
      onChanged()
    } finally {
      setUploadingPhoto(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <span className="text-sm font-medium text-cream">{member.fullName}</span>
          {member.alias && <span className="ml-1.5 text-xs text-cream/50">({member.alias})</span>}
          {member.approxAge && <span className="ml-1.5 text-xs text-cream/50">· {member.approxAge} años</span>}
        </div>
        <span className="text-xs text-cream/40">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            {member.dni && (
              <>
                <dt className="text-cream/50">DNI</dt>
                <dd className="text-cream">{member.dni}</dd>
              </>
            )}
            {member.sex && (
              <>
                <dt className="text-cream/50">Sexo</dt>
                <dd className="text-cream">{member.sex}</dd>
              </>
            )}
            {member.wantsToWork !== null && (
              <>
                <dt className="text-cream/50">¿Quiere trabajar?</dt>
                <dd className="text-cream">{member.wantsToWork ? "Sí" : "No"}</dd>
              </>
            )}
            {member.workAptitude && (
              <>
                <dt className="text-cream/50">Aptitud</dt>
                <dd className="text-cream">{member.workAptitude}</dd>
              </>
            )}
          </dl>
          {member.healthStatus && (
            <p>
              <span className="text-cream/50">Salud:</span> {member.healthStatus}
            </p>
          )}
          {member.legalSituation && (
            <p>
              <span className="text-cream/50">Situación legal:</span> {member.legalSituation}
            </p>
          )}
          {member.substanceUse && (
            <p>
              <span className="text-cream/50">Consumo:</span> {member.substanceUse}
            </p>
          )}

          <div>
            <p className="mb-1 font-medium text-cream">Fotos</p>
            {member.photos.length > 0 && (
              <div className="mb-1.5 grid grid-cols-4 gap-1">
                {member.photos.map((p, i) => (
                  <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg">
                    <button type="button" onClick={() => setLightboxIndex(i)} className="h-full w-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-full w-full object-cover" />
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await deleteCaseMemberPhoto(id, member.id, p.id)
                          onChanged()
                        }}
                        className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1 text-[10px] text-white opacity-0 group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {member.photos.length === 0 && <p className="text-cream/40">Sin fotos cargadas.</p>}
            {canWrite && (
              <label className="mt-1.5 inline-block cursor-pointer rounded-lg border border-white/20 px-2 py-1 text-cream">
                {uploadingPhoto ? "Subiendo..." : "📷 Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => handlePhotoInput(e.target.files)}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
              </label>
            )}
            {lightboxIndex !== null && (
              <PhotoLightbox photos={member.photos} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
            )}
          </div>

          <div>
            <p className="mb-1 font-medium text-cream">Necesidades</p>
            {member.needs.map((n) => (
              <div key={n.id} className="mb-1 flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
                <span className={n.resolvedAt ? "text-cream/40 line-through" : "text-cream"}>
                  {NEED_CATEGORY_LABEL[n.category]} · {NEED_URGENCY_LABEL[n.urgency]}
                  {n.notes ? ` — ${n.notes}` : ""}
                </span>
                {canWrite && (
                  <button
                    onClick={async () => {
                      await resolveCaseMemberNeed(id, member.id, n.id, !n.resolvedAt)
                      onChanged()
                    }}
                    className="text-yellow hover:underline"
                  >
                    {n.resolvedAt ? "Reabrir" : "Resolver"}
                  </button>
                )}
              </div>
            ))}
            {member.needs.length === 0 && <p className="text-cream/40">Sin necesidades cargadas.</p>}
            {canWrite && (
              <div className="mt-1.5 flex gap-1.5">
                <select
                  value={newNeedCategory}
                  onChange={(e) => setNewNeedCategory(e.target.value as NeedCategory)}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-1.5 py-1 text-cream outline-none focus:border-yellow"
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
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-1.5 py-1 text-cream outline-none focus:border-yellow"
                >
                  {NEED_URGENCIES.map((u) => (
                    <option key={u} value={u} className="bg-purple-deep">
                      {NEED_URGENCY_LABEL[u]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    await addCaseMemberNeed(id, member.id, { category: newNeedCategory, urgency: newNeedUrgency })
                    onChanged()
                  }}
                  className="rounded-lg bg-yellow px-2 font-semibold text-purple-deep"
                >
                  +
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 font-medium text-cream">Habilidades</p>
            {member.skills.map((s) => (
              <div key={s.id} className="mb-1 flex items-center justify-between rounded-lg bg-white/5 px-2 py-1.5">
                <span className="text-cream">{s.skillLabel}</span>
                {canWrite && (
                  <button
                    onClick={async () => {
                      await deleteCaseMemberSkill(id, member.id, s.id)
                      onChanged()
                    }}
                    className="text-orange hover:underline"
                  >
                    Quitar
                  </button>
                )}
              </div>
            ))}
            {member.skills.length === 0 && <p className="text-cream/40">Sin habilidades cargadas.</p>}
            {canWrite && (
              <div className="mt-1.5 flex gap-1.5">
                <input
                  value={newSkill}
                  onChange={(e) => setNewSkill(e.target.value)}
                  placeholder="Ej: electricista"
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-cream outline-none focus:border-yellow"
                />
                <button
                  onClick={async () => {
                    if (!newSkill.trim()) return
                    await addCaseMemberSkill(id, member.id, { skillLabel: newSkill.trim() })
                    setNewSkill("")
                    onChanged()
                  }}
                  className="rounded-lg bg-yellow px-2 font-semibold text-purple-deep"
                >
                  +
                </button>
              </div>
            )}
          </div>

          {canWrite && (
            <button
              onClick={async () => {
                await deleteCaseMember(id, member.id)
                onChanged()
              }}
              className="text-orange hover:underline"
            >
              Quitar integrante
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AddMemberForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [fullName, setFullName] = useState("")
  const [alias, setAlias] = useState("")
  const [approxAge, setApproxAge] = useState("")
  const [dni, setDni] = useState("")
  const [sex, setSex] = useState("")
  const [healthStatus, setHealthStatus] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mb-3 rounded-xl border border-white/15 bg-white/5 p-3">
      {error && <p className="mb-2 text-xs text-orange">{error}</p>}
      <div className="mb-2 grid grid-cols-2 gap-2">
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Nombre completo *"
          className="col-span-2 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
        <input
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          placeholder="Alias"
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
        <input
          value={approxAge}
          onChange={(e) => setApproxAge(e.target.value.replace(/\D/g, ""))}
          placeholder="Edad aprox."
          inputMode="numeric"
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
        <input
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          placeholder="DNI"
          inputMode="numeric"
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
        <input
          value={sex}
          onChange={(e) => setSex(e.target.value)}
          placeholder="Sexo"
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
        <textarea
          value={healthStatus}
          onChange={(e) => setHealthStatus(e.target.value)}
          placeholder="Estado de salud observado"
          rows={2}
          className="col-span-2 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-xs text-cream outline-none focus:border-yellow"
        />
      </div>
      <button
        disabled={saving || fullName.trim().length < 2}
        onClick={async () => {
          setSaving(true)
          setError(null)
          try {
            await addCaseMember(id, {
              fullName: fullName.trim(),
              alias: alias.trim() || undefined,
              approxAge: approxAge ? Number(approxAge) : undefined,
              dni: dni.trim() || undefined,
              sex: sex.trim() || undefined,
              healthStatus: healthStatus.trim() || undefined,
            })
            onDone()
          } catch (e: any) {
            setError(e.message ?? "No se pudo agregar el integrante")
          } finally {
            setSaving(false)
          }
        }}
        className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar integrante"}
      </button>
    </div>
  )
}
