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
 * Mismo patrón que la limpieza de rate-limit en public.routes.ts:
 * `setInterval(...).unref()` dentro del propio proceso — nada de infra
 * nueva (cron del sistema, cola de jobs) para no sumar procesos/servicios
 * a una cuenta de hosting compartido que ya pegó una vez contra el límite
 * de procesos (LVE) este mismo día. `.unref()` para que este timer no
 * mantenga vivo el proceso por sí solo.
 */
import { prisma } from "./prisma"
import { notify } from "./notify"

const TICK_INTERVAL_MS = 5 * 60 * 1000 // cada 5 minutos alcanza sobra para algo con granularidad de minutos

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

/**
 * Todos los viernes (hora AR), a cualquier usuario activo que TODAVÍA no
 * cargó su intención (WeeklyAvailability) para el domingo que viene, se le
 * manda un aviso. Idempotente por semana: usa `Notification.type` +
 * un `link` con la fecha del domingo como marca para no reenviar dos veces
 * el mismo viernes si el proceso reinicia.
 */
async function tickWeeklyAvailabilityPrompt() {
  const nowAR = nowInBuenosAires()
  if (nowAR.getDay() !== 5) return // 5 = viernes

  const sundayKey = nextSundayKey(nowAR)
  const marker = `/presentismo?semana=${sundayKey}`

  const alreadySent = await prisma.notification.findFirst({
    where: { type: "weekly_availability_prompt", link: marker },
  })
  if (alreadySent) return

  const activeUsers = await prisma.user.findMany({ where: { status: "active" }, select: { id: true } })
  const alreadyResponded = await prisma.weeklyAvailability.findMany({
    where: { weekStartDate: new Date(sundayKey) },
    select: { userId: true },
  })
  const respondedIds = new Set(alreadyResponded.map((r) => r.userId))
  const targetIds = activeUsers.map((u) => u.id).filter((id) => !respondedIds.has(id))
  if (targetIds.length === 0) return

  await notify(targetIds, {
    title: "¿Venís este domingo?",
    body: "Confirmá tu asistencia para el próximo domingo desde Presentismo.",
    link: marker,
    type: "weekly_availability_prompt",
  })
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
  }
  void tick() // corre una vez al arrancar, no solo a los 5 minutos
  setInterval(tick, TICK_INTERVAL_MS).unref()
}
