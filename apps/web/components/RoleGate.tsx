"use client"

import type { SessionUser } from "../lib/auth"
import { hasPermission } from "../lib/auth"

/** Muestra `children` solo si el usuario tiene el permiso indicado. */
export function RoleGate({
  user,
  permission,
  children,
}: {
  user: SessionUser | null
  permission: string
  children: React.ReactNode
}) {
  if (!hasPermission(user, permission)) return null
  return <>{children}</>
}
