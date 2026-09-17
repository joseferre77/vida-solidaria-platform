import type { FastifyInstance } from "fastify"
import passport from "passport"
import { Strategy as GoogleStrategy } from "passport-google-oauth20"
import { prisma } from "../../lib/prisma"
import { env } from "../../config/env"

type IssueSession = (
  reply: any,
  userId: string,
  meta: { userAgent?: string; ip?: string }
) => Promise<unknown>

/**
 * Google OAuth solo permite iniciar sesión a usuarios YA existentes en el
 * sistema (creados por un admin con rol asignado) y cuyo email de Google
 * coincide. No crea cuentas nuevas por sí solo — mismo criterio que el login
 * nativo: el alta la hace un admin, no un flujo público. Si el email no
 * existe, se corta con un mensaje claro en vez de crear un usuario "flotante"
 * sin rol.
 */
export async function registerGoogleOAuth(app: FastifyInstance, issueSession: IssueSession) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        callbackURL: env.GOOGLE_CALLBACK_URL ?? "/api/auth/google/callback",
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value
          if (!email) return done(new Error("La cuenta de Google no tiene email público"), undefined)

          const user = await prisma.user.findUnique({ where: { email } })
          if (!user || user.status !== "active") {
            return done(null, false, { message: "No existe una cuenta activa con ese email. Pedile a un admin que te dé de alta primero." })
          }

          if (!user.googleId) {
            await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.id } })
          }

          return done(null, user)
        } catch (err) {
          return done(err as Error, undefined)
        }
      }
    )
  )

  app.register(async function googleRoutes(instance) {
    instance.get("/auth/google", async (request, reply) => {
      // Delega en passport vía un pequeño puente manual (Fastify no usa
      // middleware Express directamente); se resuelve con @fastify/passport
      // al implementar esta ruta en detalle — placeholder de integración.
      return reply.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?client_id=${env.GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
          env.GOOGLE_CALLBACK_URL ?? ""
        )}&response_type=code&scope=email%20profile`
      )
    })

    instance.get("/auth/google/callback", async (request, reply) => {
      // TODO: intercambiar `code` por perfil (passport-google-oauth20 espera
      // Express req/res tal cual; para Fastify se recomienda migrar a
      // `@fastify/passport` o resolver el intercambio de token manualmente
      // con `google-auth-library`). Dejado explícito acá para no fingir una
      // integración completa sin probar contra credenciales reales.
      return reply.code(501).send({
        error: "Callback de Google pendiente de conectar con credenciales reales de un proyecto en Google Cloud Console.",
      })
    })
  })
}
