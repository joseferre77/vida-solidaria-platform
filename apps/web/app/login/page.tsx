"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { login } from "../../lib/auth"

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/logo.png" alt="Vida Solidaria MDP" className="w-28" />
        <h1 className="font-display text-2xl font-extrabold text-yellow">Vida Solidaria</h1>
        <p className="font-display italic text-sm text-cream/70">Tu esfuerzo, nuestro motor</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur"
      >
        <label className="mb-1 block text-sm text-cream/70">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-cream outline-none focus:border-yellow"
          placeholder="tu-email@vidasolidaria.org"
        />

        <label className="mb-1 block text-sm text-cream/70">Contraseña</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-xl border border-white/20 bg-black/25 px-4 py-3 text-cream outline-none focus:border-yellow"
          placeholder="••••••••"
        />

        {error && <p className="mb-4 text-sm text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-yellow to-orange py-3 font-display font-bold text-purple-deep disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`}
          className="mt-3 block w-full rounded-xl border border-white/20 py-3 text-center text-sm text-cream/80 hover:bg-white/5"
        >
          Continuar con Google
        </a>
      </form>

      <p className="max-w-sm text-center text-xs text-cream/40">
        Este sistema es de uso interno. Si no tenés cuenta, pedile a un administrador que te dé de alta.
      </p>
    </main>
  )
}
