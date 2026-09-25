/**
 * Fase K: notificaciones — la parte "en el sistema" (campanita en la barra
 * superior, `Notification` en la base) y, opcionalmente, el email que la
 * acompaña (vía `sendEmail`, ver `lib/email.ts`). Pensado para reusarse en
 * cualquier alerta futura (stock bajo, asignación/cierre de casos, etc.),
 * no solo stock — por eso vive en `lib/`, no en `modules/logistics/`.
 */
import { prisma } from "./prisma"
import { sendEmail } from "./email"
import { sendPushToUser } from "./push"

/**
 * Usuarios activos cuyo rol tiene el permiso dado (ej. "logistics.write").
 *
 * OJO con `admin_general`: ese rol resuelve a acceso total ("*") en
 * `auth.service.ts` → `flattenRolesAndPermissions` de forma explícita en el
 * middleware, NO porque tenga filas en `RolePermission` (de hecho tiene
 * cero — se comprobó en producción al debuggear por qué el aviso de "nuevo
 * voluntario pendiente" no le llegaba a nadie). Si acá solo mirábamos la
 * tabla `RolePermission`, un admin_general nunca aparecía en ningún
 * `usersWithPermission(...)` — se quedaba afuera de CUALQUIER notificación
 * (esta, la de stock bajo, las que vengan). Por eso se lo suma siempre,
 * como caso aparte, igual que en el middleware de auth.
 */
export async function usersWithPermission(slug: string) {
  return prisma.user.findMany({
    where: {
      status: "active",
      roles: {
        some: {
          role: {
            OR: [{ slug: "admin_general" }, { permissions: { some: { permission: { slug } } } }],
          },
        },
      },
    },
    select: { id: true, name: true, email: true },
  })
}

/**
 * Fase R: usuarios activos que tienen alguno de los roles indicados (por
 * slug) — a diferencia de `usersWithPermission`, esto es para cuando la
 * lista de destinatarios se define por ROL puntual (ej. "Dirección
 * General" para el aviso de donación nueva) y no por permiso, porque el
 * permiso más cercano (`logistics.read`) también lo tienen otros roles que
 * acá no deberían recibir el aviso (ver notas de Josecito, 25/09/2026).
 */
export async function usersWithRoles(slugs: string[]) {
  return prisma.user.findMany({
    where: {
      status: "active",
      roles: { some: { role: { slug: { in: slugs } } } },
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
  // Fase P: botones de acción del push (ver lib/push.ts) — opcional, la
  // gran mayoría de notificaciones no los necesita.
  pushActions?: { action: string; title: string; url: string }[]
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

  await Promise.all(
    uniqueIds.map((userId) =>
      sendPushToUser(userId, { title: data.title, body: data.body, link: data.link, actions: data.pushActions }),
    ),
  )

  if (data.email) {
    const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } }, select: { email: true } })
    await Promise.all(users.map((u) => sendEmail({ to: u.email, subject: data.email!.subject, html: data.email!.html })))
  }
}
