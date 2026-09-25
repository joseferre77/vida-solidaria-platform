/**
 * Fase K bloque A: alta pública de voluntarios (formulario del sitio
 * vidasolidariamdp.com, sin contraseña — la pone la comisión al aprobar).
 * Fase Q: autorregistro CON contraseña propia desde /login de la app de
 * gestión, con verificación de email antes de entrar a la cola de
 * aprobación de la comisión (ver /public/register y /public/verify-email
 * más abajo). Son dos flujos distintos que conviven sobre la misma tabla
 * `users` — se distinguen porque el de Fase Q siempre tiene `passwordHash`
 * desde el alta y el de Fase K nunca lo tiene hasta que se aprueba.
 *
 * Único módulo de esta API que NO requiere autenticación — por eso:
 *  - Rate-limit propio en memoria por endpoint (no hay @fastify/rate-limit
 *    instalado todavía y agregar una dependencia nueva para un par de
 *    endpoints no vale la pena) — 5 intentos por IP cada 15 minutos, cada
 *    endpoint con su propio contador para que un flujo no bloquee al otro.
 *  - CORS: server.ts acepta una lista de orígenes (ver env.ts / CORS_ORIGIN),
 *    no solo gestion.vidasolidariamdp.com.
 */
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "../../lib/prisma"
import { env } from "../../config/env"
import { sendEmail } from "../../lib/email"
import { notify, usersWithPermission } from "../../lib/notify"
import { verifyWeeklyConfirmToken } from "../../lib/confirm-token"
import { verifyKitchenConfirmToken } from "../../lib/kitchen-confirm-token"
import { signVerifyEmailToken, verifyVerifyEmailToken } from "../../lib/email-verify-token"
import { brandEmailWrapper, brandButton } from "../../lib/brand-email"
import { hashPassword } from "../auth/auth.service"

const volunteerSignupSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre completo").max(120),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido"),
  phone: z.string().trim().min(6, "Ingresá un teléfono válido").max(30).optional(),
  message: z.string().trim().max(500).optional(),
})

const registerSchema = z.object({
  name: z.string().trim().min(2, "Ingresá tu nombre completo").max(120),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
  phone: z.string().trim().min(6, "Ingresá un teléfono válido").max(30),
})

// ── Rate limit en memoria: factory para que cada endpoint público tenga su
// propio contador de intentos por IP (ver comentario de arriba). ──
function createRateLimiter(windowMs: number, max: number) {
  const attempts = new Map<string, { count: number; resetAt: number }>()

  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of attempts) {
      if (now > entry.resetAt) attempts.delete(ip)
    }
  }, windowMs).unref()

  return function checkRateLimit(ip: string): boolean {
    const now = Date.now()
    const entry = attempts.get(ip)
    if (!entry || now > entry.resetAt) {
      attempts.set(ip, { count: 1, resetAt: now + windowMs })
      return true
    }
    if (entry.count >= max) return false
    entry.count += 1
    return true
  }
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX = 5
const checkVolunteerSignupRateLimit = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)
const checkRegisterRateLimit = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX)

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

/** Manda (o reenvía) el mail de verificación de Fase Q. Separado en función
 * porque se usa tanto en el alta nueva como en el reintento de alguien que
 * ya se había registrado pero nunca tocó el link. */
async function sendVerificationEmail(userId: string, name: string, email: string) {
  const token = signVerifyEmailToken(userId)
  const link = `${env.PUBLIC_API_URL}/api/public/verify-email?token=${token}`
  await sendEmail({
    to: email,
    subject: "Confirmá tu email — Vida Solidaria MDP",
    html: brandEmailWrapper(
      `<h2 style="margin:0 0 12px; font-size:19px;">¡Hola, ${name.split(" ")[0]}!</h2>
       <p style="margin:0 0 8px; font-size:15px; line-height:1.5;">
         Gracias por registrarte en el sistema de gestión de <strong>Vida Solidaria Mar del Plata</strong>.
         Confirmá tu email para que la comisión pueda revisar tu alta.
       </p>
       ${brandButton("Confirmar mi email", link)}
       <p style="font-size:13px; color:#2A1030; opacity:0.6; margin:16px 0 0;">
         Si no pediste este registro, ignorá este mensaje.
       </p>`,
      "Confirmá tu email para completar tu registro",
    ),
  })
}

