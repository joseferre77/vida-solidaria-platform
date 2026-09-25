import { apiFetch } from "./api-client"

export interface NotificationItem {
  id: string
  title: string
  body: string | null
  link: string | null
  type: string | null
  readAt: string | null
  createdAt: string
}

export interface NotificationsResponse {
  items: NotificationItem[]
  unreadCount: number
}

export const listNotifications = () => apiFetch("/api/notifications") as Promise<NotificationsResponse>

export const markNotificationRead = (id: string) =>
  apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" }) as Promise<NotificationItem>

export const markAllNotificationsRead = () =>
  apiFetch("/api/notifications/read-all", { method: "PATCH" }) as Promise<{ ok: true }>

// Fase S — pantalla "Notificaciones" (historial completo, separado de la
// campanita que ahora solo muestra lo no leído).
export interface NotificationsHistoryResponse {
  items: NotificationItem[]
  page: number
  hasMore: boolean
  total: number
}

export const listNotificationsHistory = (page = 1) =>
  apiFetch(`/api/notifications/history?page=${page}`) as Promise<NotificationsHistoryResponse>

export const clearReadNotifications = () =>
  apiFetch("/api/notifications/read", { method: "DELETE" }) as Promise<{ deleted: number }>
