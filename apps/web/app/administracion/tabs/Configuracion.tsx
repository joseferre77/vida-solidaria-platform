"use client"

import { useEffect, useState } from "react"
import { getSettings, updateWeeklyReminderDay } from "../../../lib/settings"

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
]

/**
 * Fase P — pestaña de Configuración. Por ahora un solo ajuste: qué día de
 * la semana sale el aviso "¿venís este domingo?" (push + email, con botón
 * de confirmar) a todos los usuarios activos. Viernes es el valor por
 * defecto histórico si nunca se tocó — ver apps/api/src/lib/settings.ts.
 */
export function Configuracion() {
  const [day, setDay] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    getSettings()
      .then((s) => setDay(s.weeklyReminderDay))
      .catch((e) => setError(e.message))
  }, [])

  async function onSave(value: number) {
    setSaving(true)
    setError(null)
    setSavedMsg(false)
    try {
      const updated = await updateWeeklyReminderDay(value)
      setDay(updated.weeklyReminderDay)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 2500)
    } catch (e: any) {
      setError(e.message ?? "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  if (day === null && !error) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-xl">
      <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
        <h2 className="mb-1 font-display text-lg font-semibold text-cream">Aviso de confirmación de asistencia</h2>
        <p className="mb-4 text-sm text-cream/60">
          Cada semana, este día se les manda a todos los usuarios activos un push y un email preguntando si van a
          venir al encuentro del domingo. El domingo a las 14hs se manda además un resumen automático con quiénes
          confirmaron.
        </p>

        <label className="mb-1 block text-sm text-cream/70">Día del aviso</label>
        <select
          value={day ?? 5}
          disabled={saving}
          onChange={(e) => onSave(Number(e.target.value))}
          className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow disabled:opacity-50"
        >
          {DAYS.map((d) => (
            <option key={d.value} value={d.value} className="bg-purpleDeep">
              {d.label}
            </option>
          ))}
        </select>

        {savedMsg && <p className="mt-3 text-sm text-green-400">Guardado ✓</p>}
        {error && <p className="mt-3 text-sm text-orange">{error}</p>}
      </div>
    </div>
  )
}
