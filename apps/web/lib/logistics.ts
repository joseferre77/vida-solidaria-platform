import { apiFetch } from "./api-client"

export interface BasicUser {
  id: string
  name: string
  email: string
}

export interface StockCustodyItem {
  id: string
  holder: BasicUser | null
  quantity: number | string
  notes: string | null
  checkedOutAt: string
}

export interface StockCustodyHistoryItem extends StockCustodyItem {
  checkedOutBy: BasicUser | null
  returnedAt: string | null
  returnedNotes: string | null
}

export const STOCK_UNITS = ["kg", "litros", "unidades", "paquetes", "cajas"] as const
export type StockUnit = (typeof STOCK_UNITS)[number]

export const STOCK_UNIT_LABEL: Record<StockUnit, string> = {
  kg: "Kilos (kg)",
  litros: "Litros",
  unidades: "Unidades",
  paquetes: "Paquetes",
  cajas: "Cajas",
}

export interface StockMovementItem {
  id: string
  type: "ingreso" | "egreso"
  quantity: number | string
  reason: string | null
  relatedEntityType: string | null
  createdBy: BasicUser | null
  createdAt: string
}

// Fase R: dónde está cada cosa — depósito central (holderUserId null) +
// casas de coordinadores, cada uno con su cantidad neta (ver
// quantityByHolder/serializeByHolder en logistics.routes.ts).
export interface StockHolderRow {
  holderUserId: string | null
  holder: BasicUser | null
  holderLabel: string
  quantity: number | string
}

export interface StockItemItem {
  id: string
  code: string
  name: string
  unit: StockUnit
  category: string | null
  icon: string | null
  isReusable: boolean
  unitCost: number | null
  reorderPoint: number | null
  restockTarget: number | null
  createdAt: string
  currentQuantity: number | null
  totalValue: number | null
  belowReorderPoint: boolean
  activeCustody: StockCustodyItem | null
  byHolder: StockHolderRow[]
}

export interface StockSummary {
  totalItems: number
  totalValuation: number
  belowReorderPoint: number
  reusableOnLoan: number
}

// Bloque "Stock — historial de movimientos unificado" y "Alertas de stock"
export interface StockMovementWithItem extends StockMovementItem {
  stockItem: { id: string; name: string; code: string; unit: string }
}

export interface StockMovementsReport {
  summary: {
    totalIngresos: number
    totalEgresos: number
    count: number
    distinctItems: number
  }
  movements: StockMovementWithItem[]
}

export interface StockAlerts {
  sinStock: StockItemItem[]
  bajo: StockItemItem[]
}

export type KitchenBatchStatus =
  | "preparacion"
  | "coccion"
  | "cocina_terminada"
  | "listo_transporte"
  | "camino_punto_encuentro"
  | "entregado"

export const KITCHEN_STATUS_LABEL: Record<KitchenBatchStatus, string> = {
  preparacion: "Preparación",
  coccion: "Cocción",
  cocina_terminada: "Cocina terminada",
  listo_transporte: "Cargando conservadoras",
  camino_punto_encuentro: "Camino al punto de encuentro",
  entregado: "Entregado",
}

export const KITCHEN_STATUS_ORDER: KitchenBatchStatus[] = [
  "preparacion",
  "coccion",
  "cocina_terminada",
  "listo_transporte",
  "camino_punto_encuentro",
  "entregado",
]

export interface KitchenBatchIngredientItem {
  stockItemId: string
  stockItemName: string
  unit: string
  quantityAssigned: number | string
}

export interface KitchenBatchAssigneeItem extends BasicUser {
  taskLabel: string | null
  // Fase R: cuándo tocó el link de "confirmá que vas a cocinar" del mail —
  // null si todavía no contestó (no bloquea nada, es solo una señal).
  confirmedAt: string | null
}

// Fase L — equipamiento reusable (conservadora, olla) sumado al kit de este
// lote; cada fila es un préstamo (StockCustody) linkeado al lote.
export interface KitchenBatchEquipmentItem {
  custodyId: string
  stockItemId: string
  stockItemName: string
  unit: string
  quantity: number | string
  holder: BasicUser | null
  checkedOutAt: string
  returnedAt: string | null
}

