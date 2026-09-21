"use client"

import { useEffect, useState } from "react"
import { listBasicUsers, type BasicUser } from "../../../lib/projects"
import {
  KITCHEN_STATUS_LABEL,
  KITCHEN_STATUS_ORDER,
  STOCK_UNIT_LABEL,
  STOCK_UNITS,
  addKitchenBatchAssignee,
  addKitchenBatchIngredient,
  createKitchenBatch,
  createStockItem,
  getKitchenBatch,
  listKitchenBatches,
  listStockItems,
  removeKitchenBatchAssignee,
  removeKitchenBatchIngredient,
  setKitchenBatchResponsible,
  updateKitchenBatchStatus,
  type KitchenBatchItem,
  type KitchenBatchStatus,
  type StockItemItem,
  type StockUnit,
} from "../../../lib/logistics"

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

const STATUS_BADGE: Record<KitchenBatchStatus, string> = {
  preparacion: "bg-white/10 text-cream/80",
  coccion: "bg-orange/20 text-orange",
  cocina_terminada: "bg-orange/30 text-orange",
  listo_transporte: "bg-yellow/20 text-yellow",
  camino_punto_encuentro: "bg-yellow/30 text-yellow",
  entregado: "bg-green-500/20 text-green-300",
}

/** Fase I — lotes de cocina (KitchenBatch) con insumos, asignados y estado. */
export function Cocina() {
  const [batches, setBatches] = useState<KitchenBatchItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [openBatchId, setOpenBatchId] = useState<string | null>(null)

  function refresh() {
    listKitchenBatches()
      .then(setBatches)
      .catch((e) => setError(e.message))
  }

  useEffect(refresh, [])

  if (!batches) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-cream/50">
          {batches.length} {batches.length === 1 ? "lote" : "lotes"}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
        >
          + Nuevo lote
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {batches.map((b) => (
          <button
            key={b.id}
            onClick={() => setOpenBatchId(b.id)}
            className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left hover:border-yellow/40"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-cream">{b.name}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[b.status]}`}>
                {KITCHEN_STATUS_LABEL[b.status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-cream/50">{b.targetServings} porciones objetivo</p>
            <p className="mt-2 text-xs text-cream/40">
              {b.assignees.length} {b.assignees.length === 1 ? "persona asignada" : "personas asignadas"} ·{" "}
              {b.ingredients.length} {b.ingredients.length === 1 ? "insumo" : "insumos"}
            </p>
          </button>
        ))}
        {batches.length === 0 && <p className="text-sm text-cream/50 sm:col-span-2">Todavía no hay lotes de cocina.</p>}
      </div>

      {showForm && (
        <NewBatchModal
          onClose={() => setShowForm(false)}
          onCreated={(b) => {
            setShowForm(false)
            refresh()
            setOpenBatchId(b.id)
          }}
        />
      )}

      {openBatchId && (
        <BatchDetailModal batchId={openBatchId} onClose={() => setOpenBatchId(null)} onChanged={refresh} />
      )}
    </div>
  )
}

function NewBatchModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (b: KitchenBatchItem) => void
}) {
  const [name, setName] = useState("")
  const [targetServings, setTargetServings] = useState("")
  const [responsibleUserId, setResponsibleUserId] = useState("")
  const [users, setUsers] = useState<BasicUser[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listBasicUsers().then(setUsers).catch(() => setUsers([]))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !targetServings) return
          setSaving(true)
          setError(null)
          try {
            const batch = await createKitchenBatch({
              name: name.trim(),
              targetServings: Number(targetServings),
              responsibleUserId: responsibleUserId || undefined,
            })
            onCreated(batch)
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear el lote")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo lote de cocina</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Guiso de lentejas — martes"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Porciones objetivo *</span>
          <input
            required
            type="number"
            min="1"
            value={targetServings}
            onChange={(e) => setTargetServings(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">Responsable de esta cocina</span>
          <select
            value={responsibleUserId}
            onChange={(e) => setResponsibleUserId(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-purple-deep">
              Sin asignar todavía
            </option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id} className="bg-purple-deep">
                {u.name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50">
            {saving ? "Creando..." : "Crear lote"}
          </button>
        </div>
      </form>
    </div>
  )
}

function BatchDetailModal({
  batchId,
  onClose,
  onChanged,
}: {
  batchId: string
  onClose: () => void
  onChanged: () => void
}) {
  const [batch, setBatch] = useState<KitchenBatchItem | null>(null)
  const [stockItems, setStockItems] = useState<StockItemItem[] | null>(null)
  const [users, setUsers] = useState<BasicUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickStockId, setPickStockId] = useState("")
  const [qty, setQty] = useState("")
  const [pickUserId, setPickUserId] = useState("")
  const [taskLabel, setTaskLabel] = useState("")
  const [showNewStock, setShowNewStock] = useState(false)

  function refresh() {
    getKitchenBatch(batchId)
      .then(setBatch)
      .catch((e) => setError(e.message))
    onChanged()
  }

  useEffect(() => {
    getKitchenBatch(batchId)
      .then(setBatch)
      .catch((e) => setError(e.message))
    listStockItems()
      .then(setStockItems)
      .catch((e) => setError(e.message))
    listBasicUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

  if (!batch || !stockItems || !users) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="rounded-2xl border border-white/15 bg-purple-deep p-6 text-cream/60">Cargando...</div>
      </div>
    )
  }

  const availableStock = stockItems.filter((s) => !batch.ingredients.some((i) => i.stockItemId === s.id))
  const availableUsers = users.filter((u) => !batch.assignees.some((a) => a.id === u.id))
  const currentIdx = KITCHEN_STATUS_ORDER.indexOf(batch.status)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6">
        <div className="mb-1 flex items-start justify-between">
          <h2 className="font-display text-lg font-bold text-yellow">{batch.name}</h2>
          <button onClick={onClose} className="text-cream/40 hover:text-cream">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-cream/50">
          {batch.targetServings} porciones · creado por {batch.createdBy?.name ?? "—"} el{" "}
          {formatDateTime(batch.createdAt)}
        </p>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        {/* Responsable */}
        <div className="mb-5">
          <p className="mb-1.5 text-sm text-cream/70">Responsable de esta cocina</p>
          <select
            value={batch.responsible?.id ?? ""}
            onChange={(e) =>
              setKitchenBatchResponsible(batch.id, e.target.value || null)
                .then(refresh)
                .catch((err) => setError(err.message))
            }
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-purple-deep">
              Sin asignar
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-purple-deep">
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Estado */}
        <div className="mb-5">
          <p className="mb-1.5 text-sm text-cream/70">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {KITCHEN_STATUS_ORDER.map((s, i) => (
              <button
                key={s}
                onClick={() => updateKitchenBatchStatus(batch.id, s).then(refresh).catch((e) => setError(e.message))}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  i === currentIdx
                    ? "bg-yellow text-purple-deep"
                    : i < currentIdx
                      ? "bg-white/15 text-cream/60"
                      : "bg-white/5 text-cream/40 hover:bg-white/10"
                }`}
              >
                {KITCHEN_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Insumos */}
        <div className="mb-5">
          <p className="mb-1.5 text-sm text-cream/70">Insumos</p>
          <div className="mb-2 space-y-1">
            {batch.ingredients.map((i) => (
              <div key={i.stockItemId} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm text-cream">
                <span>
                  {i.quantityAssigned} {i.unit} — {i.stockItemName}
                </span>
                <button
                  onClick={() =>
                    removeKitchenBatchIngredient(batch.id, i.stockItemId).then(refresh).catch((e) => setError(e.message))
                  }
                  className="text-cream/30 hover:text-orange"
                >
                  ✕
                </button>
              </div>
            ))}
            {batch.ingredients.length === 0 && <p className="text-xs text-cream/40">Sin insumos cargados</p>}
          </div>
          {!showNewStock ? (
            <div className="flex gap-2">
              <select
                value={pickStockId}
                onChange={(e) => setPickStockId(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
              >
                <option value="" className="bg-purple-deep">
                  Elegir insumo...
                </option>
                {availableStock.map((s) => (
                  <option key={s.id} value={s.id} className="bg-purple-deep">
                    {s.name} ({s.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="Cant."
                className="w-20 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
              />
              <button
                disabled={!pickStockId || !qty}
                onClick={() => {
                  addKitchenBatchIngredient(batch.id, { stockItemId: pickStockId, quantityAssigned: Number(qty) })
                    .then(() => {
                      setPickStockId("")
                      setQty("")
                      refresh()
                    })
                    .catch((e) => setError(e.message))
                }}
                className="rounded-lg bg-yellow px-3 py-1.5 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                +
              </button>
            </div>
          ) : (
            <NewStockItemInline
              onCancel={() => setShowNewStock(false)}
              onCreated={(item) => {
                setStockItems([...(stockItems ?? []), item])
                setShowNewStock(false)
              }}
              onError={setError}
            />
          )}
          {!showNewStock && (
            <button onClick={() => setShowNewStock(true)} className="mt-1.5 text-xs text-yellow hover:underline">
              + Insumo nuevo (no está en la lista)
            </button>
          )}
        </div>

        {/* Asignados */}
        <div className="mb-2">
          <p className="mb-1.5 text-sm text-cream/70">Personas asignadas</p>
          <div className="mb-2 space-y-1">
            {batch.assignees.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-sm text-cream">
                <span>
                  {a.name}
                  {a.taskLabel && <span className="text-cream/50"> — {a.taskLabel}</span>}
                </span>
                <button
                  onClick={() => removeKitchenBatchAssignee(batch.id, a.id).then(refresh).catch((e) => setError(e.message))}
                  className="text-cream/30 hover:text-orange"
                >
                  ✕
                </button>
              </div>
            ))}
            {batch.assignees.length === 0 && <p className="text-xs text-cream/40">Sin personas asignadas</p>}
          </div>
          <div className="flex gap-2">
            <select
              value={pickUserId}
              onChange={(e) => setPickUserId(e.target.value)}
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
            >
              <option value="" className="bg-purple-deep">
                Elegir persona...
              </option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id} className="bg-purple-deep">
                  {u.name}
                </option>
              ))}
            </select>
            <input
              value={taskLabel}
              onChange={(e) => setTaskLabel(e.target.value)}
              placeholder="Tarea (opcional)"
              className="w-28 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
            />
            <button
              disabled={!pickUserId}
              onClick={() => {
                addKitchenBatchAssignee(batch.id, { userId: pickUserId, taskLabel: taskLabel.trim() || undefined })
                  .then(() => {
                    setPickUserId("")
                    setTaskLabel("")
                    refresh()
                  })
                  .catch((e) => setError(e.message))
              }}
              className="rounded-lg bg-yellow px-3 py-1.5 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function NewStockItemInline({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void
  onCreated: (item: StockItemItem) => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState("")
  const [unit, setUnit] = useState<StockUnit>("kg")
  const [isReusable, setIsReusable] = useState(false)
  const [saving, setSaving] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del insumo"
          className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value as StockUnit)}
          className="w-28 rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        >
          {STOCK_UNITS.map((u) => (
            <option key={u} value={u} className="bg-purple-deep">
              {STOCK_UNIT_LABEL[u]}
            </option>
          ))}
        </select>
        <button
          disabled={!name.trim() || saving}
          onClick={async () => {
            setSaving(true)
            try {
              const item = await createStockItem({ name: name.trim(), unit, isReusable })
              onCreated(item)
            } catch (err: any) {
              onError(err.message ?? "No se pudo crear el insumo")
            } finally {
              setSaving(false)
            }
          }}
          className="rounded-lg bg-yellow px-3 py-1.5 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
        >
          Crear
        </button>
        <button onClick={onCancel} className="text-cream/40 hover:text-cream">
          ✕
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-cream/60">
        <input type="checkbox" checked={isReusable} onChange={(e) => setIsReusable(e.target.checked)} />
        Es equipamiento reusable (conservadora, termo, olla...) — se presta y vuelve, no se consume
      </label>
    </div>
  )
}
