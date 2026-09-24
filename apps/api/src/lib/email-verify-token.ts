/**
 * Fase Q: token firmado para el link de "Confirmá tu email" que se manda
 * al autorregistrarse desde /login. Mismo patrón que confirm-token.ts
 * (Fase P): reusa JWT_ACCESS_SECRET con su propio `purpose` para que no
 * sirva como access token real ni se confunda con el link de asistencia
 * semanal. No requiere sesión iniciada — la persona lo toca recién creada
 * la cuenta, antes de poder loguearse.
 */
import jwt from "jsonwebtoken"
import { env } from "../config/env"

interface VerifyEmailTokenPayload {
  purpose: "verify_email"
  userId: string
}

/** Vence a los 3 días — un autorregistro que no confirma el mail en ese
 * plazo puede simplemente volver a registrarse (el endpoint de registro
 * reenvía el mail si el usuario ya existe y sigue sin verificar). */
export function signVerifyEmailToken(userId: string): string {
  const payload: VerifyEmailTokenPayload = { purpose: "verify_email", userId }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "3d" })
}

export function verifyVerifyEmailToken(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as VerifyEmailTokenPayload
    if (decoded.purpose !== "verify_email" || !decoded.userId) return null
    return { userId: decoded.userId }
  } catch {
    return null
  }
}
