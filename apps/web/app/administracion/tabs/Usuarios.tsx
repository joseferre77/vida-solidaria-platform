"use client"

import { useEffect, useState } from "react"
import {
  approveUser,
  AVAILABLE_DAYS,
  AVAILABLE_DAY_LABEL,
  createUser,
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

  const pendingUsers = users.filter((u) => u.status === "pending")
  const tableUsers = users.filter((u) => u.status !== "pending")

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
            {tableUsers.map((u) => (
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
                  <button onClick={() => setEditingProfileFor(u)} className="text-xs text-yellow hover:underline">
                    Editar perfil
                  </button>
                  <span className="mx-1.5 text-cream/20">·</span>
                  <button onClick={() => setEditingRolesFor(u)} className="text-xs text-yellow hover:underline">
                    Editar roles
                  </button>
                </td>
              </tr>
            ))}
            {tableUsers.length === 0 && (
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
