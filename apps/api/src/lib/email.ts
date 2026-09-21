/**
 * Fase K: envío de emails transaccionales (bienvenida de voluntarios,
 * aprobación de alta, alertas de stock bajo, notificaciones de casos).
 *
 * Usa Resend (https://resend.com) por API HTTP simple — decisión tomada con
 * Josecito el 21/09/2026 (ver PLAN_FASE_K.md). Sin `RESEND_API_KEY`
 * configurada, esto NO rompe nada: loguea y sigue de largo, así que todo el
 * resto del sistema (crear stock, aprobar usuarios, etc.) funciona igual
 * mientras no esté la cuenta de Resend creada.
 */
import { env } from "../config/env"

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY no configurada — se omite el envío a ${to}: "${subject}"`)
    return { sent: false as const, reason: "no_api_key" as const }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`[email] Resend respondió ${res.status} al mandarle a ${to}: ${text}`)
      return { sent: false as const, reason: "provider_error" as const }
    }
    return { sent: true as const }
  } catch (err) {
    console.error(`[email] Falló el envío a ${to}:`, err)
    return { sent: false as const, reason: "network_error" as const }
  }
}
