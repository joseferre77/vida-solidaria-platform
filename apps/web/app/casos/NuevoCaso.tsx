"use client"

import { useEffect, useState } from "react"
import {
  CASE_STATUS_LABEL,
  CASE_TYPE_LABEL,
  CASE_TYPES,
  createCase,
  NEED_CATEGORIES,
  NEED_CATEGORY_LABEL,
  NEED_URGENCIES,
  NEED_URGENCY_LABEL,
  searchCases,
  STAY_TYPE_LABEL,
  STAY_TYPES,
  uploadCaseFile,
  type CaseSearchResult,
  type CaseStatus,
  type CaseType,
  type CreateCaseMemberInput,
  type NeedCategory,
  type NeedUrgency,
  type StayType,
} from "../../lib/cases"

/**
 * Fase J — intake móvil de Casos. Reemplaza la planilla en papel: pensado
 * para completarse en el momento, parado en la calle, con el celular.
 * Wizard de pasos grandes (un tema por pantalla) en vez de un formulario
 * largo — más fácil de completar con una mano y sin perder el lugar.
 *
 * Fase J.1: cuando el tipo de caso es "pareja" o "grupo_familiar" se suma
 * un paso de "Integrantes" — el paso 1 sigue siendo el referente del
 * grupo, y acá se agrega el resto de las personas, cada una con sus
 * propios datos y diagnóstico (antes esto no se podía cargar).
 *
 * Fase K bloque E: se suma "buscar" como paso 0, antes que nada — un
 * buscador anti-duplicados (GET /cases/search) para que quien releva
 * chequee si la persona ya tiene un caso cargado antes de duplicarlo. Si
 * encuentra coincidencia puede saltar directo al caso existente
 * (onSelectExistingCase). También se captura acá `surveyStartedAt` (al
 * montar el componente / al reiniciar con "Cargar otro caso") para medir
 * el tiempo de carga del relevamiento como KPI (createdAt - surveyStartedAt).
 */

type NeedDraft = { category: NeedCategory; urgency: NeedUrgency; notes: string }
type SkillDraft = { skillLabel: string; level: string }
type MemberDraft = {
  fullName: string
  alias: string
  approxAge: string
  dni: string
  sex: string
  healthStatus: string
  wantsToWork: boolean | null
  workAptitude: string
  legalSituation: string
  substanceUse: string
  photoUrls: string[]
}

const EMPTY_MEMBER: MemberDraft = {
  fullName: "",
  alias: "",
  approxAge: "",
  dni: "",
  sex: "",
  healthStatus: "",
  wantsToWork: null,
  workAptitude: "",
  legalSituation: "",
  substanceUse: "",
  photoUrls: [],
}

type StepKey = "buscar" | "basicos" | "integrantes" | "ubicacion" | "diagnostico" | "necesidades" | "fotos" | "revisar"

const bigButton =
  "w-full rounded-2xl border-2 px-5 py-4 text-left text-base font-medium transition active:scale-[0.98]"
const inputCls =
  "w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-cream outline-none focus:border-yellow"
const labelCls = "mb-1.5 block text-sm text-cream/70"
const navBtnPrimary =
  "flex-1 rounded-2xl bg-yellow px-5 py-4 text-center text-base font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
const navBtnSecondary =
  "flex-1 rounded-2xl border border-white/20 px-5 py-4 text-center text-base text-cream hover:bg-white/5"

