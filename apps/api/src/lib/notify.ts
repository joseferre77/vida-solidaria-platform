/**
 * Fase K: notificaciones — la parte "en el sistema" (campanita en la barra
 * superior, `Notification` en la base) y, opcionalmente, el email que la
 * acompaña (vía `sendEmail`, ver `lib/email.ts`). Pensado para reusarse en
 * cualquier alerta futura (stock bajo, asignación/cierre de casos, etc.),
 * no solo stock — por eso vive en `lib/`, no en `modules/logistics/`.
 */
import { prisma } from "./prisma"
import { sendEmail } from "./email"

/** Usuarios activos cuyo rol tiene el permiso dado (ej. "logistics.write"). */
export async function usersWithPermission(slug: string) {
  return prisma.user.findMany({
    where: {
      status: "active",
      roles: { some: { role: { permissions: { some: { permission: { slug } } } } } },
    },
    select: { id: true, name: true, email: true },
  })
}

interface NotifyInput {
  title: string
  body?: string
  link?: string
  type?: string
  email?: { subject: string; html: string }
}

/** Crea la notificación "en el sistema" para cada usuario y, si se pasa
 * `email`, además dispara el mail (que se omite solo, sin romper nada, si
 * no hay `RESEND_API_KEY` configurada — ver `lib/email.ts`). */
export async function notify(userIds: string[], data: NotifyInput) {
  const uniqueIds = Array.from(new Set(userIds))
  if (uniqueIds.length === 0) return

  await prisma.notification.createMany({
    data: uniqueIds.map((userId) => ({
      userId,
      title: data.title,
      body: data.body ?? null,
      link: data.link ?? null,
      type: data.type ?? null,
    })),
  })

  if (data.email) {
    const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { email: true } })
    await Promise.all(users.map((u) => sendEmail({ to: u.email, subject: data.email!.subject, html: data.email!.html })))
  }
}
