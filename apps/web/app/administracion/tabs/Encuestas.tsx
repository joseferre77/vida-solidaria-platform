"use client"

import { useEffect, useState } from "react"
import {
  addSurveyQuestion,
  createSurvey,
  deleteSurvey,
  deleteSurveyQuestion,
  getSurveyDetail,
  listSurveyResponses,
  listSurveys,
  type SurveyDetail,
  type SurveyItem,
  type SurveyQuestionType,
  type SurveyResponseItem,
} from "../../../lib/projects"
import { formatDateTime } from "../../../lib/format"

const QUESTION_TYPES: { value: SurveyQuestionType; label: string }[] = [
  { value: "TEXT", label: "Texto" },
  { value: "NUMBER", label: "Número" },
  { value: "SINGLE_CHOICE", label: "Opción única" },
  { value: "MULTIPLE_CHOICE", label: "Opción múltiple" },
  { value: "SCALE", label: "Escala (1-5)" },
  { value: "BOOLEAN", label: "Sí / No" },
  { value: "DATE", label: "Fecha" },
]

/** Fase G — encuestas: por ahora solo STANDALONE (no hay picker de Proyecto/Caso todavía). */
export function Encuestas({ currentUserId }: { currentUserId: string }) {
  const [surveys, setSurveys] = useState<SurveyItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  function refresh() {
    listSurveys()
      .then(setSurveys)
      .catch((e) => setError(e.message))
  }

  useEffect(refresh, [])

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex justify-end">
        <button onClick={() => setShowForm(true)} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90">
          + Nueva encuesta
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {!surveys ? (
        <p className="text-cream/50">Cargando...</p>
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpenId(s.id)}
              className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:border-yellow/30"
            >
              <div>
                <p className="text-sm font-medium text-cream">{s.title}</p>
                <p className="text-[11px] text-cream/40">
                  {s._count?.questions ?? 0} pregunta{s._count?.questions === 1 ? "" : "s"} · {s._count?.responses ?? 0} respuesta
                  {s._count?.responses === 1 ? "" : "s"}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${s.isActive ? "bg-yellow/20 text-yellow" : "bg-white/10 text-cream/40"}`}>
                {s.isActive ? "Activa" : "Inactiva"}
              </span>
            </button>
          ))}
          {surveys.length === 0 && <p className="text-sm text-cream/50">Todavía no hay encuestas creadas.</p>}
        </div>
      )}

      {showForm && (
        <NewSurveyModal
          onClose={() => setShowForm(false)}
          onCreated={(id) => {
            setShowForm(false)
            refresh()
            setOpenId(id)
          }}
        />
      )}

      {openId && (
        <SurveyDetailModal
          surveyId={openId}
          currentUserId={currentUserId}
          onClose={() => setOpenId(null)}
          onChanged={refresh}
          onDeleted={() => {
            setOpenId(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function NewSurveyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim()) return
          setSaving(true)
          setError(null)
          try {
            const survey = await createSurvey({ title: title.trim(), description: description || undefined })
            onCreated(survey.id)
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear la encuesta")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nueva encuesta</h2>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Título *</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Descripción</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>
        {error && <p className="mb-3 text-sm text-orange">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Creando..." : "Crear y agregar preguntas"}
          </button>
        </div>
      </form>
    </div>
  )
}

function SurveyDetailModal({
  surveyId,
  onClose,
  onChanged,
  onDeleted,
}: {
  surveyId: string
  currentUserId: string
  onClose: () => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null)
  const [responses, setResponses] = useState<SurveyResponseItem[] | null>(null)
  const [view, setView] = useState<"preguntas" | "respuestas">("preguntas")
  const [error, setError] = useState<string | null>(null)
  const [showQForm, setShowQForm] = useState(false)

  function refreshSurvey() {
    getSurveyDetail(surveyId)
      .then(setSurvey)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refreshSurvey()
  }, [surveyId])

  useEffect(() => {
    if (view === "respuestas" && !responses) {
      listSurveyResponses(surveyId)
        .then(setResponses)
        .catch((e) => setError(e.message))
    }
  }, [view, surveyId, responses])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6">
        {!survey ? (
          <p className="text-cream/50">Cargando...</p>
        ) : (
          <>
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-yellow">{survey.title}</h2>
              <button onClick={onClose} className="text-cream/40 hover:text-cream">
                ✕
              </button>
            </div>
            {survey.description && <p className="mb-3 text-sm text-cream/60">{survey.description}</p>}

            <div className="mb-4 flex gap-1 rounded-xl border border-white/15 bg-white/5 p-1 text-sm">
              <button
                onClick={() => setView("preguntas")}
                className={`flex-1 rounded-lg py-1.5 font-medium transition ${view === "preguntas" ? "bg-yellow text-purple-deep" : "text-cream/60"}`}
              >
                Preguntas ({survey.questions.length})
              </button>
              <button
                onClick={() => setView("respuestas")}
                className={`flex-1 rounded-lg py-1.5 font-medium transition ${view === "respuestas" ? "bg-yellow text-purple-deep" : "text-cream/60"}`}
              >
                Respuestas ({survey._count?.responses ?? 0})
              </button>
            </div>

            {error && <p className="mb-3 text-sm text-orange">{error}</p>}

            {view === "preguntas" && (
              <div>
                <div className="mb-3 space-y-2">
                  {survey.questions.map((q) => (
                    <div key={q.id} className="flex items-start justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      <div>
                        <p className="text-sm text-cream">
                          {q.label} {q.required && <span className="text-orange">*</span>}
                        </p>
                        <p className="text-[11px] text-cream/40">
                          {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
                          {q.options.length > 0 ? ` — ${q.options.join(", ")}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (!confirm(`¿Eliminar la pregunta "${q.label}"?`)) return
                          deleteSurveyQuestion(q.id)
                            .then(() => {
                              refreshSurvey()
                              onChanged()
                            })
                            .catch((e) => setError(e.message))
                        }}
                        className="shrink-0 text-cream/30 hover:text-orange"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {survey.questions.length === 0 && <p className="text-sm text-cream/50">Todavía no hay preguntas.</p>}
                </div>

                {showQForm ? (
                  <NewQuestionForm
                    surveyId={surveyId}
                    sortOrder={survey.questions.length}
                    onDone={() => {
                      setShowQForm(false)
                      refreshSurvey()
                      onChanged()
                    }}
                    onCancel={() => setShowQForm(false)}
                  />
                ) : (
                  <button onClick={() => setShowQForm(true)} className="w-full rounded-xl border border-dashed border-white/20 py-2 text-sm text-cream/60 hover:border-yellow/40 hover:text-cream">
                    + Agregar pregunta
                  </button>
                )}
              </div>
            )}

            {view === "respuestas" && (
              <div className="space-y-3">
                {!responses ? (
                  <p className="text-sm text-cream/50">Cargando...</p>
                ) : responses.length === 0 ? (
                  <p className="text-sm text-cream/50">Todavía no hay respuestas.</p>
                ) : (
                  responses.map((r) => (
                    <div key={r.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="mb-1.5 text-xs text-cream/50">
                        <span className="font-medium text-cream/80">{r.user?.name ?? "—"}</span> · {formatDateTime(r.submittedAt)}
                      </p>
                      <ul className="space-y-1 text-sm">
                        {r.answers.map((a) => (
                          <li key={a.id} className="text-cream/80">
                            <span className="text-cream/50">{a.question?.label ?? "—"}:</span> {String(a.value)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            )}

            <div className="mt-5 flex justify-between border-t border-white/10 pt-4">
              <button
                onClick={() => {
                  if (!confirm(`¿Eliminar la encuesta "${survey.title}"? Se pierden sus preguntas y respuestas.`)) return
                  deleteSurvey(survey.id).then(onDeleted).catch((e) => setError(e.message))
                }}
                className="text-sm text-orange hover:underline"
              >
                Eliminar encuesta
              </button>
              <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function NewQuestionForm({
  surveyId,
  sortOrder,
  onDone,
  onCancel,
}: {
  surveyId: string
  sortOrder: number
  onDone: () => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState("")
  const [type, setType] = useState<SurveyQuestionType>("TEXT")
  const [optionsText, setOptionsText] = useState("")
  const [required, setRequired] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsOptions = type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE"

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!label.trim()) return
        setSaving(true)
        setError(null)
        try {
          await addSurveyQuestion(surveyId, {
            label: label.trim(),
            type,
            options: needsOptions ? optionsText.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
            required,
            sortOrder,
          })
          onDone()
        } catch (err: any) {
          setError(err.message ?? "No se pudo agregar la pregunta")
        } finally {
          setSaving(false)
        }
      }}
      className="rounded-xl border border-white/15 bg-white/5 p-3"
    >
      <label className="mb-2 block text-sm">
        <span className="mb-1 block text-cream/70">Pregunta *</span>
        <input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-cream outline-none focus:border-yellow"
        />
      </label>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as SurveyQuestionType)}
          className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        >
          {QUESTION_TYPES.map((t) => (
            <option key={t.value} value={t.value} className="bg-papel text-tinta">
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-cream/80">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Obligatoria
        </label>
      </div>
      {needsOptions && (
        <input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder="Opciones separadas por coma"
          className="mb-2 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        />
      )}
      {error && <p className="mb-2 text-xs text-orange">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-yellow px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
          {saving ? "Guardando..." : "Agregar"}
        </button>
      </div>
    </form>
  )
}
