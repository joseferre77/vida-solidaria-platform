"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { login, registerAccount } from "../../lib/auth"

// Fase M (22/09/2026) — reskin según el manual de identidad oficial: fondo
// Papel (antes degradado violeta oscuro), botón primario amarillo con
// texto Tinta y esquinas rectas (regla exacta de "Web y página de
// donación", sección 07 · APLICACIONES del manual), sin degradados.
//
// Fase Q (24/09/2026) — autorregistro con confirmación de email: se agrega
// un toggle Iniciar sesión / Registrarse en la misma pantalla. Después de
// registrarse la persona NO entra directo (falta confirmar el email y
// después la aprobación de la comisión) — se muestra una pantalla de
// espera en vez de redirigir a /dashboard. Campos mínimos a propósito
// (nombre, email, contraseña, teléfono) — CV/habilidades/disponibilidad
// quedan para una vuelta posterior (Tarea #72).
type Mode = "login" | "register" | "registered"

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("login")

  // Login
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Registro
  const [regName, setRegName] = useState("")
  const [regEmail, setRegEmail] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [regPhone, setRegPhone] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado")
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await registerAccount({ name: regName, email: regEmail, password: regPassword, phone: regPhone })
      setMode("registered")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado")
    } finally {
      setLoading(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-papel px-6">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/logo.png" alt="Vida Solidaria MDP" className="w-28" />
        <h1 className="font-display text-2xl font-extrabold text-violeta">Vida Solidaria</h1>
        <p className="font-display italic text-sm text-tinta/60">Tu esfuerzo, nuestro motor</p>
      </div>

      {mode === "registered" ? (
        <div className="w-full max-w-sm rounded-2xl border border-violeta/15 bg-white p-6 text-center shadow-sm">
          <h2 className="mb-2 font-display text-lg font-bold text-violeta">¡Revisá tu email!</h2>
          <p className="mb-4 text-sm text-tinta/70">
            Te mandamos un link a <strong>{regEmail}</strong> para confirmar tu cuenta. Una vez que lo confirmes, la
            comisión va a revisar tu registro y te va a avisar por mail cuando esté aprobado.
          </p>
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="w-full rounded-sm border border-violeta py-3 text-sm font-medium text-violeta hover:bg-violeta/5"
            style={{ minHeight: 44 }}
          >
            Volver a iniciar sesión
          </button>
        </div>
      ) : (
        <form
          onSubmit={mode === "login" ? handleLogin : handleRegister}
          className="w-full max-w-sm rounded-2xl border border-violeta/15 bg-white p-6 shadow-sm"
        >
          {mode === "register" && (
            <>
              <label className="mb-1 block text-sm text-tinta/70">Nombre completo</label>
              <input
                type="text"
                required
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
                placeholder="Tu nombre y apellido"
              />
            </>
          )}

          <label className="mb-1 block text-sm text-tinta/70">Email</label>
          <input
            type="email"
            required
            value={mode === "login" ? email : regEmail}
            onChange={(e) => (mode === "login" ? setEmail(e.target.value) : setRegEmail(e.target.value))}
            className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
            placeholder="tu-email@vidasolidaria.org"
          />

          {mode === "register" && (
            <>
              <label className="mb-1 block text-sm text-tinta/70">Teléfono</label>
              <input
                type="tel"
                required
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
                className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
                placeholder="223 555-5555"
              />
            </>
          )}

          <label className="mb-1 block text-sm text-tinta/70">Contraseña</label>
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            value={mode === "login" ? password : regPassword}
            onChange={(e) => (mode === "login" ? setPassword(e.target.value) : setRegPassword(e.target.value))}
            className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
            placeholder="••••••••"
          />
          {mode === "register" && <p className="-mt-2.5 mb-4 text-xs text-tinta/40">Mínimo 8 caracteres.</p>}

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-sm bg-amarillo py-3 font-display font-bold text-tinta transition hover:brightness-95 disabled:opacity-60"
            style={{ minHeight: 44 }}
          >
            {loading ? "Un momento..." : mode === "login" ? "Entrar" : "Registrarme"}
          </button>

          {mode === "login" && (
            <a
              href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`}
              className="mt-3 block w-full rounded-sm border border-violeta py-3 text-center text-sm font-medium text-violeta hover:bg-violeta/5"
              style={{ minHeight: 44 }}
            >
              Continuar con Google
            </a>
          )}

          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            className="mt-4 w-full text-center text-sm font-medium text-violeta hover:underline"
          >
            {mode === "login" ? "¿Sos voluntario/a nuevo/a? Registrate acá" : "¿Ya tenés cuenta? Iniciá sesión"}
          </button>
        </form>
      )}

      {mode !== "registered" && (
        <p className="max-w-sm text-center text-xs text-tinta/40">
          {mode === "login"
            ? "¿Todavía no tenés cuenta? Registrate arriba — la comisión revisa cada alta antes de aprobarla."
            : "Vamos a mandarte un mail para confirmar tu cuenta antes de que la comisión revise tu registro."}
        </p>
      )}
    </main>
  )
}
