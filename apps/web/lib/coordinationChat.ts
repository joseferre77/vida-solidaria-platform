import { apiFetch } from "./api-client"

export interface CoordinationMessageAuthor {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

export interface CoordinationMessage {
  id: string
  body: string
  createdAt: string
  createdBy: CoordinationMessageAuthor
}

// Fase M — chat de coordinadores: un solo canal, polling (no hay
// Socket.IO integrado en la plataforma todavía). `after` trae solo los
// mensajes posteriores a ese id, para no repetir todo el historial en
// cada tick del polling.
export const listCoordinationMessages = (after?: string) => {
  const qs = after ? `?after=${encodeURIComponent(after)}` : ""
  return apiFetch(`/api/coordination-chat/messages${qs}`) as Promise<{ items: CoordinationMessage[] }>
}

export const sendCoordinationMessage = (body: string) =>
  apiFetch("/api/coordination-chat/messages", {
    method: "POST",
    body: JSON.stringify({ body }),
  }) as Promise<CoordinationMessage>
