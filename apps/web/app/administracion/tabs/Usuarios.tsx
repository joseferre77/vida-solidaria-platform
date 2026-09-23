"use client"

import { useEffect, useState } from "react"
import {
  approveUser,
  AVAILABLE_DAYS,
  AVAILABLE_DAY_LABEL,
  createUser,
  deleteUser,
  listRoles,
  listUsers,
  rejectUser,
  updateUser,
  updateUserRoles,
  uploadProfileFile,
  type AvailableDay,
  type ProfileFields,
  type RoleItem,
  type UserItem,
} from "../../../lib/users"

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  suspended: "Suspendido",
  pending: "Pendiente",
  rejected: "Rechazado",
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

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
  const [editingProfileFor, setEditingProfileFor] = useState<UserItem | null>(null)
  const [viewingProfileFor, setViewingProfileFor] = useState<UserItem | null>(null)
  const [deletingFor, setDeletingFor] = useState<UserItem | null>(null)
  const [lastGeneratedPassword, setLastGeneratedPassword] = useState<{ email: string; password: string } | null>(
    null,
  )
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")

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

  const pendingUsers = users.filter((u) => u.status === "pending")
  const q = search.trim().toLowerCase()
  const tableUsers = users
    .filter((u) => u.status !== "pending")
    .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    .filter((u) => !roleFilter || u.roles.some((r) => r.slug === roleFilter))
    .filter((u) => !statusFilter || u.status === statusFilter)
  const allTableUsers = users.filter((u) => u.status !== "pending")
  const hasActiveFilters = q !== "" || roleFilter !== "" || statusFilter !== ""

  return (
    <div className="max-w-4xl">
      {pendingUsers.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-yellow">
            Pendientes de aprobación ({pendingUsers.length})
          </h3>
          <p className="mb-3 text-xs text-cream/50">
            Se registraron solos desde vidasolidariamdp.com. Elegí su rol para darles el alta, o rechazalos.
          </p>
          <div className="space-y-3">
            {pendingUsers.map((u) => (
              <PendingApprovalCard
                key={u.id}
                user={u}
                roles={roles}
                onApproved={(user, generatedPassword) => {
                  setLastGeneratedPassword({ email: user.email, password: generatedPassword })
                  refresh()
                }}
                onRejected={refresh}
                onError={setError}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-cream/50">
          {tableUsers.length} {tableUsers.length === 1 ? "persona registrada" : "personas registradas"}
          {hasActiveFilters && ` de ${allTableUsers.length}`}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
        >
          + Nuevo usuario
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className="min-w-[200px] flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        >
          <option value="" className="bg-papel text-tinta">
            Todos los roles
          </option>
          {roles.map((r) => (
            <option key={r.slug} value={r.slug} className="bg-papel text-tinta">
              {r.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-cream outline-none focus:border-yellow"
        >
          <option value="" className="bg-papel text-tinta">
            Todos los estados
          </option>
          {(["active", "suspended", "rejected"] as const).map((s) => (
            <option key={s} value={s} className="bg-papel text-tinta">
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch("")
              setRoleFilter("")
              setStatusFilter("")
            }}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-cream/60 hover:bg-white/5"
          >
            Limpiar filtros
          </button>
        )}
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
            {tableUsers.map((u) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                <td className="px-4 py-3 text-cream">
                  <button
                    onClick={() => setViewingProfileFor(u)}
                    className="text-left hover:text-yellow hover:underline"
                    title="Ver ficha"
                  >
                    {u.name}
                  </button>
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
                  {u.status === "rejected" ? (
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-cream/50">
                      {STATUS_LABEL[u.status]}
                    </span>
                  ) : (
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
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button onClick={() => setViewingProfileFor(u)} className="text-xs text-yellow hover:underline">
                    Ver perfil
                  </button>
                  <span className="mx-1.5 text-cream/20">·</span>
                  <button onClick={() => setEditingProfileFor(u)} className="text-xs text-yellow hover:underline">
                    Editar perfil
                  </button>
                  <span className="mx-1.5 text-cream/20">·</span>
                  <button onClick={() => setEditingRolesFor(u)} className="text-xs text-yellow hover:underline">
                    Editar roles
                  </button>
                  {u.id !== currentUserId && (
                    <>
                      <span className="mx-1.5 text-cream/20">·</span>
                      <button
                        onClick={() => setDeletingFor(u)}
                        className="text-xs text-orange/80 hover:text-orange hover:underline"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {tableUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-cream/50">
                  {allTableUsers.length === 0
                    ? "Todavía no hay usuarios registrados."
                    : "Ningún usuario coincide con el filtro."}
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

      {editingProfileFor && (
        <EditProfileModal
          user={editingProfileFor}
          onClose={() => setEditingProfileFor(null)}
          onSaved={() => {
            setEditingProfileFor(null)
            refresh()
          }}
          onError={setError}
        />
      )}

      {viewingProfileFor && (
        <ViewProfileModal
          user={viewingProfileFor}
          onClose={() => setViewingProfileFor(null)}
          onEditProfile={() => {
            setEditingProfileFor(viewingProfileFor)
            setViewingProfileFor(null)
          }}
          onEditRoles={() => {
            setEditingRolesFor(viewingProfileFor)
            setViewingProfileFor(null)
          }}
        />
      )}

      {deletingFor && (
        <DeleteUserModal
          user={deletingFor}
          onClose={() => setDeletingFor(null)}
          onDeleted={() => {
            setDeletingFor(null)
            refresh()
          }}
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

/**
 * Fase K bloque A — una tarjeta por voluntario que se registró solo desde
 * vidasolidariamdp.com y espera que la comisión lo apruebe o rechace. El
 * rol es obligatorio para aprobar (reusa el mismo checklist que el alta
 * manual), así que "Aprobar" queda deshabilitado hasta elegir al menos uno.
 */
function PendingApprovalCard({
  user,
  roles,
  onApproved,
  onRejected,
  onError,
}: {
  user: UserItem
  roles: RoleItem[]
  onApproved: (user: UserItem, generatedPassword: string) => void
  onRejected: () => void
  onError: (e: string) => void
}) {
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [confirmingReject, setConfirmingReject] = useState(false)

  function toggleRole(slug: string) {
    setSelectedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <div className="rounded-2xl border border-yellow/30 bg-yellow/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-cream">{user.name}</p>
          <p className="text-xs text-cream/60">{user.email}</p>
          {user.phone && <p className="text-xs text-cream/60">{user.phone}</p>}
        </div>
        <p className="text-[11px] text-cream/40">
          Se registró el {new Date(user.createdAt).toLocaleDateString("es-AR")}
        </p>
      </div>

      {user.volunteerMessage && (
        <p className="mt-2 rounded-lg bg-black/20 p-2.5 text-sm text-cream/80">"{user.volunteerMessage}"</p>
      )}

      <div className="mt-3">
        <span className="mb-1 block text-xs text-cream/60">Rol para aprobar *</span>
        <RoleCheckboxList roles={roles} selected={selectedRoles} onToggle={toggleRole} />
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        {confirmingReject ? (
          <>
            <span className="text-xs text-cream/60">¿Seguro que querés rechazarlo?</span>
            <button
              onClick={() => setConfirmingReject(false)}
              className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await rejectUser(user.id)
                  onRejected()
                } catch (err: any) {
                  onError(err.message ?? "No se pudo rechazar")
                } finally {
                  setSaving(false)
                }
              }}
              className="rounded-xl bg-orange/80 px-3 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              Sí, rechazar
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setConfirmingReject(true)}
              className="rounded-xl border border-white/20 px-3 py-1.5 text-xs hover:bg-white/5"
            >
              Rechazar
            </button>
            <button
              disabled={saving || selectedRoles.size === 0}
              onClick={async () => {
                setSaving(true)
                try {
                  const { user: approved, generatedPassword } = await approveUser(user.id, Array.from(selectedRoles))
                  onApproved(approved, generatedPassword)
                } catch (err: any) {
                  onError(err.message ?? "No se pudo aprobar")
                } finally {
                  setSaving(false)
                }
              }}
              className="rounded-xl bg-yellow px-4 py-1.5 text-xs font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Aprobando..." : "Aprobar"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Fase L: bloque de campos de perfil extendido, compartido entre el alta
 * (NewUserModal) y la edición (EditProfileModal) — Josecito pidió que el
 * alta de usuarios sea "mas completo, con imagen de perfil, datos de
 * domicilio, telefonos, emails, edad, sexo, habilidades, cv adjunto, dias
 * disponibles, horarios disponibles". Todo opcional: no bloquea el alta
 * rápida de siempre.
 */
function ProfileFieldsEditor({
  value,
  onChange,
}: {
  value: ProfileFields
  onChange: (next: ProfileFields) => void
}) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCv, setUploadingCv] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const days = new Set(value.availableDays ?? [])
  function toggleDay(d: AvailableDay) {
    const next = new Set(days)
    if (next.has(d)) next.delete(d)
    else next.add(d)
    onChange({ ...value, availableDays: Array.from(next) })
  }

  return (
    <div className="mb-4 space-y-3 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-cream/40">Perfil (opcional)</p>

      <div className="flex items-center gap-3">
        {value.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        )}
        <label className="flex-1 text-sm">
          <span className="mb-1 block text-cream/70">Foto de perfil</span>
          <input
            type="file"
            accept="image/*"
            disabled={uploadingAvatar}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setUploadingAvatar(true)
              setUploadError(null)
              try {
                const { fileUrl } = await uploadProfileFile(file)
                onChange({ ...value, avatarUrl: fileUrl })
              } catch (err: any) {
                setUploadError(err.message ?? "No se pudo subir la foto")
              } finally {
                setUploadingAvatar(false)
              }
            }}
            className="w-full text-xs text-cream/70 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-cream"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-cream/70">Domicilio</span>
        <input
          value={value.address ?? ""}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-cream/70">Teléfono alternativo</span>
          <input
            value={value.phoneAlt ?? ""}
            onChange={(e) => onChange({ ...value, phoneAlt: e.target.value })}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-cream/70">Fecha de nacimiento</span>
          <input
            type="date"
            value={value.birthDate ? value.birthDate.slice(0, 10) : ""}
            onChange={(e) => onChange({ ...value, birthDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : null })}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-cream/70">Sexo</span>
        <input
          value={value.sex ?? ""}
          onChange={(e) => onChange({ ...value, sex: e.target.value })}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-cream/70">Habilidades</span>
        <textarea
          value={value.skills ?? ""}
          onChange={(e) => onChange({ ...value, skills: e.target.value })}
          rows={2}
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block text-cream/70">CV adjunto</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          disabled={uploadingCv}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            setUploadingCv(true)
            setUploadError(null)
            try {
              const { fileUrl } = await uploadProfileFile(file)
              onChange({ ...value, cvUrl: fileUrl })
            } catch (err: any) {
              setUploadError(err.message ?? "No se pudo subir el CV")
            } finally {
              setUploadingCv(false)
            }
          }}
          className="w-full text-xs text-cream/70 file:mr-2 file:rounded-lg file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-cream"
        />
        {value.cvUrl && (
          <a href={value.cvUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-yellow hover:underline">
            Ver CV cargado
          </a>
        )}
      </label>

      <div>
        <span className="mb-1 block text-sm text-cream/70">Días disponibles</span>
        <div className="flex flex-wrap gap-1.5">
          {AVAILABLE_DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                days.has(d) ? "bg-yellow text-purple-deep" : "bg-white/10 text-cream/60 hover:bg-white/20"
              }`}
            >
              {AVAILABLE_DAY_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-cream/70">Horarios disponibles</span>
        <input
          value={value.availableHours ?? ""}
          onChange={(e) => onChange({ ...value, availableHours: e.target.value })}
          placeholder="p. ej. Sábados y domingos por la mañana"
          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
        />
      </label>

      {(uploadingAvatar || uploadingCv) && <p className="text-xs text-cream/50">Subiendo archivo...</p>}
      {uploadError && <p className="text-xs text-orange">{uploadError}</p>}
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
  const [profile, setProfile] = useState<ProfileFields>({})
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
              ...profile,
            })
            onCreated(user, generatedPassword)
          } catch (err: any) {
            setError(err.message ?? "No se pudo crear el usuario")
          } finally {
            setSaving(false)
          }
        }}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6"
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

        <ProfileFieldsEditor value={profile} onChange={setProfile} />

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

function EditProfileModal({
  user,
  onClose,
  onSaved,
  onError,
}: {
  user: UserItem
  onClose: () => void
  onSaved: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [profile, setProfile] = useState<ProfileFields>({
    birthDate: user.birthDate,
    sex: user.sex,
    address: user.address,
    phoneAlt: user.phoneAlt,
    skills: user.skills,
    cvUrl: user.cvUrl,
    avatarUrl: user.avatarUrl,
    availableDays: user.availableDays,
    availableHours: user.availableHours,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          setSaving(true)
          setError(null)
          try {
            await updateUser(user.id, { name: name.trim(), phone: phone.trim() || null, ...profile })
            onSaved()
          } catch (err: any) {
            setError(err.message ?? "No se pudo guardar el perfil")
          } finally {
            setSaving(false)
          }
        }}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6"
      >
        <h2 className="mb-1 font-display text-lg font-bold text-yellow">Editar perfil</h2>
        <p className="mb-4 text-xs text-cream/50">{user.email}</p>

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
          <span className="mb-1 block text-cream/70">Teléfono</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-yellow"
          />
        </label>

        <ProfileFieldsEditor value={profile} onChange={setProfile} />

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
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

/**
 * Ficha de usuario — a pedido de Josecito ("poder clickear el usuario para
 * ver su ficha, además del botón editar perfil uno que sea ver perfil
 * usuario"). Solo lectura, con los mismos datos que ya se cargan hoy vía
 * Editar perfil — desde acá se puede saltar directo a editar perfil o
 * roles sin tener que cerrar y volver a buscar a la persona en la tabla.
 */
function ViewProfileModal({
  user,
  onClose,
  onEditProfile,
  onEditRoles,
}: {
  user: UserItem
  onClose: () => void
  onEditProfile: () => void
  onEditRoles: () => void
}) {
  const days = new Set(user.availableDays)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/15 bg-purple-deep p-6">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-cream/60">
                {user.name
                  .trim()
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </span>
            )}
            <div>
              <h2 className="font-display text-lg font-bold text-yellow">{user.name}</h2>
              <p className="text-xs text-cream/50">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-cream/40 hover:text-cream">
            ✕
          </button>
        </div>

        <div className="mb-4 mt-3 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
              user.status === "active"
                ? "bg-green-500/20 text-green-300"
                : user.status === "suspended"
                  ? "bg-orange/20 text-orange"
                  : "bg-white/10 text-cream/50"
            }`}
          >
            {STATUS_LABEL[user.status]}
          </span>
          {user.roles.map((r) => (
            <span key={r.slug} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-cream/80">
              {r.label}
            </span>
          ))}
        </div>

        <dl className="space-y-3 border-t border-white/10 pt-3 text-sm">
          <ProfileRow label="Teléfono" value={user.phone} />
          <ProfileRow label="Teléfono alternativo" value={user.phoneAlt} />
          <ProfileRow label="Domicilio" value={user.address} />
          <ProfileRow label="Fecha de nacimiento" value={user.birthDate ? formatDate(user.birthDate) : null} />
          <ProfileRow label="Sexo" value={user.sex} />
          <ProfileRow label="Habilidades" value={user.skills} multiline />
          <div>
            <dt className="mb-1 text-xs text-cream/50">Días disponibles</dt>
            <dd>
              {days.size > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_DAYS.map((d) => (
                    <span
                      key={d}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        days.has(d) ? "bg-yellow text-purple-deep" : "bg-white/5 text-cream/30"
                      }`}
                    >
                      {AVAILABLE_DAY_LABEL[d]}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-cream/40">—</span>
              )}
            </dd>
          </div>
          <ProfileRow label="Horarios disponibles" value={user.availableHours} />
          <div>
            <dt className="mb-1 text-xs text-cream/50">CV adjunto</dt>
            <dd>
              {user.cvUrl ? (
                <a href={user.cvUrl} target="_blank" rel="noreferrer" className="text-yellow hover:underline">
                  Ver CV
                </a>
              ) : (
                <span className="text-cream/40">—</span>
              )}
            </dd>
          </div>
          <ProfileRow label="Miembro desde" value={formatDate(user.createdAt)} />
        </dl>

        <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
          <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cerrar
          </button>
          <button
            onClick={onEditRoles}
            className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5"
          >
            Editar roles
          </button>
          <button
            onClick={onEditProfile}
            className="rounded-xl bg-yellow px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90"
          >
            Editar perfil
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileRow({ label, value, multiline }: { label: string; value: string | null; multiline?: boolean }) {
  return (
    <div>
      <dt className="mb-1 text-xs text-cream/50">{label}</dt>
      <dd className={`text-cream ${multiline ? "whitespace-pre-wrap" : ""}`}>{value || <span className="text-cream/40">—</span>}</dd>
    </div>
  )
}

/**
 * Baja definitiva — a diferencia del botón de estado (que solo
 * activa/suspende), esto borra la fila de verdad y no se puede deshacer.
 * Pide escribir el nombre para confirmar (misma fricción que un "escribí
 * DELETE para confirmar", adaptado) porque es la única acción de este
 * panel que pierde datos para siempre.
 */
function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: UserItem
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDelete = confirmText.trim().toLowerCase() === user.name.trim().toLowerCase()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-orange/40 bg-purple-deep p-6">
        <h2 className="mb-1 font-display text-lg font-bold text-orange">Eliminar usuario definitivamente</h2>
        <p className="mb-3 text-xs text-cream/50">{user.name} — {user.email}</p>

        <div className="mb-4 space-y-2 rounded-lg border border-orange/30 bg-orange/10 p-3 text-xs text-cream/80">
          <p>
            Esto <strong className="text-orange">no se puede deshacer</strong>. Se van a borrar para siempre sus
            mensajes del chat de coordinadores, sus roles, sus sesiones activas, su membresía en proyectos/tareas y
            sus respuestas de encuestas.
          </p>
          <p>
            En el historial de Stock, Cocina, Casos y Proyectos donde participó, va a quedar como{" "}
            <strong>"—"</strong> en vez de su nombre (esos registros no se borran, solo pierden ese dato).
          </p>
          <p>Si no estás seguro, usá "Suspender" en la tabla en vez de esto — se puede reactivar cuando quieras.</p>
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-cream/70">
            Escribí <strong className="text-cream">{user.name}</strong> para confirmar
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-cream outline-none focus:border-orange"
            autoFocus
          />
        </label>

        {error && <p className="mb-3 text-sm text-orange">{error}</p>}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Cancelar
          </button>
          <button
            disabled={!canDelete || deleting}
            onClick={async () => {
              setDeleting(true)
              setError(null)
              try {
                await deleteUser(user.id)
                onDeleted()
              } catch (err: any) {
                setError(err.message ?? "No se pudo eliminar")
              } finally {
                setDeleting(false)
              }
            }}
            className="rounded-xl bg-orange px-4 py-2 text-sm font-semibold text-purple-deep hover:opacity-90 disabled:opacity-40"
          >
            {deleting ? "Eliminando..." : "Eliminar definitivamente"}
          </button>
        </div>
      </div>
    </div>
  )
}