export function NuevoCaso({
  onCreated,
  onSelectExistingCase,
}: {
  onCreated: (caseNumber: string) => void
  onSelectExistingCase: (caseId: string) => void
}) {
  const [stepIndex, setStepIndex] = useState(0)

  // Paso "buscar" (bloque E — anti-duplicados)
  const [dedupQuery, setDedupQuery] = useState("")
  const [dedupResults, setDedupResults] = useState<CaseSearchResult[]>([])
  const [dedupSearching, setDedupSearching] = useState(false)

  // Bloque E — timestamp de inicio de carga, para el KPI de tiempo de
  // relevamiento. Se recaptura en resetAll() al empezar un caso nuevo.
  const [surveyStartedAt, setSurveyStartedAt] = useState(() => new Date().toISOString())

  // Paso "basicos" (referente del grupo si es pareja/grupo familiar)
  const [caseType, setCaseType] = useState<CaseType>("individual")
  const [fullName, setFullName] = useState("")
  const [alias, setAlias] = useState("")
  const [approxAge, setApproxAge] = useState("")
  const [dni, setDni] = useState("")
  const [sex, setSex] = useState("")
  const [phone, setPhone] = useState("")

  // Paso "integrantes" (solo pareja / grupo_familiar)
  const [members, setMembers] = useState<MemberDraft[]>([])

  // Paso "ubicacion"
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [locating, setLocating] = useState(false)
  const [dayZone, setDayZone] = useState("")
  const [stayType, setStayType] = useState<StayType | "">("")
  const [currentSleepSpot, setCurrentSleepSpot] = useState("")

  // Paso "diagnostico" (del referente)
  const [healthStatus, setHealthStatus] = useState("")
  const [wantsToWork, setWantsToWork] = useState<boolean | null>(null)
  const [workAptitude, setWorkAptitude] = useState("")
  const [legalSituation, setLegalSituation] = useState("")
  const [substanceUse, setSubstanceUse] = useState("")

  // Paso "necesidades" (del grupo / referente)
  const [needs, setNeeds] = useState<NeedDraft[]>([])
  const [skills, setSkills] = useState<SkillDraft[]>([])

  // Paso "fotos"
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingMemberIndex, setUploadingMemberIndex] = useState<number | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const isGroup = caseType !== "individual"
  const steps: StepKey[] = [
    "buscar",
    "basicos",
    ...(isGroup ? (["integrantes"] as const) : []),
    "ubicacion",
    "diagnostico",
    "necesidades",
    "fotos",
    "revisar",
  ]
  const currentStep = steps[stepIndex] ?? steps[0]

  // Buscador anti-duplicados: dispara la búsqueda 350ms después de que la
  // persona deja de tipear (evita pegarle al endpoint en cada tecla).
  useEffect(() => {
    const q = dedupQuery.trim()
    if (q.length < 2) {
      setDedupResults([])
      setDedupSearching(false)
      return
    }
    setDedupSearching(true)
    const handle = setTimeout(() => {
      searchCases(q)
        .then(setDedupResults)
        .catch(() => setDedupResults([]))
        .finally(() => setDedupSearching(false))
    }, 350)
    return () => clearTimeout(handle)
  }, [dedupQuery])

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador no permite obtener la ubicación")
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6))
        setLng(pos.coords.longitude.toFixed(6))
        setLocating(false)
      },
      () => {
        setError("No se pudo obtener la ubicación — probá de nuevo o ingresala a mano")
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function handlePhotoInput(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        const res = await uploadCaseFile(file)
        uploaded.push(res.fileUrl)
      }
      setPhotoUrls((prev) => [...prev, ...uploaded])
    } catch (err: any) {
      setError(err.message ?? "No se pudo subir la foto")
    } finally {
      setUploading(false)
    }
  }

  async function handleMemberPhotoInput(i: number, files: FileList | null) {
    if (!files || files.length === 0) return
    setUploadingMemberIndex(i)
    setError(null)
    try {
      const uploaded: string[] = []
      for (const file of Array.from(files)) {
        const res = await uploadCaseFile(file)
        uploaded.push(res.fileUrl)
      }
      setMembers((prev) => {
        const next = [...prev]
        next[i] = { ...next[i], photoUrls: [...next[i].photoUrls, ...uploaded] }
        return next
      })
    } catch (err: any) {
      setError(err.message ?? "No se pudo subir la foto")
    } finally {
      setUploadingMemberIndex(null)
    }
  }

  function canAdvance() {
    if (currentStep === "basicos") return fullName.trim().length >= 2
    if (currentStep === "ubicacion") return Boolean(lat && lng)
    return true
  }

  function updateMember(i: number, patch: Partial<MemberDraft>) {
    const next = [...members]
    next[i] = { ...next[i], ...patch }
    setMembers(next)
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
      const memberInputs: CreateCaseMemberInput[] = members
        .filter((m) => m.fullName.trim().length >= 2)
        .map((m) => ({
          fullName: m.fullName.trim(),
          alias: m.alias.trim() || undefined,
          approxAge: m.approxAge ? Number(m.approxAge) : undefined,
          dni: m.dni.trim() || undefined,
          sex: m.sex.trim() || undefined,
          healthStatus: m.healthStatus.trim() || undefined,
          wantsToWork: m.wantsToWork ?? undefined,
          workAptitude: m.workAptitude.trim() || undefined,
          legalSituation: m.legalSituation.trim() || undefined,
          substanceUse: m.substanceUse.trim() || undefined,
          photoUrls: m.photoUrls.length ? m.photoUrls : undefined,
        }))

      const result = await createCase({
        fullName: fullName.trim(),
        alias: alias.trim() || undefined,
        approxAge: approxAge ? Number(approxAge) : undefined,
        caseType,
        dni: dni.trim() || undefined,
        sex: sex.trim() || undefined,
        phone: phone.trim() || undefined,
        healthStatus: healthStatus.trim() || undefined,
        currentSleepSpot: currentSleepSpot.trim() || undefined,
        dayZone: dayZone.trim() || undefined,
        stayType: stayType || undefined,
        wantsToWork: wantsToWork ?? undefined,
        workAptitude: workAptitude.trim() || undefined,
        legalSituation: legalSituation.trim() || undefined,
        substanceUse: substanceUse.trim() || undefined,
        mainPhotoUrl: photoUrls[0],
        location: { lat: Number(lat), lng: Number(lng) },
        needs: needs
          .filter((n) => n.category)
          .map((n) => ({ category: n.category, urgency: n.urgency, notes: n.notes.trim() || undefined })),
        skills: skills.filter((s) => s.skillLabel.trim()).map((s) => ({ skillLabel: s.skillLabel.trim(), level: s.level.trim() || undefined })),
        photoUrls: photoUrls.length ? photoUrls : undefined,
        members: memberInputs.length ? memberInputs : undefined,
        surveyStartedAt,
      })
      setDone(result.caseNumber)
    } catch (err: any) {
      setError(err.message ?? "No se pudo guardar el caso")
    } finally {
      setSaving(false)
    }
  }

  function resetAll() {
    setStepIndex(0)
    setDedupQuery("")
    setDedupResults([])
    setSurveyStartedAt(new Date().toISOString())
    setCaseType("individual")
    setFullName("")
    setAlias("")
    setApproxAge("")
    setDni("")
    setSex("")
    setPhone("")
    setMembers([])
    setLat("")
    setLng("")
    setDayZone("")
    setStayType("")
    setCurrentSleepSpot("")
    setHealthStatus("")
    setWantsToWork(null)
    setWorkAptitude("")
    setLegalSituation("")
    setSubstanceUse("")
    setNeeds([])
    setSkills([])
    setPhotoUrls([])
    setDone(null)
    setError(null)
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-white/5 p-8 text-center">
        <p className="text-5xl">✅</p>
        <h2 className="mt-4 font-display text-xl font-bold text-yellow">¡Caso cargado!</h2>
        <p className="mt-2 text-cream/70">
          Se guardó con el número <span className="font-semibold text-cream">{done}</span>.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button onClick={resetAll} className={navBtnPrimary}>
            + Cargar otro caso
          </button>
          <button onClick={() => onCreated(done)} className={navBtnSecondary}>
            Ver en la lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-5">
        <div className="mb-1.5 flex justify-between text-xs text-cream/50">
          <span>Paso {stepIndex + 1} de {steps.length}</span>
          <span>{Math.round(((stepIndex + 1) / steps.length) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-yellow transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange">{error}</p>}

      {currentStep === "buscar" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">¿Ya existe este caso?</h2>
          <p className="mb-4 text-sm text-cream/60">
            Buscá por nombre, alias o DNI antes de cargar — así evitamos duplicar un caso que ya está en el sistema.
          </p>

          <label className="mb-3 block">
            <span className={labelCls}>Nombre, alias o DNI</span>
            <input
              value={dedupQuery}
              onChange={(e) => setDedupQuery(e.target.value)}
              className={inputCls}
              placeholder="Escribí para buscar..."
              autoFocus
            />
          </label>

          {dedupSearching && <p className="mb-3 text-xs text-cream/40">Buscando...</p>}

          {!dedupSearching && dedupQuery.trim().length >= 2 && dedupResults.length === 0 && (
            <p className="mb-3 text-xs text-cream/40">Sin coincidencias — parece un caso nuevo.</p>
          )}

          {dedupResults.length > 0 && (
            <div className="mb-2 space-y-2">
              {dedupResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectExistingCase(r.id)}
                  className="w-full rounded-xl border border-orange/40 bg-orange/10 px-4 py-3 text-left hover:border-orange"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-cream">{r.fullName}</span>
                    <span className="text-xs text-cream/40">{r.caseNumber}</span>
                  </div>
                  <div className="mt-1 text-xs text-cream/50">
                    {r.alias && <span>Alias: {r.alias} · </span>}
                    {r.dni && <span>DNI: {r.dni} · </span>}
                    {CASE_STATUS_LABEL[r.status as CaseStatus]}
                    {r.matchedMember && <span> · vía integrante: {r.matchedMember}</span>}
                  </div>
                </button>
              ))}
              <p className="text-xs text-cream/40">
                Si es esta persona, tocá su tarjeta para ir al caso existente y sumar una novedad ahí en vez de
                duplicarlo. Si no es ninguno, seguí a "Siguiente" para cargarlo como caso nuevo.
              </p>
            </div>
          )}
        </section>
      )}

      {currentStep === "basicos" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">¿A quién estás relevando?</h2>
          <p className="mb-4 text-sm text-cream/60">
            Datos básicos. Solo el nombre es obligatorio. Si es pareja o grupo, cargá acá al referente — al resto se
            lo agrega en el próximo paso.
          </p>

          <div className="mb-4 grid grid-cols-1 gap-2">
            {CASE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setCaseType(t)
                  if (t === "individual") setMembers([])
                }}
                className={`${bigButton} ${caseType === t ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 bg-white/5 text-cream"}`}
              >
                {CASE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <label className="mb-3 block">
            <span className={labelCls}>Nombre completo (o como se presente) *</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" autoFocus />
          </label>
          <label className="mb-3 block">
            <span className={labelCls}>Alias / cómo le dicen (opcional)</span>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} className={inputCls} />
          </label>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelCls}>Edad aprox.</span>
              <input
                inputMode="numeric"
                value={approxAge}
                onChange={(e) => setApproxAge(e.target.value.replace(/\D/g, ""))}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className={labelCls}>Sexo</span>
              <input value={sex} onChange={(e) => setSex(e.target.value)} className={inputCls} />
            </label>
          </div>
          <label className="mb-3 block">
            <span className={labelCls}>DNI (opcional)</span>
            <input value={dni} onChange={(e) => setDni(e.target.value)} className={inputCls} inputMode="numeric" />
          </label>
          <label className="mb-3 block">
            <span className={labelCls}>Teléfono / contacto (opcional)</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} inputMode="tel" />
          </label>
        </section>
      )}

      {currentStep === "integrantes" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Resto del grupo</h2>
          <p className="mb-4 text-sm text-cream/60">
            Cargá acá a cada integrante además de {fullName.trim() || "el referente"} — cada uno con sus propios
            datos y diagnóstico. Podés agregar cuantos necesites.
          </p>

          {members.map((m, i) => (
            <div key={i} className="mb-3 rounded-2xl border border-white/15 bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-cream">Integrante {i + 2}</span>
                <button type="button" onClick={() => setMembers(members.filter((_, idx) => idx !== i))} className="text-xs text-orange">
                  Quitar
                </button>
              </div>

              <label className="mb-2 block">
                <span className={labelCls}>Nombre completo *</span>
                <input
                  value={m.fullName}
                  onChange={(e) => updateMember(i, { fullName: e.target.value })}
                  className={inputCls}
                  placeholder="Nombre y apellido"
                />
              </label>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={labelCls}>Alias</span>
                  <input value={m.alias} onChange={(e) => updateMember(i, { alias: e.target.value })} className={inputCls} />
                </label>
                <label className="block">
                  <span className={labelCls}>Edad aprox.</span>
                  <input
                    inputMode="numeric"
                    value={m.approxAge}
                    onChange={(e) => updateMember(i, { approxAge: e.target.value.replace(/\D/g, "") })}
                    className={inputCls}
                  />
                </label>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="block">
                  <span className={labelCls}>DNI</span>
                  <input value={m.dni} onChange={(e) => updateMember(i, { dni: e.target.value })} className={inputCls} inputMode="numeric" />
                </label>
                <label className="block">
                  <span className={labelCls}>Sexo</span>
                  <input value={m.sex} onChange={(e) => updateMember(i, { sex: e.target.value })} className={inputCls} />
                </label>
              </div>
              <label className="mb-2 block">
                <span className={labelCls}>Estado de salud observado</span>
                <textarea
                  value={m.healthStatus}
                  onChange={(e) => updateMember(i, { healthStatus: e.target.value })}
                  className={inputCls}
                  rows={2}
                />
              </label>

              <span className={labelCls}>¿Quiere trabajar?</span>
              <div className="mb-2 grid grid-cols-3 gap-2">
                {[
                  { v: true, l: "Sí" },
                  { v: false, l: "No" },
                  { v: null, l: "No sabe" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => updateMember(i, { wantsToWork: opt.v })}
                    className={`rounded-xl border-2 px-2 py-2 text-xs font-medium ${
                      m.wantsToWork === opt.v ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 bg-white/5 text-cream"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>

              <label className="mb-2 block">
                <span className={labelCls}>Aptitud / oficio</span>
                <input value={m.workAptitude} onChange={(e) => updateMember(i, { workAptitude: e.target.value })} className={inputCls} />
              </label>
              <label className="mb-2 block">
                <span className={labelCls}>Situación legal</span>
                <textarea
                  value={m.legalSituation}
                  onChange={(e) => updateMember(i, { legalSituation: e.target.value })}
                  className={inputCls}
                  rows={2}
                />
              </label>
              <label className="mb-2 block">
                <span className={labelCls}>Consumo problemático (si observás)</span>
                <textarea
                  value={m.substanceUse}
                  onChange={(e) => updateMember(i, { substanceUse: e.target.value })}
                  className={inputCls}
                  rows={2}
                />
              </label>

              <span className={labelCls}>Foto del integrante (opcional)</span>
              <label className="mb-2 block cursor-pointer rounded-xl border border-white/20 bg-white/5 px-3 py-2.5 text-center text-sm text-cream">
                {uploadingMemberIndex === i ? "Subiendo..." : "📷 Sacar / elegir foto"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={(e) => handleMemberPhotoInput(i, e.target.files)}
                  disabled={uploadingMemberIndex !== null}
                  className="hidden"
                />
              </label>
              {m.photoUrls.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {m.photoUrls.map((url) => (
                    <div key={url} className="aspect-square overflow-hidden rounded-lg border border-white/15">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setMembers([...members, { ...EMPTY_MEMBER }])}
            className={`${navBtnSecondary} mt-1`}
          >
            + Agregar integrante
          </button>
          {members.length === 0 && (
            <p className="mt-2 text-xs text-cream/40">
              Sin integrantes cargados todavía. Las necesidades/habilidades de cada uno se pueden agregar acá o
              después desde el seguimiento del caso.
            </p>
          )}
        </section>
      )}

      {currentStep === "ubicacion" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">¿Dónde está ahora?</h2>
          <p className="mb-4 text-sm text-cream/60">La ubicación es obligatoria — apretá el botón parado en el lugar.</p>

          <button type="button" onClick={useMyLocation} disabled={locating} className={`${navBtnPrimary} mb-3`}>
            {locating ? "Buscando ubicación..." : lat ? "📍 Ubicación capturada — volver a tomar" : "📍 Usar mi ubicación ahora"}
          </button>
          {lat && lng && <p className="mb-4 text-center text-xs text-cream/50">Lat {lat} · Lng {lng}</p>}

          <label className="mb-3 block">
            <span className={labelCls}>Zona / esquina de referencia (de día)</span>
            <input value={dayZone} onChange={(e) => setDayZone(e.target.value)} className={inputCls} placeholder="Ej: Plaza San Martín" />
          </label>

          <span className={labelCls}>Tipo de permanencia</span>
          <div className="mb-3 grid grid-cols-1 gap-2">
            {STAY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStayType(t)}
                className={`${bigButton} ${stayType === t ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 bg-white/5 text-cream"}`}
              >
                {STAY_TYPE_LABEL[t]}
              </button>
            ))}
          </div>

          <label className="mb-3 block">
            <span className={labelCls}>Dónde duerme (opcional)</span>
            <input value={currentSleepSpot} onChange={(e) => setCurrentSleepSpot(e.target.value)} className={inputCls} />
          </label>
        </section>
      )}

      {currentStep === "diagnostico" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">
            Diagnóstico situacional{isGroup ? " (referente)" : ""}
          </h2>
          <p className="mb-4 text-sm text-cream/60">Todo opcional — completá lo que puedas ahora, el resto se agrega después.</p>

          <label className="mb-3 block">
            <span className={labelCls}>Estado de salud observado</span>
            <textarea value={healthStatus} onChange={(e) => setHealthStatus(e.target.value)} className={inputCls} rows={2} />
          </label>

          <span className={labelCls}>¿Quiere trabajar?</span>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {[
              { v: true, l: "Sí" },
              { v: false, l: "No" },
              { v: null, l: "No sabe" },
            ].map((opt) => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => setWantsToWork(opt.v)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium ${
                  wantsToWork === opt.v ? "border-yellow bg-yellow/10 text-yellow" : "border-white/15 bg-white/5 text-cream"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>

          <label className="mb-3 block">
            <span className={labelCls}>Aptitud / oficio</span>
            <input value={workAptitude} onChange={(e) => setWorkAptitude(e.target.value)} className={inputCls} placeholder="Ej: albañilería, cocina..." />
          </label>
          <label className="mb-3 block">
            <span className={labelCls}>Situación legal</span>
            <textarea value={legalSituation} onChange={(e) => setLegalSituation(e.target.value)} className={inputCls} rows={2} />
          </label>
          <label className="mb-3 block">
            <span className={labelCls}>Consumo problemático (si observás)</span>
            <textarea value={substanceUse} onChange={(e) => setSubstanceUse(e.target.value)} className={inputCls} rows={2} />
          </label>
        </section>
      )}

      {currentStep === "necesidades" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Necesidades y habilidades</h2>
          <p className="mb-4 text-sm text-cream/60">
            {isGroup
              ? "Del grupo en conjunto (compartidas). Las de cada integrante se agregan por separado desde el seguimiento del caso."
              : "Opcional — podés dejarlo para después."}
          </p>

          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-cream">Necesidades</span>
              <button
                type="button"
                onClick={() => setNeeds([...needs, { category: "salud", urgency: "normal", notes: "" }])}
                className="text-xs text-yellow hover:underline"
              >
                + Agregar necesidad
              </button>
            </div>
            {needs.map((n, i) => (
              <div key={i} className="mb-2 rounded-xl border border-white/15 bg-white/5 p-3">
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <select
                    value={n.category}
                    onChange={(e) => {
                      const next = [...needs]
                      next[i] = { ...next[i], category: e.target.value as NeedCategory }
                      setNeeds(next)
                    }}
                    className="rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-sm text-cream outline-none focus:border-yellow"
                  >
                    {NEED_CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-purple-deep">
                        {NEED_CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={n.urgency}
                    onChange={(e) => {
                      const next = [...needs]
                      next[i] = { ...next[i], urgency: e.target.value as NeedUrgency }
                      setNeeds(next)
                    }}
                    className="rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-sm text-cream outline-none focus:border-yellow"
                  >
                    {NEED_URGENCIES.map((u) => (
                      <option key={u} value={u} className="bg-purple-deep">
                        {NEED_URGENCY_LABEL[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    value={n.notes}
                    onChange={(e) => {
                      const next = [...needs]
                      next[i] = { ...next[i], notes: e.target.value }
                      setNeeds(next)
                    }}
                    placeholder="Detalle (opcional)"
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
                  />
                  <button type="button" onClick={() => setNeeds(needs.filter((_, idx) => idx !== i))} className="text-xs text-orange">
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            {needs.length === 0 && <p className="text-xs text-cream/40">Sin necesidades cargadas todavía.</p>}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-cream">Habilidades</span>
              <button
                type="button"
                onClick={() => setSkills([...skills, { skillLabel: "", level: "" }])}
                className="text-xs text-yellow hover:underline"
              >
                + Agregar habilidad
              </button>
            </div>
            {skills.map((s, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  value={s.skillLabel}
                  onChange={(e) => {
                    const next = [...skills]
                    next[i] = { ...next[i], skillLabel: e.target.value }
                    setSkills(next)
                  }}
                  placeholder="Ej: electricista"
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
                />
                <button type="button" onClick={() => setSkills(skills.filter((_, idx) => idx !== i))} className="text-xs text-orange">
                  Quitar
                </button>
              </div>
            ))}
            {skills.length === 0 && <p className="text-xs text-cream/40">Sin habilidades cargadas todavía.</p>}
          </div>
        </section>
      )}

      {currentStep === "fotos" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Fotos</h2>
          <p className="mb-4 text-sm text-cream/60">Opcional. La primera foto queda como foto principal.</p>

          <label className={`${navBtnPrimary} mb-4 block cursor-pointer text-center`}>
            {uploading ? "Subiendo..." : "📷 Sacar / elegir foto"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(e) => handlePhotoInput(e.target.files)}
              disabled={uploading}
              className="hidden"
            />
          </label>

          {photoUrls.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photoUrls.map((url, i) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-white/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-yellow px-1.5 py-0.5 text-[10px] font-semibold text-purple-deep">
                      Principal
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {currentStep === "revisar" && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Revisar y guardar</h2>
          <p className="mb-4 text-sm text-cream/60">Verificá los datos principales antes de guardar.</p>

          <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm">
            <p><span className="text-cream/50">Tipo:</span> {CASE_TYPE_LABEL[caseType]}</p>
            <p><span className="text-cream/50">Referente:</span> {fullName || "—"}</p>
            {alias && <p><span className="text-cream/50">Alias:</span> {alias}</p>}
            {isGroup && (
              <p>
                <span className="text-cream/50">Integrantes cargados:</span>{" "}
                {members.filter((m) => m.fullName.trim().length >= 2).length}
              </p>
            )}
            <p><span className="text-cream/50">Ubicación:</span> {lat && lng ? `${lat}, ${lng}` : "sin capturar"}</p>
            {dayZone && <p><span className="text-cream/50">Zona:</span> {dayZone}</p>}
            {stayType && <p><span className="text-cream/50">Permanencia:</span> {STAY_TYPE_LABEL[stayType]}</p>}
            <p><span className="text-cream/50">Necesidades del grupo:</span> {needs.length}</p>
            <p><span className="text-cream/50">Fotos:</span> {photoUrls.length}</p>
          </div>

          {isGroup && members.some((m) => m.fullName.trim().length < 2) && (
            <p className="mt-3 text-xs text-orange">
              Hay {members.filter((m) => m.fullName.trim().length < 2).length} integrante(s) sin nombre — no se van a
              guardar. Volvé al paso de Integrantes si querés completarlos.
            </p>
          )}
        </section>
      )}

      <div className="mt-6 flex gap-3">
        {stepIndex > 0 && (
          <button type="button" onClick={() => setStepIndex(stepIndex - 1)} className={navBtnSecondary}>
            Atrás
          </button>
        )}
        {stepIndex < steps.length - 1 && (
          <button
            type="button"
            onClick={() => {
              if (currentStep === "buscar" && !fullName.trim() && dedupQuery.trim()) {
                setFullName(dedupQuery.trim())
              }
              setStepIndex(stepIndex + 1)
            }}
            disabled={!canAdvance()}
            className={navBtnPrimary}
          >
            Siguiente
          </button>
        )}
        {stepIndex === steps.length - 1 && (
          <button type="button" onClick={handleSubmit} disabled={saving} className={navBtnPrimary}>
            {saving ? "Guardando..." : "Guardar caso"}
          </button>
        )}
      </div>
    </div>
  )
}
