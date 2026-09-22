/**
 * Siembra el catálogo de roles/permisos (roles, permissions,
 * role_permissions) al bootear el proceso, con la MISMA conexión que ya
 * usa `ensure-migrations.ts` — por el mismo motivo documentado ahí: un
 * proceso node suelto lanzado por SSH (`prisma/seed.ts` vía tsx, o un
 * script suelto con @prisma/client) panickea con "PANIC: timer has gone
 * away" en este hosting, mientras que el proceso real de la app nunca
 * tuvo ese problema. En vez de instalar tsx en el servidor solo para
 * correr el seed cada vez que se agrega un permiso nuevo, esta función
 * hace el mismo upsert acá, en cada boot — es barato (unas pocas filas)
 * e idempotente, así que no importa que corra siempre.
 *
 * Fase M (23/09/2026): se agregó al agregar el permiso "coordination.chat"
 * — el primer permiso nuevo desde que existe esta nota. No siembra
 * usuarios (eso lo sigue haciendo prisma/seed.ts a mano, una sola vez,
 * cuando se puede correr con tsx).
 */
import { prisma } from "./prisma"
import { GLOBAL_ROLES, ROLE_LABELS, ROLE_RANK, PERMISSIONS, ROLE_PERMISSIONS } from "../modules/rbac/permissions"

export async function ensurePermissionsSeeded() {
  for (const slug of GLOBAL_ROLES) {
    await prisma.role.upsert({
      where: { slug },
      update: { label: ROLE_LABELS[slug], rank: ROLE_RANK[slug] },
      create: { slug, label: ROLE_LABELS[slug], rank: ROLE_RANK[slug] },
    })
  }

  for (const slug of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { slug },
      update: {},
      create: { slug, label: slug },
    })
  }

  for (const [roleSlug, permissionSlugs] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.findUnique({ where: { slug: roleSlug } })
    if (!role) continue
    for (const permSlug of permissionSlugs) {
      const permission = await prisma.permission.findUnique({ where: { slug: permSlug } })
      if (!permission) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
    }
  }
}
