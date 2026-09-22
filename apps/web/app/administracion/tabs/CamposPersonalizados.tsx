"use client"

import { useEffect, useState } from "react"
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  listCustomFieldDefinitions,
  updateCustomFieldDefinition,
  type CustomFieldDefinitionItem,
  type CustomFieldEntity,
  type CustomFieldType,
} from "../../../lib/projects"

const ENTITIES: { value: CustomFieldEntity; label: string }[] = [
  { value: "PROJECT", label: "Proyectos" },
  { value: "CASE", label: "Casos" },
]

const TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "TEXT", label: "Texto corto" },
  { value: "TEXTAREA", label: "Texto largo" },
  { value: "NUMBER", label: "Número" },
  { value: "DATE", label: "Fecha" },
  { value: "BOOLEAN", label: "Sí / No" },
  { value: "SELECT", label: "Lista (una opción)" },
  { value: "MULTI_SELECT", label: "Lista (varias opciones)" },
]

/**
 * Fase G — CRUD de CustomFieldDefinition. Nota: CASE (Módulo 3, Gestión de
 * Casos) todavía no tiene UI propia — el selector de entidad ya soporta
 * "Casos" desde ahora (el modelo no distingue) para no tener que volver a
 * tocar esta pantalla cuando se construya ese módulo.
 */
export function CamposPersonalizados() {
  const [entity, setEntity] = useState<CustomFieldEntity>("PROJECT")
  const [defs, setDefs] = useState<CustomFieldDefinitionItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  function refresh() {
    listCustomFieldDefinitions(entity)
      .then(setDefs)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    setDefs(null)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity])

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
          {ENTITIES.map((e) => (
            <button
              key={e.value}
              onClick={() => setEntity(e.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                entity === e.value ? "bg-yellow text-purple-deep" : "text-cream/60 hover:text-cream"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90">
          + Nuevo campo
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {!defs ? (
        <p className="text-cream/50">Cargando...</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
                <th className="px-4 py-3 font-medium">Etiqueta</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Obligatorio</th>
                <th className="px-4 py-3 font-medium">En tabla</th>
                <th className="px-4 py-3 font-medium">Filtrable</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-cream">
                    {d.label}
                    {(d.fieldType === "SELECT" || d.fieldType === "MULTI_SELECT") && d.options.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-cream/40">{d.options.join(", ")}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream/70">{TYPES.find((t) => t.value === d.fieldType)?.label}</td>
                  <td className="px-4 py-3">
                    <Toggle checked={d.required} onChange={(v) => updateCustomFieldDefinition(d.id, { required: v }).then(refresh)} />
                  </td>
                  <td className="px-4 py-3">
                    <Toggle checked={d.showInTable} onChange={(v) => updateCustomFieldDefinition(d.id, { showInTable: v }).then(refresh)} />
                  </td>
                  <td className="px-4 py-3">
                    <Toggle checked={d.filterable} onChange={(v) => updateCustomFieldDefinition(d.id, { filterable: v }).then(refresh)} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      onClick={() => {
                        if (!confirm(`¿Eliminar el campo "${d.label}"? Se pierden los valores cargados.`)) return
                        deleteCustomFieldDefinition(d.id).then(refresh).catch((e) => setError(e.message))
                      }}
                      className="text-cream/30 hover:text-orange"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
              {defs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-cream/50">
                    Todavía no hay campos personalizados para {ENTITIES.find((e) => e.value === entity)?.label.toLowerCase()}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <NewFieldModal
          entity={entity}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-yellow" : "bg-white/15"}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-purple-deep transition ${checked ? "left-4" : "left-0.5"}`} />
    </button>
  )
}

function NewFieldModal({
  entity,
  onClose,
  onCreated,
}: {
  entity: CustomFieldEntity
  onClose: () => void
  onCreated: () => void
}) {
  const [label, setLabel] = useState("")
  const [fieldType, setFieldType] = useState<CustomFieldType>("TEXT")
  const [optionsText, setOptionsText] = useState("")
  const [required, setRequired] = useState(false)
  const [showInTable, setShowInTable] = useState(false)
  const [filterable, setFilterable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsOptions = fieldType === "SELECT" || fieldType === "MULTI_SELECT"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!label.trim()) return
          setSaving(true)
          setError(null)
          try {
            await createCustomFieldDefinition({
              entity,
              label: label.trim(),
              fieldType,
              options: needsOptions
                ? optionsText.split(",").map((o) => o.trim()).filter(Boolean)
                : undefined,
              required,
              showInTable,
              filterable,
            })
            onCreated()
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear el campo")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo campo personalizado</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Etiqueta *</span>
          <input
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Tipo de dato</span>
          <select
            value={fieldType}
            onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-papel text-tinta">
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {needsOptions && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-cream/70">Opciones (separadas por coma)</span>
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Opción A, Opción B, Opción C"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
        )}

        <div className="mb-4 flex flex-wrap gap-4 text-sm text-cream/80">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Obligatorio
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={showInTable} onChange={(e) => setShowInTable(e.target.checked)} /> Mostrar en tabla
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filterable} onChange={(e) => setFilterable(e.target.checked)} /> Filtrable
          </label>
        </div>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Crear campo"}
          </button>
        </div>
      </form>
    </div>
  )
}