export interface KitchenBatchItem {
  id: string
  name: string
  targetServings: number
  status: KitchenBatchStatus
  createdAt: string
  createdBy: BasicUser | null
  responsible: BasicUser | null
  ingredients: KitchenBatchIngredientItem[]
  assignees: KitchenBatchAssigneeItem[]
  statusHistory: { toStatus: KitchenBatchStatus; changedAt: string; changedBy: BasicUser | null }[]
  equipment: KitchenBatchEquipmentItem[]
}

// ── Insumos ──
export const listStockItems = () => apiFetch("/api/stock-items") as Promise<StockItemItem[]>

export const getStockSummary = () => apiFetch("/api/stock-summary") as Promise<StockSummary>

export const createStockItem = (data: {
  name: string
  unit: StockUnit
  category?: string
  icon?: string
  isReusable?: boolean
  unitCost?: number
  reorderPoint?: number
  restockTarget?: number
  // Cantidad inicial al crear — dispara el primer ingreso solo (ver
  // logistics.routes.ts). Se ignora si isReusable.
  initialQuantity?: number
}) => apiFetch("/api/stock-items", { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const updateStockItem = (
  id: string,
  data: Partial<{
    name: string
    unit: StockUnit
    category: string
    icon: string
    isReusable: boolean
    unitCost: number
    reorderPoint: number
    restockTarget: number
  }>,
) => apiFetch(`/api/stock-items/${id}`, { method: "PATCH", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const deleteStockItem = (id: string) => apiFetch(`/api/stock-items/${id}`, { method: "DELETE" })

// ── Movimientos de stock (ledger: ingreso/egreso) ──
export const listStockMovements = (id: string) =>
  apiFetch(`/api/stock-items/${id}/movements`) as Promise<StockMovementItem[]>

export const createStockMovement = (
  id: string,
  data: { type: "ingreso" | "egreso"; quantity: number; reason?: string },
) => apiFetch(`/api/stock-items/${id}/movements`, { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

// Historial de movimientos unificado (todos los insumos juntos, filtrable)
export const listAllStockMovements = (filters?: {
  dateFrom?: string
  dateTo?: string
  type?: "ingreso" | "egreso"
  createdBy?: string
  search?: string
}) => {
  const params = new URLSearchParams()
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom)
  if (filters?.dateTo) params.set("dateTo", filters.dateTo)
  if (filters?.type) params.set("type", filters.type)
  if (filters?.createdBy) params.set("createdBy", filters.createdBy)
  if (filters?.search) params.set("search", filters.search)
  const qs = params.toString()
  return apiFetch(`/api/stock-movements${qs ? `?${qs}` : ""}`) as Promise<StockMovementsReport>
}

// Alertas de stock (sin stock / bajo punto de pedido)
export const getStockAlerts = () => apiFetch("/api/stock-alerts") as Promise<StockAlerts>

// ── Custodia de equipamiento reusable (conservadoras, termos, ollas...) ──
export const checkOutStockItem = (id: string, data: { holderUserId: string; quantity?: number; notes?: string }) =>
  apiFetch(`/api/stock-items/${id}/custody`, { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const returnStockCustody = (custodyId: string, data?: { returnedNotes?: string }) =>
  apiFetch(`/api/stock-custody/${custodyId}/return`, {
    method: "PATCH",
    body: JSON.stringify(data ?? {}),
  }) as Promise<StockItemItem>

// Traspaso directo (ej. cocinero → despachador) en un solo paso, en vez de
// devolver y después prestarle a la próxima persona.
export const transferStockCustody = (custodyId: string, data: { holderUserId: string; notes?: string }) =>
  apiFetch(`/api/stock-custody/${custodyId}/transfer`, {
    method: "POST",
    body: JSON.stringify(data),
  }) as Promise<StockItemItem>

export const getStockCustodyHistory = (id: string) =>
  apiFetch(`/api/stock-items/${id}/custody-history`) as Promise<StockCustodyHistoryItem[]>

// ── Lotes de cocina ──
export const listKitchenBatches = () => apiFetch("/api/kitchen-batches") as Promise<KitchenBatchItem[]>

export const getKitchenBatch = (id: string) => apiFetch(`/api/kitchen-batches/${id}`) as Promise<KitchenBatchItem>

export const createKitchenBatch = (data: { name: string; targetServings: number; responsibleUserId?: string }) =>
  apiFetch("/api/kitchen-batches", { method: "POST", body: JSON.stringify(data) }) as Promise<KitchenBatchItem>

export const updateKitchenBatchStatus = (id: string, status: KitchenBatchStatus) =>
  apiFetch(`/api/kitchen-batches/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }) as Promise<
    KitchenBatchItem
  >

export const setKitchenBatchResponsible = (id: string, responsibleUserId: string | null) =>
  apiFetch(`/api/kitchen-batches/${id}/responsible`, {
    method: "PATCH",
    body: JSON.stringify({ responsibleUserId }),
  }) as Promise<KitchenBatchItem>

export const addKitchenBatchIngredient = (id: string, data: { stockItemId: string; quantityAssigned: number }) =>
  apiFetch(`/api/kitchen-batches/${id}/ingredients`, { method: "POST", body: JSON.stringify(data) }) as Promise<
    KitchenBatchItem
  >

export const removeKitchenBatchIngredient = (id: string, stockItemId: string) =>
  apiFetch(`/api/kitchen-batches/${id}/ingredients/${stockItemId}`, { method: "DELETE" }) as Promise<KitchenBatchItem>

export const addKitchenBatchAssignee = (id: string, data: { userId: string; taskLabel?: string }) =>
  apiFetch(`/api/kitchen-batches/${id}/assignees`, { method: "POST", body: JSON.stringify(data) }) as Promise<
    KitchenBatchItem
  >

export const removeKitchenBatchAssignee = (id: string, userId: string) =>
  apiFetch(`/api/kitchen-batches/${id}/assignees/${userId}`, { method: "DELETE" }) as Promise<KitchenBatchItem>

// Fase L — equipamiento del kit (armar en un solo paso desde Cocina, junto
// a los insumos de arriba).
export const addKitchenBatchEquipment = (
  id: string,
  data: { stockItemId: string; quantity?: number; holderUserId?: string; notes?: string },
) => apiFetch(`/api/kitchen-batches/${id}/equipment`, { method: "POST", body: JSON.stringify(data) }) as Promise<
  KitchenBatchItem
>

export const removeKitchenBatchEquipment = (id: string, custodyId: string) =>
  apiFetch(`/api/kitchen-batches/${id}/equipment/${custodyId}`, { method: "DELETE" }) as Promise<KitchenBatchItem>

// Fase L — "tablero del voluntario": mis lotes de cocina (soy responsable o
// estoy asignado), para el widget del dashboard.
export const listMyKitchenBatches = () => apiFetch("/api/kitchen-batches/mine") as Promise<KitchenBatchItem[]>


// ── Fase R: "Mi depósito" — donaciones que un coordinador tiene en su
// propia casa en vez de en el depósito central (ver holderUserId en
// StockMovement). Cualquier usuario activo puede usar esto, no requiere
// logistics.write. ──
export interface MyStockRow {
  stockItem: { id: string; code: string; name: string; unit: StockUnit; icon: string | null }
  quantity: number | string
}

export interface StockCatalogEntry {
  id: string
  name: string
  unit: StockUnit
  icon: string | null
}

export const getMyStock = () => apiFetch("/api/my-stock") as Promise<MyStockRow[]>

// Catálogo mínimo (sin permiso logistics.read) para elegir un insumo que ya
// existe al cargar una donación, en vez de crear uno duplicado sin saberlo.
export const getMyStockCatalog = () => apiFetch("/api/my-stock/catalog") as Promise<StockCatalogEntry[]>

export const createMyStockIngreso = (data: {
  stockItemId?: string
  newItemName?: string
  unit?: StockUnit
  quantity: number
  reason?: string
}) => apiFetch("/api/my-stock/ingreso", { method: "POST", body: JSON.stringify(data) }) as Promise<{
  ok: true
  stockItem: { id: string; name: string; unit: StockUnit }
}>

export const transferMyStock = (
  stockItemId: string,
  data: { toHolderUserId: string | null; quantity: number; notes?: string; fromHolderUserId?: string },
) => apiFetch(`/api/my-stock/${stockItemId}/traspaso`, { method: "POST", body: JSON.stringify(data) }) as Promise<
  StockItemItem
>
