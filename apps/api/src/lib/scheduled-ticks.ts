/**
 * Fase L: dos "avisos programados" que antes no disparaban nada — el
 * bug que reportó Josecito ("los avisos programados no estan funcionando").
 *
 * 1) Recordatorios (`Reminder`, proyectos/tareas): el modelo y el CRUD ya
 *    existían (incluso el campo `notifiedAt`), pero nada leía `remindAt`
 *    para efectivamente avisar — se creaban y quedaban ahí para siempre.
 * 2) Confirmación semanal de asistencia (`WeeklyAvailability`): existía la
 *    carga de intención del voluntario, pero nadie le avisaba que tenía que
 *    cargarla. Josecito eligió que se dispare los viernes (podía ser sábado
 *    también, decisión tomada acá: viernes le da el fin de semana entero
 *    para coordinar equipos antes del domingo).
 *
 * Fase P (24/09/2026): dos mejoras sobre el punto 2, pedidas por Josecito —
 *  a) el día ya no está fijo en viernes: se lee de `app_settings` (ver
 *     lib/settings.ts), editable desde /administracion → Configuración.
 *  b) el aviso ahora manda también EMAIL con botón de confirmar (antes solo
 *     mandaba push + notificación en el sistema) y el push suma botones de
 *     acción "Puedo" / "No puedo" que confirman sin abrir la app (ver
 *     lib/confirm-token.ts, lib/brand-email.ts, apps/web/app/sw.ts).
 *  c) se suma un tercer tick: el domingo a las 14hs, resumen automático a
 *     TODOS los usuarios activos con la lista de quienes confirmaron que
 *     venían — mismo criterio de "sin infra nueva" que los otros dos.
 *
 * Mismo patrón que la limpieza de rate-limit en public.routes.ts:
 * `setInterval(...).unref()` dentro del propio proceso — nada de infra
 * nueva (cron del sistema, cola de jobs) para no sumar procesos/servicios
 * a una cuenta de hosting compartido que ya pegó una vez contra el límite
 * de procesos (LVE) este mismo día. `.unref()` para que este timer no
 * mantenga vivo el proceso por sí solo.
 */
import { prisma } from "./prisma"
import { notify } from "./notify"
import { getWeeklyReminderDay } from "./settings"
import { signWeeklyConfirmToken } from "./confirm-token"
import { brandEmailWrapper, brandButton } from "./brand-email"
import { env } from "../config/env"

const TICK_INTERVAL_MS = 5 * 60 * 1000 // cada 5 minutos alcanza y sobra para algo con granularidad de minutos

/** Recordatorios vencidos (remindAt <= ahora) que todavía no se avisaron. */
async function tickReminders() {
  const due = await prisma.reminder.findMany({
    where: { isDone: false, notifiedAt: null, remindAt: { lte: new Date() } },
    take: 200, // cota defensiva — en uso normal esto va a ser un puñado por tick
  })
  if (due.length === 0) return

  for (const reminder of due) {
    await notify([reminder.createdBy], {
      title: "Recordatorio",
      body: reminder.title,
      link: reminder.entity === "PROJECT" ? `/proyectos/${reminder.entityId}` : undefined,
      type: "reminder_due",
    })
    await prisma.reminder.update({ where: { id: reminder.id }, data: { notifiedAt: new Date() } })
  }
}

function nowInBuenosAires() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
}

/** Domingo (0) siguiente a `from`, a las 00:00 — usado como clave de "semana". */
function nextSundayKey(from: Date) {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  const diff = (7 - d.getDay()) % 7
  d.setDate(d.getDate() + (diff === 0 ? 0 : diff))
  return d.toISOString().slice(0, 10)
}

function confirmUrl(token: string, attend: "yes" | "no") {
  return `${env.PUBLIC_API_URL}/api/public/weekly-availability/confirm?token=${token}&attend=${attend}`
}

