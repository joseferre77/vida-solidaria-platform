import { apiFetch } from "./api-client"

export interface BasicUser {
  id: string
  name: string
  email: string
}

export interface StockItemItem {
  id: string
  name: string
  unit: string
  category: string | null
  minStockAlert: number | string | null
}

export type KitchenBatchStatus = "preparacion" | "coccion" | "listo_transporte" | "entregado"

export const KITCHEN_STATUS_LABEL: Record<KitchenBatchStatus, string> = {
  preparacion: "Preparación",
  coccion: "Cocción",
  listo_transporte: "Listo para transporte",
  entregado: "Entregado",
}

export const KITCHEN_STATUS_ORDER: KitchenBatchStatus[] = ["preparacion", "coccion", "listo_transporte", "entregado"]

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
  ingredients: KitchenBatchIngredientItem[]
  assignees: KitchenBatchAssigneeItem[]
  statusHistory: { toStatus: KitchenBatchStatus; changedAt: string; changedBy: BasicUser | null }[]
}

// ── Insumos ──
export const listStockItems = () => apiFetch("/api/stock-items") as Promise<StockItemItem[]>

export const createStockItem = (data: { name: string; unit: string; category?: string; minStockAlert?: number }) =>
  apiFetch("/api/stock-items", { method: "POST", body: JSON.stringify(data) }) as Promise<StockItemItem>

export const deleteStockItem = (id: string) => apiFetch(`/api/stock-items/${id}`, { method: "DELETE" })

// ── Lotes de cocina ──
export const listKitchenBatches = () => apiFetch("/api/kitchen-batches") as Promise<KitchenBatchItem[]>

export const getKitchenBatch = (id: string) => apiFetch(`/api/kitchen-batches/${id}`) as Promise<KitchenBatchItem>

export const createKitchenBatch = (data: { name: string; targetServings: number }) =>
  apiFetch("/api/kitchen-batches", { method: "POST", body: JSON.stringify(data) }) as Promise<KitchenBatchItem>

export const updateKitchenBatchStatus = (id: string, status: KitchenBatchStatus) =>
  apiFetch(`/api/kitchen-batches/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }) as Promise<
    KitchenBatchItem
  >

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
