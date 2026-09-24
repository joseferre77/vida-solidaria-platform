/**
 * Fase P: token firmado para el link de "Confirmar asistencia" que va en
 * el email y en los botones de acción del push ("Puedo" / "No puedo").
 * A propósito NO requiere que la persona esté logueada al tocarlo — un
 * voluntario puede recibir el mail en el celular sin sesión abierta en el
 * navegador, y forzarlo a loguearse antes de poder confirmar es fricción
 * que hace que nadie lo use. El token prueba identidad+semana; reusa
 * JWT_ACCESS_SECRET (ya existe, no suma una variable de entorno más) pero
 * con su propio `purpose` para que no se confunda con un access token real
 * ni sirva para autenticarse en ningún otro endpoint.
 */
import jwt from "jsonwebtoken"
import { env } from "../config/env"

interface WeeklyConfirmTokenPayload {
  purpose: "weekly_confirm"
  userId: string
  weekStartDate: string // YYYY-MM-DD
}

/** Vence a los 9 días — sobra para cubrir una semana entera aunque el mail
 * llegue tarde o la persona lo abra varios días después. */
export function signWeeklyConfirmToken(userId: string, weekStartDate: string): string {
  const payload: WeeklyConfirmTokenPayload = { purpose: "weekly_confirm", userId, weekStartDate }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "9d" })
}

export function verifyWeeklyConfirmToken(token: string): { userId: string; weekStartDate: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as WeeklyConfirmTokenPayload
    if (decoded.purpose !== "weekly_confirm" || !decoded.userId || !decoded.weekStartDate) return null
    return { userId: decoded.userId, weekStartDate: decoded.weekStartDate }
  } catch {
    return null
  }
}
