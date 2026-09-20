"use client"

import { useState } from "react"
import {
  CASE_TYPE_LABEL,
  CASE_TYPES,
  createCase,
  NEED_CATEGORIES,
  NEED_CATEGORY_LABEL,
  NEED_URGENCIES,
  NEED_URGENCY_LABEL,
  STAY_TYPE_LABEL,
  STAY_TYPES,
  uploadCaseFile,
  type CaseType,
  type NeedCategory,
  type NeedUrgency,
  type StayType,
} from "../../lib/cases"

/**
 * Fase J — intake móvil de Casos. Reemplaza la planilla en papel: pensado
 * para completarse en el momento, parado en la calle, con el celular.
 * Wizard de pasos grandes (un tema por pantalla) en vez de un formulario
 * largo — más fácil de completar con una mano y sin perder el lugar.
 */

const TOTAL_STEPS = 6

type NeedDraft = { category: NeedCategory; urgency: NeedUrgency; notes: string }
type SkillDraft = { skillLabel: string; level: string }

const bigButton =
  "w-full rounded-2xl border-2 px-5 py-4 text-left text-base font-medium transition active:scale-[0.98]"
const inputCls =
  "w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-base text-cream outline-none focus:border-yellow"
const labelCls = "mb-1.5 block text-sm text-cream/70"
const navBtnPrimary =
  "flex-1 rounded-2xl bg-yellow px-5 py-4 text-center text-base font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
const navBtnSecondary =
  "flex-1 rounded-2xl border border-white/20 px-5 py-4 text-center text-base text-cream hover:bg-white/5"

export function NuevoCaso({ onCreated }: { onCreated: (caseNumber: string) => void }) {
  const [step, setStep] = useState(1)

  // Paso 1
  const [caseType, setCaseType] = useState<CaseType>("individual")
  const [fullName, setFullName] = useState("")
  const [alias, setAlias] = useState("")
  const [approxAge, setApproxAge] = useState("")
  const [dni, setDni] = useState("")
  const [sex, setSex] = useState("")
  const [phone, setPhone] = useState("")

  // Paso 2
  const [lat, setLat] = useState("")
  const [lng, setLng] = useState("")
  const [locating, setLocating] = useState(false)
  const [dayZone, setDayZone] = useState("")
  const [stayType, setStayType] = useState<StayType | "">("")
  const [currentSleepSpot, setCurrentSleepSpot] = useState("")

  // Paso 3
  const [healthStatus, setHealthStatus] = useState("")
  const [wantsToWork, setWantsToWork] = useState<boolean | null>(null)
  const [workAptitude, setWorkAptitude] = useState("")
  const [legalSituation, setLegalSituation] = useState("")
  const [substanceUse, setSubstanceUse] = useState("")

  // Paso 4
  const [needs, setNeeds] = useState<NeedDraft[]>([])
  const [skills, setSkills] = useState<SkillDraft[]>([])

  // Paso 5
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

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

  function canAdvance() {
    if (step === 1) return fullName.trim().length >= 2
    if (step === 2) return Boolean(lat && lng)
    return true
  }

  async function handleSubmit() {
    setSaving(true)
    setError(null)
    try {
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
      })
      setDone(result.caseNumber)
    } catch (err: any) {
      setError(err.message ?? "No se pudo guardar el caso")
    } finally {
      setSaving(false)
    }
  }

  function resetAll() {
    setStep(1)
    setCaseType("individual")
    setFullName("")
    setAlias("")
    setApproxAge("")
    setDni("")
    setSex("")
    setPhone("")
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
          <span>Paso {step} de {TOTAL_STEPS}</span>
          <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-yellow transition-all" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl bg-orange/10 px-4 py-2 text-sm text-orange">{error}</p>}

      {step === 1 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">¿A quién estás relevando?</h2>
          <p className="mb-4 text-sm text-cream/60">Datos básicos. Solo el nombre es obligatorio.</p>

          <div className="mb-4 grid grid-cols-1 gap-2">
            {CASE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setCaseType(t)}
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

      {step === 2 && (
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

      {step === 3 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Diagnóstico situacional</h2>
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

      {step === 4 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Necesidades y habilidades</h2>
          <p className="mb-4 text-sm text-cream/60">Opcional — podés dejarlo para después.</p>

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

      {step === 5 && (
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

      {step === 6 && (
        <section>
          <h2 className="mb-1 font-display text-lg font-bold text-yellow">Revisar y guardar</h2>
          <p className="mb-4 text-sm text-cream/60">Verificá los datos principales antes de guardar.</p>

          <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-4 text-sm">
            <p><span className="text-cream/50">Tipo:</span> {CASE_TYPE_LABEL[caseType]}</p>
            <p><span className="text-cream/50">Nombre:</span> {fullName || "—"}</p>
            {alias && <p><span className="text-cream/50">Alias:</span> {alias}</p>}
            <p><span className="text-cream/50">Ubicación:</span> {lat && lng ? `${lat}, ${lng}` : "sin capturar"}</p>
            {dayZone && <p><span className="text-cream/50">Zona:</span> {dayZone}</p>}
            {stayType && <p><span className="text-cream/50">Permanencia:</span> {STAY_TYPE_LABEL[stayType]}</p>}
            <p><span className="text-cream/50">Necesidades:</span> {needs.length}</p>
            <p><span className="text-cream/50">Fotos:</span> {photoUrls.length}</p>
          </div>
        </section>
      )}

      <div className="mt-6 flex gap-3">
        {step > 1 && (
          <button type="button" onClick={() => setStep(step - 1)} className={navBtnSecondary}>
            Atrás
          </button>
        )}
        {step < TOTAL_STEPS && (
          <button type="button" onClick={() => setStep(step + 1)} disabled={!canAdvance()} className={navBtnPrimary}>
            Siguiente
          </button>
        )}
        {step === TOTAL_STEPS && (
          <button type="button" onClick={handleSubmit} disabled={saving} className={navBtnPrimary}>
            {saving ? "Guardando..." : "Guardar caso"}
          </button>
        )}
      </div>
    </div>
  )
}
