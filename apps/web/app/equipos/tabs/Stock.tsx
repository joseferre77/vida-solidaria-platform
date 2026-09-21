"use client"

import { useEffect, useState } from "react"
import { listBasicUsers, type BasicUser } from "../../../lib/projects"
import {
  STOCK_UNIT_LABEL,
  STOCK_UNITS,
  checkOutStockItem,
  createStockItem,
  createStockMovement,
  deleteStockItem,
  getStockSummary,
  listStockItems,
  listStockMovements,
  returnStockCustody,
  updateStockItem,
  type StockItemItem,
  type StockMovementItem,
  type StockSummary,
  type StockUnit,
} from "../../../lib/logistics"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

// Catálogo inicial sugerido (Fase K) — un punto de partida para no tener que
// tipear insumo por insumo; costo/punto de pedido se completan después
// editando cada insumo, porque esos valores solo los sabe Josecito.
const STARTER_CATALOG: { name: string; unit: StockUnit; category: string; isReusable?: boolean }[] = [
  { name: "Pollo", unit: "kg", category: "Materia prima" },
  { name: "Papa", unit: "kg", category: "Materia prima" },
  { name: "Zanahoria", unit: "kg", category: "Materia prima" },
  { name: "Cebolla", unit: "kg", category: "Materia prima" },
  { name: "Zapallo", unit: "kg", category: "Materia prima" },
  { name: "Arroz", unit: "kg", category: "Materia prima" },
  { name: "Fideos", unit: "kg", category: "Materia prima" },
  { name: "Lentejas", unit: "kg", category: "Materia prima" },
  { name: "Aceite", unit: "litros", category: "Materia prima" },
  { name: "Condimentos surtidos", unit: "kg", category: "Materia prima" },
  { name: "Té", unit: "cajas", category: "Materia prima" },
  { name: "Café", unit: "kg", category: "Materia prima" },
  { name: "Mate cocido", unit: "cajas", category: "Materia prima" },
  { name: "Bandejas plásticas", unit: "unidades", category: "Descartables" },
  { name: "Guantes", unit: "cajas", category: "Descartables" },
  { name: "Cofias", unit: "unidades", category: "Descartables" },
  { name: "Conservadora", unit: "unidades", category: "Equipamiento", isReusable: true },
  { name: "Termo", unit: "unidades", category: "Equipamiento", isReusable: true },
  { name: "Olla grande", unit: "unidades", category: "Equipamiento", isReusable: true },
  { name: "Cucharón", unit: "unidades", category: "Equipamiento", isReusable: true },
]

/** Fase K — catálogo de stock: materia prima, descartables y equipamiento
 * reusable, con código automático, valuación, punto de pedido/reposición,
 * ledger de movimientos (el descuento al cocinar sale solo desde Cocina) y
 * custodia de equipamiento (quién tiene cada conservadora/termo/olla). */
