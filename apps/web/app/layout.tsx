import type { Metadata, Viewport } from "next"
import "../styles/globals.css"

export const metadata: Metadata = {
  title: "Vida Solidaria — Plataforma de Gestión",
  description: "Tu esfuerzo, nuestro motor",
  manifest: "/manifest.json",
}

export const viewport: Viewport = {
  themeColor: "#7c1fb0",
}

// Este hosting compartido tiene un límite de procesos (LVE) tan bajo que
// el worker que Next.js arma para "Generating static pages" no llega a
// nacer (spawn ... EAGAIN), sin importar cuánto se le baje el paralelismo.
// Como todas las pantallas son "use client" y ya traen sus datos por
// fetch en el navegador, no hay nada que ganar generándolas como HTML
// estático en build time — se fuerza renderizado dinámico (por request)
// para toda la app, lo que evita esa fase del build por completo.
export const dynamic = "force-dynamic"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-body min-h-screen">{children}</body>
    </html>
  )
}
