"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { login } from "../../lib/auth"

// Fase M (22/09/2026) — reskin según el manual de identidad oficial: fondo
// Papel (antes degradado violeta oscuro), botón primario amarillo con
// texto Tinta y esquinas rectas (regla exacta de "Web y página de
// donación", sección 07 · APLICACIONES del manual), sin degradados.
export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-papel px-6">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/logo.png" alt="Vida Solidaria MDP" className="w-28" />
        <h1 className="font-display text-2xl font-extrabold text-violeta">Vida Solidaria</h1>
        <p className="font-display italic text-sm text-tinta/60">Tu esfuerzo, nuestro motor</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-violeta/15 bg-white p-6 shadow-sm"
      >
        <label className="mb-1 block text-sm text-tinta/70">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
          placeholder="tu-email@vidasolidaria.org"
        />

        <label className="mb-1 block text-sm text-tinta/70">Contraseña</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border border-violeta/20 bg-papel px-4 py-3 text-tinta outline-none focus:border-violeta"
          placeholder="••••••••"
        />

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-sm bg-amarillo py-3 font-display font-bold text-tinta transition hover:brightness-95 disabled:opacity-60"
          style={{ minHeight: 44 }}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`}
          className="mt-3 block w-full rounded-sm border border-violeta py-3 text-center text-sm font-medium text-violeta hover:bg-violeta/5"
          style={{ minHeight: 44 }}
        >
          Continuar con Google
        </a>
      </form>

      <p className="max-w-sm text-center text-xs text-tinta/40">
        Este sistema es de uso interno. Si no tenés cuenta, pedile a un administrador que te dé de alta.
      </p>
    </main>
  )
}
