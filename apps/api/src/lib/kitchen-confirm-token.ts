/**
 * Fase R: token firmado para el link de "Confirmá que vas a cocinar" que
 * va en el email cuando alguien queda asignado a un lote de cocina
 * (KitchenBatchAssignee). Mismo patrón que confirm-token.ts (Fase P) y
 * email-verify-token.ts (Fase Q): reusa JWT_ACCESS_SECRET con su propio
 * `purpose` para que no sirva como access token real ni se confunda con
 * los otros links de un solo toque. No requiere sesión — la persona puede
 * tocarlo directo desde el mail en el celular.
 */
import jwt from "jsonwebtoken"
import { env } from "../config/env"

interface KitchenConfirmTokenPayload {
  purpose: "kitchen_confirm"
  batchId: string
  userId: string
}

/** Vence a los 14 días — de sobra para cubrir el lapso entre que se arma
 * el lote y el finde en cuestión. Confirmar tarde no rompe nada (no hay
 * lógica que dependa de que haya pasado antes de una fecha límite). */
export function signKitchenConfirmToken(batchId: string, userId: string): string {
  const payload: KitchenConfirmTokenPayload = { purpose: "kitchen_confirm", batchId, userId }
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "14d" })
}

export function verifyKitchenConfirmToken(token: string): { batchId: string; userId: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as KitchenConfirmTokenPayload
    if (decoded.purpose !== "kitchen_confirm" || !decoded.batchId || !decoded.userId) return null
    return { batchId: decoded.batchId, userId: decoded.userId }
  } catch {
    return null
  }
}
