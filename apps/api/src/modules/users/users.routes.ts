/**
 * Listado básico de usuarios — solo lo necesario para pickers de
 * miembros/responsables en Proyectos (Módulo 2). La gestión completa de
 * usuarios (alta, edición, roles) queda para cuando se aborde el permiso
 * `users.manage` como su propio módulo.
 */
import type { FastifyInstance } from "fastify"
import { prisma } from "../../lib/prisma"
import { requireAuth } from "../../middleware/auth.middleware"

export async function usersRoutes(app: FastifyInstance) {
  app.get("/users/basic", { preHandler: requireAuth }, async () => {
    const users = await prisma.user.findMany({
      where: { status: "active" },
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: "asc" },
    })
    return users
  })
}
