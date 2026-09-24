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
import { verifyWeeklyConfirmToken } from "../../lib/confirm-token"
import { brandEmailWrapper } from "../../lib/brand-email"

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


/** Página HTML mínima, sin la SPA (quien toca el link puede no tener
 * sesión abierta) pero con la identidad de marca — mismo criterio que
 * `brandEmailWrapper` en lib/brand-email.ts, versión ultra-simple para una
 * sola pantalla de confirmación. */
function brandStandalonePage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — Vida Solidaria</title></head>
<body style="margin:0; background:#F7F4F8; font-family: 'Work Sans', system-ui, sans-serif; color:#2A1030;">
  <div style="max-width:420px; margin:48px auto; padding:0 20px; text-align:center;">
    <div style="background:#73038C; border-radius:12px 12px 0 0; padding:20px;">
      <img src="https://gestion.vidasolidariamdp.com/brand/logo.png" alt="Vida Solidaria" height="36" style="height:36px;" />
    </div>
    <div style="background:#ffffff; border-radius:0 0 12px 12px; padding:32px 24px; border:1px solid #ece6ee; border-top:none;">
      <h1 style="font-size:20px; margin:0 0 12px;">${title}</h1>
      <p style="font-size:15px; line-height:1.5; margin:0;">${message}</p>
    </div>
  </div>
</body></html>`
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

  // Fase P: link de un solo toque desde el email o desde los botones del
  // push ("Puedo" / "No puedo") — a propósito SIN requerir sesión (ver
  // lib/confirm-token.ts). Responde una página HTML standalone (no la SPA)
  // porque quien toca el link puede no tener el navegador logueado.
  app.get("/public/weekly-availability/confirm", async (request, reply) => {
    const query = z
      .object({ token: z.string().min(1), attend: z.enum(["yes", "no"]) })
      .safeParse(request.query)

    if (!query.success) {
      return reply.code(400).type("text/html").send(brandStandalonePage("Link inválido", "Este link no es válido."))
    }

    const decoded = verifyWeeklyConfirmToken(query.data.token)
    if (!decoded) {
      return reply
        .code(400)
        .type("text/html")
        .send(
          brandStandalonePage(
            "Link vencido",
            "Este link ya venció. Entrá a la app y confirmá tu asistencia desde Presentismo.",
          ),
        )
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, name: true } })
    if (!user) {
      return reply.code(404).type("text/html").send(brandStandalonePage("No encontrado", "No encontramos tu usuario."))
    }

    const willAttend = query.data.attend === "yes"
    const weekStartDate = new Date(`${decoded.weekStartDate}T00:00:00.000Z`)

    await prisma.weeklyAvailability.upsert({
      where: { userId_weekStartDate: { userId: user.id, weekStartDate } },
      create: { userId: user.id, weekStartDate, willAttend, reason: null },
      update: { willAttend },
    })

    const sundayLabel = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
      weekStartDate,
    )

    return reply
      .type("text/html")
      .send(
        willAttend
          ? brandStandalonePage(
              `¡Gracias, ${user.name.split(" ")[0]}!`,
              `Quedaste anotado/a para el encuentro del domingo ${sundayLabel}. ¡Te esperamos! 💜`,
            )
          : brandStandalonePage(
              `Gracias por avisar, ${user.name.split(" ")[0]}`,
              `Anotamos que no podés venir el domingo ${sundayLabel}. ¡Nos vemos la próxima!`,
            ),
      )
  })
}
