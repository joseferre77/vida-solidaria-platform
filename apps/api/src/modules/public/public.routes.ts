/**
 * Fase K bloque A: alta pública de voluntarios.
 *
 * Único módulo de esta API que NO requiere autenticación — lo postea el
 * sitio estático vidasolidariamdp.com (dominio raíz, separado del
 * subdominio de gestión). Por eso:
 *  - Rate-limit propio en memoria (no hay @fastify/rate-limit instalado
 *    todavía y agregar una dependencia nueva para un solo endpoint no vale
 *    la pena) — 5 intentos por IP cada 15 minutos.
 *  - CORS: server.ts ahora acepta una lista de orígenes (ver env.ts /
 *    CORS_ORIGIN), no solo gestion.vidasolidariamdp.com.
 *  - No crea rol ni contraseña: el usuario queda `pending`, sin poder
 *    loguearse (passwordHash null), hasta que la comisión lo aprueba desde
 *    /administracion → Usuarios (ver users.routes.ts, POST .../approve).
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { sendEmail } from "../../lib/email"
import { notify, usersWithPermission } from "../../lib/notify"

const volunteerSignupSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre completo").max(120),
  email: z.string().trim().email("Ingresá un email válido"),
  phone: z.string().trim().min(6, "Ingresá un teléfono válido").max(30).optional(),
  message: z.string().trim().max(500).optional(),
})

// ── Rate limit en memoria: 5 intentos / 15 min por IP ──
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX = 5
const attemptsByIp = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = attemptsByIp.get(ip)
  if (!entry || now > entry.resetAt) {
    attemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count += 1
  return true
}

// Limpieza periódica para no acumular IPs viejas en memoria indefinidamente.
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of attemptsByIp) {
    if (now > entry.resetAt) attemptsByIp.delete(ip)
  }
}, RATE_LIMIT_WINDOW_MS).unref()

function welcomeEmailHtml(name: string) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color:#73038C;">¡Gracias por sumarte, ${name}!</h2>
      <p>Recibimos tu registro como voluntario/a de <strong>Vida Solidaria Mar del Plata</strong>.</p>
      <p>La comisión va a revisar tu solicitud a la brevedad. Cuando te den el alta, te va a llegar
      otro email con tus datos de acceso al sistema y el equipo al que quedás asignado.</p>
      <p>¡Gracias por querer ser parte!</p>
    </div>
  `
}

export async function publicRoutes(app: FastifyInstance) {
  app.post("/public/volunteer-signup", async (request, reply) => {
    if (!checkRateLimit(request.ip)) {
      return reply.code(429).send({ error: "Demasiados intentos. Probá de nuevo en un rato." })
    }

    const body = volunteerSignupSchema.parse(request.body)

    const existing = await prisma.user.findUnique({ where: { email: body.email } })
    if (existing) {
      return reply.code(409).send({ error: "Ya hay un registro con ese email" })
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        volunteerMessage: body.message || null,
        status: "pending",
      },
    })

    // Email al voluntario — best-effort, no bloquea la respuesta si Resend
    // todavía no está configurado (ver lib/email.ts).
    await sendEmail({
      to: user.email,
      subject: "Recibimos tu registro — Vida Solidaria MDP",
      html: welcomeEmailHtml(user.name),
    })

    // Aviso a la comisión (quien tenga el permiso de gestionar usuarios) para
    // que sepa que hay una alta esperando aprobación.
    const approvers = await usersWithPermission("users.manage")
    await notify(
      approvers.map((a) => a.id),
      {
        title: "Nuevo voluntario pendiente de aprobación",
        body: `${user.name} (${user.email}) se registró desde la web y espera aprobación.`,
        link: "/administracion",
        type: "volunteer_pending",
        email: {
          subject: "Nuevo voluntario esperando aprobación",
          html: `<p><strong>${user.name}</strong> (${user.email}${
            user.phone ? `, ${user.phone}` : ""
          }) se registró como voluntario en vidasolidariamdp.com y espera aprobación.</p>${
            user.volunteerMessage ? `<p>Mensaje: "${user.volunteerMessage}"</p>` : ""
          }<p>Revisalo en /administracion → Usuarios.</p>`,
        },
      },
    )

    return reply.code(201).send({ ok: true })
  })
}
