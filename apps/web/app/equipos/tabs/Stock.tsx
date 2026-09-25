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
  getStockAlerts,
  getStockSummary,
  listAllStockMovements,
  listStockItems,
  listStockMovements,
  returnStockCustody,
  transferStockCustody,
  updateStockItem,
  type StockAlerts,
  type StockItemItem,
  type StockMovementItem,
  type StockMovementsReport,
  type StockSummary,
  type StockUnit,
} from "../../../lib/logistics"

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatMoney(n: number) {
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Ícono por defecto cuando el insumo no tiene uno propio cargado — pura
// cosmética para que la grilla rápida no se vea toda con la misma caja.
function defaultIcon(item: { category: string | null; isReusable: boolean }) {
  if (item.isReusable) return "🍲"
  const cat = (item.category ?? "").toLowerCase()
  if (cat.includes("descart")) return "🧤"
  if (cat.includes("materia")) return "🥔"
  if (cat.includes("bebida") || cat.includes("infusi")) return "🧉"
  return "📦"
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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

type SubView = "catalogo" | "grilla" | "reporte" | "movimientos" | "alertas"

const SUBVIEW_LABEL: Record<SubView, string> = {
  catalogo: "Catálogo",
  grilla: "Grilla rápida",
  reporte: "Reporte",
  movimientos: "Movimientos",
  alertas: "Alertas",
}

/** Fase K/L — catálogo de stock: materia prima, descartables y equipamiento
 * reusable, con código automático, valuación, punto de pedido/reposición,
 * ledger de movimientos (el descuento al cocinar sale solo desde Cocina),
 * custodia de equipamiento, reporte de inventario, historial unificado de
 * movimientos, alertas dedicadas y una grilla rápida tipo TPV para registrar
 * movimientos tocando la tarjeta del insumo en vez de tipear en un formulario. */
export function Stock() {
  const [items, setItems] = useState<StockItemItem[] | null>(null)
  const [summary, setSummary] = useState<StockSummary | null>(null)
  const [users, setUsers] = useState<BasicUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<StockItemItem | null>(null)
  const [seeding, setSeeding] = useState(false)
  const [subView, setSubView] = useState<SubView>("catalogo")

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
    <div className="max-w-6xl">
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
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
          {(Object.keys(SUBVIEW_LABEL) as SubView[]).map((v) => (
            <button
              key={v}
              onClick={() => setSubView(v)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subView === v ? "bg-yellow text-purple-deep" : "text-cream/60 hover:bg-white/10 hover:text-cream"
              }`}
            >
              {SUBVIEW_LABEL[v]}
            </button>
          ))}
        </nav>
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

      {subView === "catalogo" && (
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
      )}

      {subView === "grilla" && items.length > 0 && (
        <GrillaRapidaView items={items} users={users} onChanged={refresh} onError={setError} />
      )}

      {subView === "reporte" && <ReporteInventarioView items={items} />}

      {subView === "movimientos" && <HistorialMovimientosView users={users} />}

      {subView === "alertas" && <AlertasStockView onChanged={refresh} onError={setError} />}

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
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferTo, setTransferTo] = useState("")
  const [showMovement, setShowMovement] = useState(false)
  const [movementType, setMovementType] = useState<"ingreso" | "egreso">("ingreso")
  const [movementQty, setMovementQty] = useState("")
  const [movementReason, setMovementReason] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<StockMovementItem[] | null>(null)

  return (
    <div className={`rounded-2xl border p-4 ${item.belowReorderPoint ? "border-orange/50 bg-orange/5" : "border-white/15 bg-white/5"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="text-xl leading-none">{item.icon || defaultIcon(item)}</span>
          <div>
            <p className="font-mono text-[10px] text-cream/40">{item.code}</p>
            <p className="font-semibold text-cream">{item.name}</p>
          </div>
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

      {/* Fase R: dónde está cada cosa — no alcanza con saber cuánto hay en
          total, hace falta saber en qué casa está (pedido de Josecito:
          "en la casa de Patricio hay 8 kilos de arroz"). Solo se muestra
          si hay más de una fila (o una sola que no es el depósito central)
          — si todo está en el depósito central, la línea de "Cantidad" de
          arriba ya dice todo lo que hace falta. */}
      {!item.isReusable && item.byHolder.length > 0 && !(item.byHolder.length === 1 && item.byHolder[0].holderUserId === null) && (
        <div className="mt-1.5 rounded-lg border border-white/10 bg-black/10 px-2.5 py-1.5">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-cream/40">Dónde está</p>
          <ul className="space-y-0.5 text-xs text-cream/75">
            {item.byHolder.map((h) => (
              <li key={h.holderUserId ?? "central"} className="flex items-center justify-between gap-2">
                <span className={h.holderUserId === null ? "text-cream/60" : ""}>
                  {h.holderUserId === null ? "📦 Depósito central" : `🏠 ${h.holderLabel}`}
                </span>
                <span className="font-medium text-cream">
                  {h.quantity} {item.unit}
                </span>
              </li>
            ))}
          </ul>
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
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true)
                    returnStockCustody(item.activeCustody!.id)
                      .then(onChanged)
                      .catch((e) => onError(e.message))
                      .finally(() => setBusy(false))
                  }}
                  className="rounded-lg bg-yellow/90 px-3 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
                >
                  Marcar devuelto (a lo de Lourdes)
                </button>
                <button
                  disabled={busy}
                  onClick={() => setShowTransfer(!showTransfer)}
                  className="rounded-lg border border-white/20 px-3 py-1 text-xs text-cream/80 hover:bg-white/5 disabled:opacity-50"
                >
                  Pasar directo a otra persona
                </button>
              </div>
              {showTransfer && (
                <div className="mt-1.5 flex gap-2">
                  <select
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
                  >
                    <option value="" className="bg-papel text-tinta">
                      Traspasar a...
                    </option>
                    {users
                      .filter((u) => u.id !== item.activeCustody?.holder?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id} className="bg-papel text-tinta">
                          {u.name}
                        </option>
                      ))}
                  </select>
                  <button
                    disabled={!transferTo || busy}
                    onClick={() => {
                      setBusy(true)
                      transferStockCustody(item.activeCustody!.id, { holderUserId: transferTo })
                        .then(() => {
                          setShowTransfer(false)
                          setTransferTo("")
                          onChanged()
                        })
                        .catch((e) => onError(e.message))
                        .finally(() => setBusy(false))
                    }}
                    className="rounded-lg bg-yellow px-3 py-1 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={pickUserId}
                onChange={(e) => setPickUserId(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-xs text-cream outline-none focus:border-yellow"
              >
                <option value="" className="bg-papel text-tinta">
                  Prestar a...
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-papel text-tinta">
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
                <option value="ingreso" className="bg-papel text-tinta">
                  Ingreso
                </option>
                <option value="egreso" className="bg-papel text-tinta">
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

/** Bloque "Stock — grilla rápida tipo TPV": tocás la tarjeta de un insumo y
 * registrás el movimiento (o el préstamo) en un par de toques, sin tipear
 * en un formulario — pensado para un domingo con mucha gente moviendo cosas
 * a la vez. Usa los mismos endpoints que el catálogo, solo cambia la UI. */
function GrillaRapidaView({
  items,
  users,
  onChanged,
  onError,
}: {
  items: StockItemItem[]
  users: BasicUser[]
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [category, setCategory] = useState<string>("Todos")
  const [tileFor, setTileFor] = useState<StockItemItem | null>(null)

  const categories = ["Todos", ...Array.from(new Set(items.map((i) => i.category || "Sin categoría")))]
  const filtered = category === "Todos" ? items : items.filter((i) => (i.category || "Sin categoría") === category)

  return (
    <div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              category === c ? "bg-yellow text-purple-deep" : "border border-white/20 text-cream/70 hover:bg-white/5"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => setTileFor(item)}
            className={`rounded-2xl border p-3 text-left transition hover:border-yellow/50 ${
              item.belowReorderPoint ? "border-orange/50 bg-orange/5" : "border-white/15 bg-white/5"
            }`}
          >
            <span className="text-2xl leading-none">{item.icon || defaultIcon(item)}</span>
            <p className="mt-1.5 truncate text-sm font-semibold text-cream">{item.name}</p>
            {item.isReusable ? (
              <p className="text-[11px] text-cream/50">
                {item.activeCustody ? `Con ${item.activeCustody.holder?.name ?? "—"}` : "Libre"}
              </p>
            ) : (
              <p className="text-[11px] text-cream/50">
                {item.currentQuantity} {item.unit}
              </p>
            )}
          </button>
        ))}
        {filtered.length === 0 && <p className="col-span-full text-sm text-cream/50">Sin insumos en esta categoría.</p>}
      </div>

      {tileFor && (
        <QuickTileModal item={tileFor} users={users} onClose={() => setTileFor(null)} onChanged={onChanged} onError={onError} />
      )}
    </div>
  )
}

/** Modal chico de acción rápida para un insumo tocado desde la grilla (o
 * desde una alerta) — ingreso/egreso con un solo número si es consumible,
 * o prestar/devolver/traspasar si es equipamiento reusable. */
function QuickTileModal({
  item,
  users,
  onClose,
  onChanged,
  onError,
}: {
  item: StockItemItem
  users: BasicUser[]
  onClose: () => void
  onChanged: () => void
  onError: (e: string) => void
}) {
  const [movementType, setMovementType] = useState<"ingreso" | "egreso">("egreso")
  const [qty, setQty] = useState("")
  const [reason, setReason] = useState("")
  const [pickUserId, setPickUserId] = useState("")
  const [transferTo, setTransferTo] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function done() {
    onChanged()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl leading-none">{item.icon || defaultIcon(item)}</span>
          <div>
            <p className="font-display font-bold text-yellow">{item.name}</p>
            <p className="font-mono text-[10px] text-cream/40">{item.code}</p>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        {item.isReusable ? (
          item.activeCustody ? (
            <div className="space-y-3">
              <p className="text-sm text-cream/70">
                Con <span className="font-medium text-cream">{item.activeCustody.holder?.name ?? "—"}</span> desde{" "}
                {formatDate(item.activeCustody.checkedOutAt)}
              </p>
              <button
                disabled={saving}
                onClick={() => {
                  setSaving(true)
                  returnStockCustody(item.activeCustody!.id).then(done).catch((e) => setError(e.message)).finally(() => setSaving(false))
                }}
                className="w-full rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                Marcar devuelto
              </button>
              <div className="flex gap-2">
                <select
                  value={transferTo}
                  onChange={(e) => setTransferTo(e.target.value)}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
                >
                  <option value="" className="bg-papel text-tinta">
                    Pasar directo a...
                  </option>
                  {users
                    .filter((u) => u.id !== item.activeCustody?.holder?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id} className="bg-papel text-tinta">
                        {u.name}
                      </option>
                    ))}
                </select>
                <button
                  disabled={!transferTo || saving}
                  onClick={() => {
                    setSaving(true)
                    transferStockCustody(item.activeCustody!.id, { holderUserId: transferTo })
                      .then(done)
                      .catch((e) => setError(e.message))
                      .finally(() => setSaving(false))
                  }}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm text-cream/80 hover:bg-white/5 disabled:opacity-50"
                >
                  Pasar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={pickUserId}
                onChange={(e) => setPickUserId(e.target.value)}
                className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
              >
                <option value="" className="bg-papel text-tinta">
                  Prestar a...
                </option>
                {users.map((u) => (
                  <option key={u.id} value={u.id} className="bg-papel text-tinta">
                    {u.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!pickUserId || saving}
                onClick={() => {
                  setSaving(true)
                  checkOutStockItem(item.id, { holderUserId: pickUserId }).then(done).catch((e) => setError(e.message)).finally(() => setSaving(false))
                }}
                className="rounded-lg bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
              >
                Prestar
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-cream/50">
              Hay {item.currentQuantity} {item.unit} ahora.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setMovementType("egreso")}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                  movementType === "egreso" ? "bg-orange text-purple-deep" : "border border-white/20 text-cream/80 hover:bg-white/5"
                }`}
              >
                Usé / saqué
              </button>
              <button
                onClick={() => setMovementType("ingreso")}
                className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${
                  movementType === "ingreso" ? "bg-yellow text-purple-deep" : "border border-white/20 text-cream/80 hover:bg-white/5"
                }`}
              >
                Sumé / recibí
              </button>
            </div>
            <input
              type="number"
              min="0.1"
              step="0.1"
              autoFocus
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={`Cantidad (${item.unit})`}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
            />
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
            />
            <button
              disabled={!qty || saving}
              onClick={() => {
                setSaving(true)
                createStockMovement(item.id, { type: movementType, quantity: Number(qty), reason: reason.trim() || undefined })
                  .then(done)
                  .catch((e) => setError(e.message))
                  .finally(() => setSaving(false))
              }}
              className="w-full rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Confirmar"}
            </button>
          </div>
        )}

        <button onClick={onClose} className="mt-4 w-full text-center text-xs text-cream/40 hover:text-cream">
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Bloque "Stock — Reporte de Inventario": tabla completa buscable de todo
 * el catálogo, con estado (sin stock / bajo / OK) y descarga en CSV. */
function ReporteInventarioView({ items }: { items: StockItemItem[] }) {
  const [search, setSearch] = useState("")

  const filtered = items.filter((i) => {
    const s = search.trim().toLowerCase()
    if (!s) return true
    return i.name.toLowerCase().includes(s) || i.code.toLowerCase().includes(s) || (i.category ?? "").toLowerCase().includes(s)
  })

  function estadoFor(i: StockItemItem): { label: string; className: string } {
    if (i.isReusable) {
      return i.activeCustody
        ? { label: "Prestado", className: "bg-blue-500/20 text-blue-300" }
        : { label: "Libre", className: "bg-white/10 text-cream/70" }
    }
    if ((i.currentQuantity ?? 0) <= 0) return { label: "Sin stock", className: "bg-red-500/20 text-red-300" }
    if (i.belowReorderPoint) return { label: "Bajo", className: "bg-orange/20 text-orange" }
    return { label: "OK", className: "bg-green-500/20 text-green-300" }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, código o categoría..."
          className="min-w-[16rem] flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        />
        <button
          onClick={() =>
            downloadCsv(
              "reporte_inventario.csv",
              [
                ["Producto", "SKU", "Categoría", "Stock", "Mínimo", "Ideal", "Valor", "Estado"],
                ...filtered.map((i) => [
                  i.name,
                  i.code,
                  i.category ?? "",
                  i.isReusable ? "" : `${i.currentQuantity ?? 0} ${i.unit}`,
                  i.reorderPoint ?? "",
                  i.restockTarget ?? "",
                  i.totalValue ?? "",
                  estadoFor(i).label,
                ]),
              ],
            )
          }
          className="rounded-xl border border-white/20 px-3 py-2 text-xs text-cream/80 hover:bg-white/5"
        >
          ⬇ Descargar CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/15">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-cream/50">
            <tr>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Categoría</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2">Mínimo</th>
              <th className="px-3 py-2">Ideal</th>
              <th className="px-3 py-2">Valor</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => {
              const estado = estadoFor(i)
              return (
                <tr key={i.id} className="border-t border-white/10">
                  <td className="px-3 py-2 text-cream">
                    <span className="mr-1.5">{i.icon || defaultIcon(i)}</span>
                    {i.name}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-cream/50">{i.code}</td>
                  <td className="px-3 py-2 text-cream/60">{i.category ?? "—"}</td>
                  <td className="px-3 py-2 text-cream/80">{i.isReusable ? "—" : `${i.currentQuantity ?? 0} ${i.unit}`}</td>
                  <td className="px-3 py-2 text-cream/50">{i.reorderPoint ?? "—"}</td>
                  <td className="px-3 py-2 text-cream/50">{i.restockTarget ?? "—"}</td>
                  <td className="px-3 py-2 text-cream/80">{i.totalValue !== null ? formatMoney(i.totalValue) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${estado.className}`}>{estado.label}</span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-cream/40">
                  No hay insumos que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const QUICK_RANGES: { label: string; days: number }[] = [
  { label: "Hoy", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
]

/** Bloque "Stock — historial de movimientos unificado": todos los
 * ingresos/egresos de todos los insumos juntos, filtrables por fecha, tipo,
 * responsable y búsqueda de texto — antes solo se veía insumo por insumo. */
function HistorialMovimientosView({ users }: { users: BasicUser[] }) {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [type, setType] = useState<"" | "ingreso" | "egreso">("")
  const [createdBy, setCreatedBy] = useState("")
  const [search, setSearch] = useState("")
  const [report, setReport] = useState<StockMovementsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  function refresh(overrides?: Partial<{ dateFrom: string; dateTo: string }>) {
    const df = overrides?.dateFrom ?? dateFrom
    const dt = overrides?.dateTo ?? dateTo
    listAllStockMovements({
      dateFrom: df || undefined,
      dateTo: dt || undefined,
      type: type || undefined,
      createdBy: createdBy || undefined,
      search: search.trim() || undefined,
    })
      .then(setReport)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, type, createdBy])

  // Búsqueda de texto con un pequeño debounce para no disparar un fetch por tecla.
  useEffect(() => {
    const id = setTimeout(refresh, 300)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function applyQuickRange(days: number) {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    const df = isoDateOnly(from)
    const dt = isoDateOnly(to)
    setDateFrom(df)
    setDateTo(dt)
    refresh({ dateFrom: df, dateTo: dt })
  }

  return (
    <div>
      {report && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Entradas</p>
            <p className="text-lg font-semibold text-green-300">+{report.summary.totalIngresos}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Salidas</p>
            <p className="text-lg font-semibold text-orange">-{report.summary.totalEgresos}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Movimientos</p>
            <p className="text-lg font-semibold text-cream">{report.summary.count}</p>
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-3">
            <p className="text-[11px] text-cream/50">Insumos afectados</p>
            <p className="text-lg font-semibold text-cream">{report.summary.distinctItems}</p>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-cream/60">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-cream/60">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-cream/60">Tipo</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "" | "ingreso" | "egreso")}
            className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-papel text-tinta">Todos</option>
            <option value="ingreso" className="bg-papel text-tinta">Ingreso</option>
            <option value="egreso" className="bg-papel text-tinta">Egreso</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-cream/60">Responsable</span>
          <select
            value={createdBy}
            onChange={(e) => setCreatedBy(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-cream outline-none focus:border-yellow"
          >
            <option value="" className="bg-papel text-tinta">Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id} className="bg-papel text-tinta">
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto, motivo..."
          className="min-w-[12rem] flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-cream outline-none focus:border-yellow"
        />
        <div className="flex gap-1">
          {QUICK_RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => applyQuickRange(r.days)}
              className="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-cream/70 hover:bg-white/5"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-orange">{error}</p>}

      <div className="space-y-1.5">
        {report === null && <p className="text-sm text-cream/50">Cargando...</p>}
        {report?.movements.length === 0 && <p className="text-sm text-cream/50">Sin movimientos en este período.</p>}
        {report?.movements.map((m) => (
          <div key={m.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate text-cream">
                <span className={m.type === "ingreso" ? "text-green-300" : "text-orange"}>
                  {m.type === "ingreso" ? "+" : "-"}
                  {m.quantity} {m.stockItem.unit}
                </span>{" "}
                {m.stockItem.name}
                {m.reason && <span className="text-cream/50"> — {m.reason}</span>}
              </p>
              <p className="text-[11px] text-cream/40">{m.createdBy?.name ?? "—"}</p>
            </div>
            <span className="shrink-0 text-xs text-cream/40">{formatDateTime(m.createdAt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Bloque "Stock — Alertas": sin stock / bajo punto de pedido, calculado en
 * vivo desde la cantidad actual (no persiste historial de "resuelta" —
 * si hace falta rastrear quién resolvió cada alerta y cuándo, es un modelo
 * propio a futuro). */
function AlertasStockView({ onChanged, onError }: { onChanged: () => void; onError: (e: string) => void }) {
  const [alerts, setAlerts] = useState<StockAlerts | null>(null)
  const [tileFor, setTileFor] = useState<StockItemItem | null>(null)
  const [users, setUsers] = useState<BasicUser[] | null>(null)

  function refresh() {
    getStockAlerts().then(setAlerts).catch((e) => onError(e.message))
  }

  useEffect(() => {
    refresh()
    listBasicUsers().then(setUsers).catch(() => setUsers([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!alerts || !users) return <p className="text-sm text-cream/50">Cargando...</p>

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className={`rounded-xl border p-3 ${alerts.sinStock.length > 0 ? "border-red-500/40 bg-red-500/10" : "border-white/15 bg-white/5"}`}>
          <p className="text-[11px] text-cream/50">Sin stock</p>
          <p className={`text-lg font-semibold ${alerts.sinStock.length > 0 ? "text-red-300" : "text-cream"}`}>{alerts.sinStock.length}</p>
        </div>
        <div className={`rounded-xl border p-3 ${alerts.bajo.length > 0 ? "border-orange/40 bg-orange/10" : "border-white/15 bg-white/5"}`}>
          <p className="text-[11px] text-cream/50">Stock bajo</p>
          <p className={`text-lg font-semibold ${alerts.bajo.length > 0 ? "text-orange" : "text-cream"}`}>{alerts.bajo.length}</p>
        </div>
        <div className="rounded-xl border border-green-500/40 bg-green-500/10 p-3">
          <p className="text-[11px] text-cream/50">Resto OK</p>
          <p className="text-lg font-semibold text-green-300">✓</p>
        </div>
      </div>

      {alerts.sinStock.length === 0 && alerts.bajo.length === 0 ? (
        <div className="rounded-2xl border border-green-500/30 bg-green-500/5 p-6 text-center">
          <p className="text-sm text-green-300">Todo en orden — no hay alertas de stock pendientes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.sinStock.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-red-300">Sin stock</h3>
              <div className="space-y-1.5">
                {alerts.sinStock.map((i) => (
                  <AlertRow key={i.id} item={i} onTap={() => setTileFor(i)} />
                ))}
              </div>
            </div>
          )}
          {alerts.bajo.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-orange">Stock bajo</h3>
              <div className="space-y-1.5">
                {alerts.bajo.map((i) => (
                  <AlertRow key={i.id} item={i} onTap={() => setTileFor(i)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tileFor && (
        <QuickTileModal
          item={tileFor}
          users={users}
          onClose={() => setTileFor(null)}
          onChanged={() => {
            refresh()
            onChanged()
          }}
          onError={onError}
        />
      )}
    </div>
  )
}

function AlertRow({ item, onTap }: { item: StockItemItem; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm hover:border-yellow/40"
    >
      <span className="flex items-center gap-2 text-cream">
        <span>{item.icon || defaultIcon(item)}</span>
        {item.name}
        <span className="font-mono text-[10px] text-cream/40">{item.code}</span>
      </span>
      <span className="text-cream/60">
        {item.currentQuantity} {item.unit}
        {item.reorderPoint !== null && <span className="text-cream/40"> / mín. {item.reorderPoint}</span>}
      </span>
    </button>
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
  const [icon, setIcon] = useState(item?.icon ?? "")
  const [isReusable, setIsReusable] = useState(item?.isReusable ?? false)
  const [unitCost, setUnitCost] = useState(item?.unitCost?.toString() ?? "")
  const [reorderPoint, setReorderPoint] = useState(item?.reorderPoint?.toString() ?? "")
  const [restockTarget, setRestockTarget] = useState(item?.restockTarget?.toString() ?? "")
  const [initialQuantity, setInitialQuantity] = useState("")
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
            icon: icon.trim() || undefined,
            isReusable,
            unitCost: unitCost ? Number(unitCost) : undefined,
            reorderPoint: reorderPoint ? Number(reorderPoint) : undefined,
            restockTarget: restockTarget ? Number(restockTarget) : undefined,
            initialQuantity: !item && initialQuantity ? Number(initialQuantity) : undefined,
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

        <div className="mb-3 flex gap-2">
          <label className="w-16 text-sm">
            <span className="mb-1 block text-cream/70">Ícono</span>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="🥔"
              maxLength={4}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-2 py-2 text-center text-lg text-cream outline-none focus:border-yellow"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-cream/70">Nombre *</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. Papa"
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            />
          </label>
        </div>

        <div className="mb-3 flex gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-cream/70">Unidad *</span>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as StockUnit)}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
            >
              {STOCK_UNITS.map((u) => (
                <option key={u} value={u} className="bg-papel text-tinta">
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
            {!item && (
              <label className="block text-sm">
                <span className="mb-1 block text-cream/70">Existencia inicial (opcional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={initialQuantity}
                  onChange={(e) => setInitialQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
                />
                <span className="mt-1 block text-[11px] text-cream/40">
                  Si ya tenés algo de esto, cargalo acá — se registra como el primer ingreso, sin tener que ir después a "+ Movimiento".
                </span>
              </label>
            )}
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
