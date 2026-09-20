"use client"

import { useEffect, useState } from "react"
import {
  createUser,
  listRoles,
  listUsers,
  updateUser,
  updateUserRoles,
  type RoleItem,
  type UserItem,
} from "../../../lib/users"

const STATUS_LABEL: Record<string, string> = { active: "Activo", suspended: "Suspendido" }

/**
 * Fase H — panel de administración de personas. Hasta ahora la única forma
 * de crear un usuario era a mano vía `prisma/seed.ts` (un solo admin en
 * toda la base). Esta pantalla es la primera vía real para dar de alta
 * voluntarios/coordinadores y asignarles un rol, sin tocar la base de
 * datos directamente.
 */
export function Usuarios({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<UserItem[] | null>(null)
  const [roles, setRoles] = useState<RoleItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingRolesFor, setEditingRolesFor] = useState<UserItem | null>(null)
  const [lastGeneratedPassword, setLastGeneratedPassword] = useState<{ email: string; password: string } | null>(
    null,
  )

  function refresh() {
    listUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
  }

  useEffect(() => {
    refresh()
    listRoles()
      .then(setRoles)
      .catch((e) => setError(e.message))
  }, [])

  if (!users || !roles) return <p className="text-cream/50">Cargando...</p>

  return (
    <div className="max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-cream/50">
          {users.length} {users.length === 1 ? "persona registrada" : "personas registradas"}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
        >
          + Nuevo usuario
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-orange">{error}</p>}

      {lastGeneratedPassword && (
        <div className="mb-4 rounded-xl border border-yellow/40 bg-yellow/10 p-4 text-sm text-cream">
          <p className="font-semibold text-yellow">
            Usuario creado — contraseña generada para {lastGeneratedPassword.email}:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-lg bg-black/30 px-3 py-1.5 font-mono text-yellow">
              {lastGeneratedPassword.password}
            </code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(lastGeneratedPassword.password)
              }}
              className="rounded-lg border border-white/20 px-2 py-1 text-xs hover:bg-white/5"
            >
              Copiar
            </button>
            <button onClick={() => setLastGeneratedPassword(null)} className="ml-auto text-cream/40 hover:text-cream">
              ✕
            </button>
          </div>
          <p className="mt-2 text-xs text-cream/60">
            Compartila con la persona ahora — no se vuelve a mostrar. Puede cambiarla después desde su perfil.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/15 bg-white/5">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-cream/50">
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5">
                <td className="px-4 py-3 text-cream">
                  {u.name}
                  {u.id === currentUserId && <span className="ml-1.5 text-[11px] text-cream/40">(vos)</span>}
                </td>
                <td className="px-4 py-3 text-cream/70">{u.email}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span
                        key={r.slug}
                        className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-cream/80"
                      >
                        {r.label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => {
                      if (u.id === currentUserId && u.status === "active") {
                        setError("No podés suspender tu propio usuario")
                        return
                      }
                      updateUser(u.id, { status: u.status === "active" ? "suspended" : "active" })
                        .then(refresh)
                        .catch((e) => setError(e.message))
                    }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      u.status === "active" ? "bg-green-500/20 text-green-300" : "bg-orange/20 text-orange"
                    }`}
                  >
                    {STATUS_LABEL[u.status]}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => setEditingRolesFor(u)} className="text-xs text-yellow hover:underline">
                    Editar roles
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cream/50">
                  Todavía no hay usuarios registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NewUserModal
          roles={roles}
          onClose={() => setShowForm(false)}
          onCreated={(user, generatedPassword) => {
            setShowForm(false)
            if (generatedPassword) setLastGeneratedPassword({ email: user.email, password: generatedPassword })
            refresh()
          }}
        />
      )}

      {editingRolesFor && (
        <EditRolesModal
          user={editingRolesFor}
          roles={roles}
          onClose={() => setEditingRolesFor(null)}
          onSaved={() => {
            setEditingRolesFor(null)
            refresh()
          }}
          onError={setError}
        />
      )}
    </div>
  )
}

function RoleCheckboxList({
  roles,
  selected,
  onToggle,
}: {
  roles: RoleItem[]
  selected: Set<string>
  onToggle: (slug: string) => void
}) {
  return (
    <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-3">
      {roles.map((r) => (
        <label key={r.slug} className="flex items-center gap-2 text-sm text-cream/90">
          <input type="checkbox" checked={selected.has(r.slug)} onChange={() => onToggle(r.slug)} />
          {r.label}
        </label>
      ))}
    </div>
  )
}

function NewUserModal({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleItem[]
  onClose: () => void
  onCreated: (user: UserItem, generatedPassword?: string) => void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleRole(slug: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !email.trim() || selectedRoles.size === 0) return
          setSaving(true)
          setError(null)
          try {
            const { user, generatedPassword } = await createUser({
              name: name.trim(),
              email: email.trim(),
              phone: phone.trim() || undefined,
              roleSlugs: Array.from(selectedRoles),
              password: password.trim() || undefined,
            })
            onCreated(user, generatedPassword)
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear el usuario")
          } finally {
            setSaving(false)
          }
        }}
        className="w-full max-w-md rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-4 font-display text-lg font-bold text-yellow">Nuevo usuario</h2>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Nombre y apellido *</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Email *</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Teléfono (opcional)</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-cream/70">Contraseña (opcional — si la dejás vacía, se genera una)</span>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Se genera automáticamente"
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <div className="mb-4">
          <span className="mb-1 block text-sm text-cream/70">Roles *</span>
          <RoleCheckboxList roles={roles} selected={selectedRoles} onToggle={toggleRole} />
        </div>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || selectedRoles.size === 0}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Creando..." : "Crear usuario"}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditRolesModal({
  user,
  roles,
  onClose,
  onSaved,
  onError,
}: {
  user: UserItem
  roles: RoleItem[]
  onClose: () => void
  onSaved: () => void
  onError: (e: string) => void
}) {
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set(user.roles.map((r) => r.slug)))
  const [saving, setSaving] = useState(false)

  function toggleRole(slug: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-purple-deep p-6">
        <h2 className="mb-1 font-display text-lg font-bold text-yellow">Roles de {user.name}</h2>
        <p className="mb-4 text-xs text-cream/50">{user.email}</p>

        <RoleCheckboxList roles={roles} selected={selectedRoles} onToggle={toggleRole} />

        <div className="mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            disabled={saving || selectedRoles.size === 0}
            onClick={async () => {
              setSaving(true)
              try {
                await updateUserRoles(user.id, Array.from(selectedRoles))
                onSaved()
              } catch (err: any) {
                onError(err.message ?? "No se pudieron guardar los roles")
              } finally {
                setSaving(false)
              }
            }}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  )
}