function formatSundayLabel(sundayKey: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${sundayKey}T00:00:00.000Z`),
  )
}

/**
 * En el día configurado (`getWeeklyReminderDay()`, viernes por defecto),
 * a cualquier usuario activo que TODAVÍA no cargó su intención
 * (WeeklyAvailability) para el domingo que viene, se le manda push +
 * email + notificación en el sistema. Idempotente por semana: usa
 * `Notification.type` + un `link` con la fecha del domingo como marca
 * para no reenviar dos veces el mismo día si el proceso reinicia.
 */
async function tickWeeklyAvailabilityPrompt() {
  const nowAR = nowInBuenosAires()
  const reminderDay = await getWeeklyReminderDay()
  if (nowAR.getDay() !== reminderDay) return

  const sundayKey = nextSundayKey(nowAR)
  const marker = `/presentismo?semana=${sundayKey}`

  const alreadySent = await prisma.notification.findFirst({
    where: { type: "weekly_availability_prompt", link: marker },
  })
  if (alreadySent) return

  const activeUsers = await prisma.user.findMany({ where: { status: "active" }, select: { id: true, name: true } })
  const alreadyResponded = await prisma.weeklyAvailability.findMany({
    where: { weekStartDate: new Date(sundayKey) },
    select: { userId: true },
  })
  const respondedIds = new Set(alreadyResponded.map((r) => r.userId))
  const targets = activeUsers.filter((u) => !respondedIds.has(u.id))
  if (targets.length === 0) return

  const sundayLabel = formatSundayLabel(sundayKey)

  // Un email (y un par de links push) por persona porque el token de
  // confirmación identifica a quién le pertenece — no se puede mandar el
  // mismo link a todo el mundo.
  for (const user of targets) {
    const token = signWeeklyConfirmToken(user.id, sundayKey)
    const yesUrl = confirmUrl(token, "yes")
    const noUrl = confirmUrl(token, "no")

    await notify([user.id], {
      title: "¿Venís este domingo?",
      body: "Confirmá tu asistencia para el próximo domingo — tocá \"Puedo\" o \"No puedo\".",
      link: marker,
      type: "weekly_availability_prompt",
      pushActions: [
        { action: "can_attend", title: "Puedo", url: yesUrl },
        { action: "cannot_attend", title: "No puedo", url: noUrl },
      ],
      email: {
        subject: `¿Venís el domingo ${sundayLabel}? — Vida Solidaria`,
        html: brandEmailWrapper(
          `
            <h2 style="margin:0 0 12px; font-size:20px;">¡Hola, ${user.name.split(" ")[0]}!</h2>
            <p style="margin:0 0 8px; font-size:15px; line-height:1.5;">
              Este domingo ${sundayLabel} tenemos encuentro solidario y queremos saber si contamos con vos.
            </p>
            <p style="margin:0 0 4px; font-size:15px; line-height:1.5;">¿Podés venir?</p>
            ${brandButton("✅ Sí, voy", yesUrl)}
            <p style="margin:16px 0 0; font-size:13px;">
              <a href="${noUrl}" style="color:#73038C;">No puedo ir esta vez</a>
            </p>
          `,
          `¿Venís el domingo ${sundayLabel}?`,
        ),
      },
    })
  }
}

/**
 * Domingo a las 14hs (hora AR): a TODOS los usuarios activos, un resumen
 * con la lista de quienes confirmaron que venían hoy (WeeklyAvailability
 * .willAttend = true para la fecha de hoy). Idempotente igual que el tick
 * anterior — una `Notification` marcadora por domingo.
 */
async function tickSundayDigest() {
  const nowAR = nowInBuenosAires()
  if (nowAR.getDay() !== 0 || nowAR.getHours() !== 14) return

  const todayKey = nowAR.toISOString().slice(0, 10)
  const marker = `/presentismo?resumen=${todayKey}`

  const alreadySent = await prisma.notification.findFirst({
    where: { type: "sunday_digest_sent", link: marker },
  })
  if (alreadySent) return

  const confirmed = await prisma.weeklyAvailability.findMany({
    where: { weekStartDate: new Date(todayKey), willAttend: true },
    select: { userId: true },
  })
  const confirmedUsers =
    confirmed.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: confirmed.map((c) => c.userId) } },
          select: { name: true, avatarUrl: true },
          orderBy: { name: "asc" },
        })

  const activeUsers = await prisma.user.findMany({ where: { status: "active" }, select: { id: true } })
  if (activeUsers.length === 0) return

  const todayLabel = formatSundayLabel(todayKey)
  const count = confirmedUsers.length

  const listHtml =
    count === 0
      ? `<p style="margin:0; font-size:15px;">Todavía nadie confirmó para hoy — ¡pero puede que se sumen durante el día!</p>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
          ${confirmedUsers
            .map(
              (u) => `
            <tr>
              <td style="padding:6px 0; font-size:15px;">
                ${
                  u.avatarUrl
                    ? `<img src="${u.avatarUrl}" alt="" width="28" height="28" style="width:28px; height:28px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:10px;" />`
                    : `<span style="display:inline-block; width:28px; height:28px; line-height:28px; text-align:center; border-radius:50%; background:#F7F4F8; margin-right:10px; vertical-align:middle;">🙋</span>`
                }
                <span style="vertical-align:middle;">${u.name}</span>
              </td>
            </tr>`,
            )
            .join("")}
        </table>`

  // Solo email + notificación en el sistema para el resumen (a diferencia
  // del aviso de los viernes, acá no hay nada que "confirmar" — es
  // informativo, así que no suma botones de acción al push).
  await notify(
    activeUsers.map((u) => u.id),
    {
      title: `Domingo ${todayLabel}: ${count} confirmados`,
      body: count === 0 ? "Todavía nadie confirmó para hoy." : `${count} persona${count === 1 ? "" : "s"} confirmaron que vienen.`,
      link: marker,
      type: "sunday_digest_sent",
      email: {
        subject: `🙌 ${count} confirmados para hoy, domingo ${todayLabel}`,
        html: brandEmailWrapper(
          `
            <h2 style="margin:0 0 4px; font-size:20px;">¡Encuentro de hoy! 💜</h2>
            <p style="margin:0 0 16px; font-size:15px; line-height:1.5;">
              Domingo ${todayLabel} — ${count} persona${count === 1 ? "" : "s"} confirmaron que vienen:
            </p>
            ${listHtml}
          `,
          `${count} confirmados para el encuentro de hoy`,
        ),
      },
    },
  )
}

export function startScheduledTicks() {
  const tick = async () => {
    try {
      await tickReminders()
    } catch (err) {
      console.error("[scheduled-ticks] tickReminders falló:", err)
    }
    try {
      await tickWeeklyAvailabilityPrompt()
    } catch (err) {
      console.error("[scheduled-ticks] tickWeeklyAvailabilityPrompt falló:", err)
    }
    try {
      await tickSundayDigest()
    } catch (err) {
      console.error("[scheduled-ticks] tickSundayDigest falló:", err)
    }
  }
  void tick() // corre una vez al arrancar, no solo a los 5 minutos
  setInterval(tick, TICK_INTERVAL_MS).unref()
}
