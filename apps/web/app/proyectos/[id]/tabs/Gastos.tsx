"use client"

import { useState } from "react"
import { createProjectExpense, deleteProjectExpense, type BasicUser, type ExpenseItem } from "../../../../lib/projects"
import { formatDate, formatMoney } from "../../../../lib/format"

const CATEGORIES = ["Insumos", "Transporte", "Alimentos", "Servicios", "Honorarios", "Otro"]

/** Fase E — "Gastos": ledger de gastos del proyecto (no vincula Caso todavía — Módulo 3 sin construir). */
export function Gastos({
  projectId,
  expenses,
  users,
  canWrite,
  canDelete,
  onChanged,
}: {
  projectId: string
  expenses: ExpenseItem[]
  users: BasicUser[]
  canWrite: boolean
  canDelete: boolean
  onChanged: () => void
}) {
  const [showForm, setShowForm] = useState(false)
  const total = expenses.reduce((sum, e) => sum + Number(e.amount) + Number(e.taxAmount), 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-cream/50">Total gastado</span>{" "}
          <span className="font-display font-bold text-orange">{formatMoney(total)}</span>
        </div>
        {canWrite && (
          <button onClick={() => setShowForm(true)} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90">
            + Cargar gasto
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Título</th>
              <th className="px-4 py-3 font-medium">Cargado por</th>
              <th className="px-4 py-3 font-medium">Monto</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-white/5">
                <td className="whitespace-nowrap px-4 py-3 text-cream/70">{formatDate(e.expenseDate)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-cream/70">{e.category}</td>
                <td className="px-4 py-3 text-cream">{e.title}</td>
                <td className="whitespace-nowrap px-4 py-3 text-cream/70">{e.member.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-cream">{formatMoney(Number(e.amount) + Number(e.taxAmount))}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (!confirm(`¿Eliminar el gasto "${e.title}"?`)) return
                        deleteProjectExpense(e.id).then(onChanged)
                      }}
                      className="text-cream/30 hover:text-orange"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-cream/50">
                  Todavía no hay gastos cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NewExpenseModal
          projectId={projectId}
          users={users}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function NewExpenseModal({
  projectId,
  users,
  onClose,
  onCreated,
}: {
  projectId: string
  users: BasicUser[]
  onClose: () => void
  onCreated: () => void
}) {
  const [memberId, setMemberId] = useState(users[0]?.id ?? "")
  const [category, setCategory] = useState(CATEGORIES[0])
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [taxAmount, setTaxAmount] = useState("")
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!title.trim() || !memberId || !amount) return
          setSaving(true)
          setError(null)
          try {
            await createProjectExpense(projectId, {
              memberId,
              category,
              title: title.trim(),
              description: description || undefined,
              amount: Number(amount),
              taxAmount: taxAmount ? Number(taxAmount) : undefined,
              expenseDate: new Date(expenseDate).toISOString(),
            })
            onCreated()
          } catch (err: any) {
            setError(err.message ?? "No se pudo cargar el gasto")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Cargar gasto</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Título *</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Categoría</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-purple-deep">
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Cargado por</span>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow">
              {users.map((u) => (
                <option key={u.id} value={u.id} className="bg-purple-deep">
                  {u.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Monto *</span>
            <input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Impuestos</span>
            <input type="number" min="0" step="0.01" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-cream/70">Fecha</span>
            <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow" />
          </label>
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Descripción</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow" />
        </label>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Guardando..." : "Guardar gasto"}
          </button>
        </div>
      </form>
    </div>
  )
}
