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

export interface StockItemItem {
  id: string
  code: string
  name: string
  unit: StockUnit
  category: string | null
  isReusable: boolean
  unitCost: number | null
  reorderPoint: number | null
  restockTarget: number | null
  createdAt: string
  currentQuantity: number | null
  totalValue: number | null
  belowReorderPoint: boolean
  activeCustody: StockCustodyItem | null
}

export interface StockSummary {
  totalItems: number
  totalValuation: number
  belowReorderPoint: number
  reusableOnLoan: number
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
}

// ── Insumos ──
export const listStockItems = () => apiFetch("/api/stock-items") as Promise<StockItemItem[]>

export const getStockSummary = () => apiFetch("/api/stock-summary") as Promise<StockSummary>

export const createStockItem = (data: {
  name: string
  unit: StockUnit
  category?: string
  isReusable?: boolean
  unitCost?: number
  reorderPoint?: number
  restockTarget?: number
}) => apiFetch("/api/stock-items", { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const updateStockItem = (
  id: string,
  data: Partial<{
    name: string
    unit: StockUnit
    category: string
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

// ── Custodia de equipamiento reusable (conservadoras, termos, ollas...) ──
export const checkOutStockItem = (id: string, data: { holderUserId: string; quantity?: number; notes?: string }) =>
  apiFetch(`/api/stock-items/${id}/custody`, { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const returnStockCustody = (custodyId: string, data?: { returnedNotes?: string }) =>
  apiFetch(`/api/stock-custody/${custodyId}/return`, {
    method: "PATCH",
    body: JSON.stringify(data ?? {}),
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