export async function publicRoutes(app: FastifyInstance) {
  app.post("/public/volunteer-signup", async (request, reply) => {
    if (!checkVolunteerSignupRateLimit(request.ip)) {
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

  // ── Fase Q: autorregistro desde /login, con contraseña elegida por la
  // persona y verificación de email obligatoria ANTES de entrar a la cola
  // de aprobación de la comisión (ver /public/verify-email). ──
  app.post("/public/register", async (request, reply) => {
    if (!checkRegisterRateLimit(request.ip)) {
      return reply.code(429).send({ error: "Demasiados intentos. Probá de nuevo en un rato." })
    }

    const body = registerSchema.parse(request.body)
    const existing = await prisma.user.findUnique({ where: { email: body.email } })

    if (existing) {
      // Reintento de alguien que ya se había registrado pero nunca tocó el
      // link de verificación (se le perdió el mail, se equivocó de
      // contraseña, etc.) — actualiza sus datos y reenvía el mail en vez de
      // dejarlo trabado con un 409 sin salida.
      if (existing.status === "pending" && !existing.emailVerifiedAt) {
        const passwordHash = await hashPassword(body.password)
        await prisma.user.update({
          where: { id: existing.id },
          data: { name: body.name, phone: body.phone, passwordHash },
        })
        await sendVerificationEmail(existing.id, body.name, existing.email)
        return reply.code(201).send({ ok: true })
      }

      return reply.code(409).send({
        error: "Ya existe una cuenta con ese email. Si es tuya, iniciá sesión o pedí ayuda a la comisión.",
      })
    }

    const passwordHash = await hashPassword(body.password)
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        passwordHash,
        status: "pending",
      },
    })

    await sendVerificationEmail(user.id, user.name, user.email)

    return reply.code(201).send({ ok: true })
  })

  // ── Fase Q: link de verificación de email — sin sesión (quien lo toca
  // recién se está registrando, todavía no puede loguearse). Idempotente:
  // si ya estaba verificado, solo muestra la pantalla de nuevo sin volver a
  // avisar a la comisión. Recién acá (no antes) el registro entra a la cola
  // de aprobación — ver filtro en el panel de Usuarios. ──
  app.get("/public/verify-email", async (request, reply) => {
    const query = z.object({ token: z.string().min(1) }).safeParse(request.query)
    if (!query.success) {
      return reply.code(400).type("text/html").send(brandStandalonePage("Link inválido", "Este link no es válido."))
    }

    const decoded = verifyVerifyEmailToken(query.data.token)
    if (!decoded) {
      return reply
        .code(400)
        .type("text/html")
        .send(
          brandStandalonePage(
            "Link vencido",
            "Este link ya venció. Volvé a /login y registrate de nuevo para recibir uno nuevo.",
          ),
        )
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } })
    if (!user) {
      return reply.code(404).type("text/html").send(brandStandalonePage("No encontrado", "No encontramos tu usuario."))
    }

    if (!user.emailVerifiedAt) {
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })

      const approvers = await usersWithPermission("users.manage")
      await notify(
        approvers.map((a) => a.id),
        {
          title: "Nuevo registro esperando aprobación",
          body: `${user.name} (${user.email}) confirmó su email y espera aprobación.`,
          link: "/administracion",
          type: "volunteer_pending",
          email: {
            subject: "Nuevo registro esperando aprobación",
            html: `<p><strong>${user.name}</strong> (${user.email}${
              user.phone ? `, ${user.phone}` : ""
            }) confirmó su email desde /login y espera aprobación.</p><p>Revisalo en /administracion → Usuarios.</p>`,
          },
        },
      )
    }

    return reply
      .type("text/html")
      .send(
        brandStandalonePage(
          `¡Listo, ${user.name.split(" ")[0]}!`,
          "Confirmamos tu email. La comisión va a revisar tu registro y te va a avisar por mail apenas esté aprobado.",
        ),
      )
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

  // Fase R: link de un solo toque del mail "te sumamos a cocinar" — sin
  // sesión, mismo criterio que el resto de estos links. Idempotente: si ya
  // estaba confirmado, muestra el mismo agradecimiento sin pisar la fecha
  // original de confirmedAt.
  app.get("/public/kitchen-batches/confirm", async (request, reply) => {
    const query = z.object({ token: z.string().min(1) }).safeParse(request.query)
    if (!query.success) {
      return reply.code(400).type("text/html").send(brandStandalonePage("Link inválido", "Este link no es válido."))
    }

    const decoded = verifyKitchenConfirmToken(query.data.token)
    if (!decoded) {
      return reply
        .code(400)
        .type("text/html")
        .send(
          brandStandalonePage(
            "Link vencido",
            "Este link ya venció. Entrá a la app y confirmá desde tu lote de cocina en Equipos.",
          ),
        )
    }

    const assignee = await prisma.kitchenBatchAssignee.findUnique({
      where: { batchId_userId: { batchId: decoded.batchId, userId: decoded.userId } },
    })
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, name: true } })
    if (!assignee || !user) {
      return reply
        .code(404)
        .type("text/html")
        .send(brandStandalonePage("No encontrado", "No encontramos esa asignación de cocina."))
    }

    if (!assignee.confirmedAt) {
      await prisma.kitchenBatchAssignee.update({
        where: { batchId_userId: { batchId: decoded.batchId, userId: decoded.userId } },
        data: { confirmedAt: new Date() },
      })
    }

    return reply
      .type("text/html")
      .send(
        brandStandalonePage(
          `¡Gracias por ayudarnos, ${user.name.split(" ")[0]}!`,
          "Quedaste confirmado/a para cocinar. ¡Buena cocina! 🍲💜",
        ),
      )
  })
}
