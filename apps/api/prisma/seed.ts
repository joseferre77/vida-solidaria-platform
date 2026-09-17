/**
 * Seed inicial: catálogo de roles/permisos + usuario Admin General maestro.
 *
 * Cómo generar el admin (elegí una opción):
 *
 *  A) Automático y seguro (recomendado): dejá ADMIN_PASSWORD sin definir en
 *     tu .env. Este script genera una contraseña aleatoria fuerte y la
 *     imprime UNA sola vez en la terminal al correr `pnpm prisma:seed`.
 *     Copiala en ese momento (un gestor de contraseñas) — no queda guardada
 *     en ningún archivo del repo.
 *
 *  B) Manual: definí ADMIN_EMAIL, ADMIN_NAME y ADMIN_PASSWORD en tu .env
 *     antes de correr el seed, y usá esa contraseña.
 *
 * En cualquier caso: cambiá la contraseña desde el panel una vez que entres
 * la primera vez, y nunca commitees el .env con estos valores.
 */
import "dotenv/config"
import crypto from "node:crypto"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import {
  GLOBAL_ROLES,
  ROLE_LABELS,
  ROLE_RANK,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "../src/modules/rbac/permissions"

const prisma = new PrismaClient()

function generateSecurePassword(length = 18) {
  // Alfabeto sin caracteres ambiguos (0/O, 1/l/I) para que sea legible si
  // hay que transcribirla a mano.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%*"
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")
}

async function main() {
  console.log("🌱 Sembrando roles y permisos...")

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
    const role = await prisma.role.findUniqueOrThrow({ where: { slug: roleSlug } })
    for (const permSlug of permissionSlugs) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { slug: permSlug } })
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
    }
  }

  console.log(`✅ ${GLOBAL_ROLES.length} roles y ${PERMISSIONS.length} permisos listos.`)

  // ── Usuario Admin General maestro ──
  const adminEmail = process.env.ADMIN_EMAIL
  const adminName = process.env.ADMIN_NAME ?? "Admin"

  if (!adminEmail) {
    console.log("\n⚠️  ADMIN_EMAIL no está definido en .env — no se creó ningún usuario admin.")
    console.log("   Definí ADMIN_EMAIL (y opcionalmente ADMIN_NAME/ADMIN_PASSWORD) y volvé a correr el seed.\n")
    return
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } })
  if (existing) {
    console.log(`\nℹ️  Ya existe un usuario con ${adminEmail} — no se pisa la contraseña. Nada que hacer.\n`)
    return
  }

  const plainPassword = process.env.ADMIN_PASSWORD ?? generateSecurePassword()
  const passwordHash = await bcrypt.hash(plainPassword, 12)

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: "admin_general" } })

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      status: "active",
      roles: { create: [{ roleId: adminRole.id }] },
    },
  })

  console.log("\n=========================================================")
  console.log("  USUARIO MAESTRO ADMIN CREADO")
  console.log("  =========================================================")
  console.log(`  Email:    ${admin.email}`)
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`  Password: ${plainPassword}   (generada automáticamente)`)
    console.log("  ⚠️  Copiala AHORA a un gestor de contraseñas. No se vuelve a mostrar")
    console.log("     ni queda guardada en ningún archivo — solo el hash queda en la DB.")
  } else {
    console.log("  Password: la que definiste en ADMIN_PASSWORD (.env)")
  }
  console.log("  Rol:      Admin General (acceso total)")
  console.log("  =========================================================\n")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