export function Stock() {
  const [items, setItems] = useState<StockItemItem[] | null>(null)
  const [summary, setSummary] = useState<StockSummary | null>(null)
  const [users, setUsers] = useState<BasicUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<StockItemItem | null>(null)
  const [seeding, setSeeding] = useState(false)

  function refresh() {
    listStockItems().then(setItems).catch((e) => setError(e.message))
    getStockSummary().then(setSummary).catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    listBasicUsers().then(setUsers).catch((e) => setError(e.message))
  }, [])

  if (!items || !users) return <p className="text-cream/50">Cargando...</p>

  const groups = new Map<string, StockItemItem[]>()
  for (const item of items) {
    const key = item.category || "Sin categoría"
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  async function seedStarterCatalog() {
    setSeeding(true)
    setError(null)
    try {
      const existingNames = new Set((items ?? []).map((i) => i.name.toLowerCase()))
      const toCreate = STARTER_CATALOG.filter((s) => !existingNames.has(s.name.toLowerCase()))
      for (const s of toCreate) {
        await createStockItem(s)
      }
      refresh()
    } catch (e: any) {
      setError(e.message ?? "No se pudo cargar el catálogo inicial")
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="max-w-4xl">
      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Insumos cargados</p>
            <p className="text-lg font-semibold text-cream">{summary.totalItems}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Valuación total</p>
            <p className="text-lg font-semibold text-cream">{formatMoney(summary.totalValuation)}</p>
          </div>
          <div className={`rounded-xl border p-3 ${summary.belowReorderPoint > 0 ? "border-orange/40 bg-orange/10" : "border-white/15 bg-white/5"}`}>
            <p className="text-[11px] text-cream/50">Bajo punto de pedido</p>
            <p className={`text-lg font-semibold ${summary.belowReorderPoint > 0 ? "text-orange" : "text-cream"}`}>
              {summary.belowReorderPoint}
            </p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Equipamiento prestado</p>
            <p className="text-lg font-semibold text-cream">{summary.reusableOnLoan}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-cream/50">
          {items.length} {items.length === 1 ? "insumo cargado" : "insumos cargados"}
        </p>
        <div className="flex gap-2">
          {items.length === 0 && (
            <button
              onClick={seedStarterCatalog}
              disabled={seeding}
              className="rounded-xl border border-yellow/40 px-4 py-2 text-sm font-medium text-yellow hover:bg-yellow/10 disabled:opacity-50"
            >
              {seeding ? "Cargando..." : "Cargar catálogo inicial"}
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
          >
            + Nuevo insumo
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {items.length === 0 && (
        <p className="text-sm text-cream/50">
          Todavía no hay insumos cargados. Usá "Cargar catálogo inicial" para arrancar con materia prima,
          descartables y equipamiento típico, o cargalos uno por uno con "+ Nuevo insumo".
        </p>
      )}

      <div className="space-y-6">
        {Array.from(groups.entries()).map(([category, catItems]) => (
          <div key={category}>
            <h3 className="mb-2 text-sm font-semibold text-cream/70">{category}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {catItems.map((item) => (
                <StockItemCard
                  key={item.id}
                  item={item}
                  users={users}
                  onChanged={refresh}
                  onError={setError}
                  onEdit={() => setEditItem(item)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <StockItemFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            refresh()
          }}
        />
      )}

      {editItem && (
        <StockItemFormModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSaved={() => {
            setEditItem(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function StockItemCard({
  item,
  users,
  onChanged,
  onError,
  onEdit,
}: {
  item: StockItemItem
  users: BasicUser[]
  onChanged: () => void
  onError: (e: string) => void
  onEdit: () => void
}) {
  const [pickUserId, setPickUserId] = useState("")
  const [busy, setBusy] = useState(false)
  const [showMovement, setShowMovement] = useState(false)
  const [movementType, setMovementType] = useState<"ingreso" | "egreso">("ingreso")
  const [movementQty, setMovementQty] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<StockMovementItem[] | null>(null)

  return (
    <div className={`rounded-2xl border p-4 ${item.belowReorderPoint ? "border-orange/50 bg-orange/5" : "border-white/15 bg-white/5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] text-cream/40">{item.code}</p>
          <p className="font-semibold text-cream">{item.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {item.isReusable && (
            <span className="shrink-0 rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-300">
              Reusable
            </span>
          )}
          {item.belowReorderPoint && (
            <span className="shrink-0 rounded-full bg-orange/20 px-2 py-0.5 text-[11px] font-medium text-orange">
              Stock bajo
            </span>
          )}
          <button onClick={onEdit} className="text-cream/30 hover:text-yellow" title="Editar">
            ✎
          </button>
          <button
            onClick={() => deleteStockItem(item.id).then(onChanged).catch((e) => onError(e.message))}
            className="text-cream/30 hover:text-orange"
            title="Eliminar insumo"
          >
            ✕
          </button>
        </div>
      </div>

      {!item.isReusable && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-xs text-cream/60">
          <span>
            Cantidad: <span className="font-semibold text-cream">{item.currentQuantity}</span> {STOCK_UNIT_LABEL[item.unit]}
          </span>
          {item.unitCost !== null && <span>Costo: {formatMoney(item.unitCost)}/{item.unit}</span>}
          {item.totalValue !== null && <span>Valor total: {formatMoney(item.totalValue)}</span>}
        </div>
      )}
      {(item.reorderPoint !== null || item.restockTarget !== null) && (
        <p className="mt-0.5 text-[11px] text-cream/40">
          {item.reorderPoint !== null && <>Punto de pedido: {item.reorderPoint} {item.unit} </>}
          {item.restockTarget !== null && <>· Reponer hasta: {item.restockTarget} {item.unit}</>}
        </p>
      )}

      {item.isReusable ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          {item.activeCustody ? (
            <div>
              <p className="text-xs text-cream/70">
                En manos de <span className="font-medium text-cream">{item.activeCustody.holder?.name ?? "—"}</span>{" "}
                desde {formatDate(item.activeCustody.checkedOutAt)}
              </p>
              {item.activeCustody.notes && <p className="text-xs text-cream/40">{item.activeCustody.notes}</p>}
              <button
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  returnStockCustody(item.activeCustody!.id)
                    .then(onChanged)
                    .catch((e) => onError(e.message))
                    .finally(() => setBusy(false))
                }}
                className="mt-1.5 rounded-lg bg-yellow/90 px-3 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                Marcar devuelto (a lo de Lourdes)
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={pickUserId}
                onChange={(e) => setPickUserId(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
              >
                <option value="" className="bg-purple-deep">
                  Prestar a...
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-purple-deep">
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!pickUserId || busy}
                onClick={() => {
                  setBusy(true)
                  checkOutStockItem(item.id, { holderUserId: pickUserId })
                    .then(() => {
                      setPickUserId("")
                      onChanged()
                    })
                    .catch((e) => onError(e.message))
                    .finally(() => setBusy(false))
                }}
                className="rounded-lg bg-yellow px-3 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                Prestar
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2 border-t border-white/10 pt-2">
          {!showMovement ? (
            <div className="flex gap-3">
              <button onClick={() => setShowMovement(true)} className="text-xs text-yellow hover:underline">
                + Movimiento
              </button>
              <button
                onClick={() => {
                  setShowHistory(!showHistory)
                  if (!history) listStockMovements(item.id).then(setHistory).catch((e) => onError(e.message))
                }}
                className="text-xs text-cream/50 hover:underline"
              >
                {showHistory ? "Ocultar historial" : "Ver historial"}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as "ingreso" | "egreso")}
                className="rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
              >
                <option value="ingreso" className="bg-purple-deep">
                  Ingreso
                </option>
                <option value="egreso" className="bg-purple-deep">
                  Egreso
                </option>
              </select>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={movementQty}
                onChange={(e) => setMovementQty(e.target.value)}
                placeholder="Cant."
                className="w-16 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
              />
              <input
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder="Motivo (opcional)"
                className="min-w-[7rem] flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
              />
              <button
                disabled={!movementQty || busy}
                onClick={() => {
                  setBusy(true)
                  createStockMovement(item.id, {
                    type: movementType,
                    quantity: Number(movementQty),
                    reason: movementReason.trim() || undefined,
                  })
                    .then(() => {
                      setMovementQty("")
                      setMovementReason("")
                      setShowMovement(false)
                      setHistory(null)
                      onChanged()
                    })
                    .catch((e) => onError(e.message))
                    .finally(() => setBusy(false))
                }}
                className="rounded-lg bg-yellow px-3 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                Guardar
              </button>
              <button onClick={() => setShowMovement(false)} className="text-cream/40 hover:text-cream">
                ✕
              </button>
            </div>
          )}
          {showHistory && (
            <div className="mt-2 space-y-1">
              {history === null && <p className="text-xs text-cream/40">Cargando...</p>}
              {history?.length === 0 && <p className="text-xs text-cream/40">Sin movimientos todavía</p>}
              {history?.map((m) => (
                <div key={m.id} className="flex justify-between text-[11px] text-cream/60">
                  <span>
                    {m.type === "ingreso" ? "+" : "-"}
                    {m.quantity} {item.unit} {m.reason ? `— ${m.reason}` : ""}
                  </span>
                  <span className="text-cream/30">{formatDate(m.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StockItemFormModal({
  item,
  onClose,
  onSaved,
}: {
  item?: StockItemItem
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(item?.name ?? "")
  const [unit, setUnit] = useState<StockUnit>(item?.unit ?? "kg")
  const [category, setCategory] = useState(item?.category ?? "")
  const [isReusable, setIsReusable] = useState(item?.isReusable ?? false)
  const [unitCost, setUnitCost] = useState(item?.unitCost?.toString() ?? "")
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint?.toString() ?? "")
  const [restockTarget, setRestockTarget] = useState(item?.restockTarget?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setSaving(true)
          setError(null)
          const data = {
            name: name.trim(),
            unit,
            category: category.trim() || undefined,
            isReusable,
            unitCost: unitCost ? Number(unitCost) : undefined,
            reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
            restockTarget: restockTarget ? Number(restockTarget) : undefined,
          }
          try {
            if (item) await updateStockItem(item.id, data)
            else await createStockItem(data)
            onSaved()
          } catch (err: any) {
            setError(err.message ?? "No se pudo guardar el insumo")
          } finally {
            setSaving(false)
          }
        }}
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-1 font-display text-lg font-bold text-yellow">{item ? "Editar insumo" : "Nuevo insumo"}</h2>
        {item && <p className="mb-3 font-mono text-xs text-cream/40">{item.code}</p>}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="p. ej. Papa"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <div className="mb-3 flex gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-cream/70">Unidad *</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as StockUnit)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            >
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u} className="bg-purple-deep">
                  {STOCK_UNIT_LABEL[u]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-cream/70">Categoría</span>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Materia prima..."
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
        </div>

        <label className="mb-3 flex items-center gap-1.5 text-xs text-cream/60">
          <input type="checkbox" checked={isReusable} onChange={(e) => setIsReusable(e.target.checked)} />
          Es equipamiento reusable (conservadora, termo, olla...) — se presta y vuelve, no se consume
        </label>

        {!isReusable && (
          <div className="mb-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <label className="block text-sm">
              <span className="mb-1 block text-cream/70">Costo por unidad ($)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
              />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-cream/70">Punto de pedido</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={reorderPoint}
                  onChange={(e) => setReorderPoint(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
                />
              </label>
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-cream/70">Punto de reposición</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={restockTarget}
                  onChange={(e) => setRestockTarget(e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
                />
              </label>
            </div>
            <p className="text-[11px] text-cream/40">
              Al llegar al punto de pedido, se avisa por email/en el sistema a quienes manejan logística.
            </p>
          </div>
        )}

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : item ? "Guardar cambios" : "Crear insumo"}
          </button>
        </div>
      </form>
    </div>
  )
}
