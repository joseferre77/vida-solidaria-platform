import type { Metadata, Viewport } from "next"
import "../styles/globals.css"
import { AppShell } from "../components/AppShell"

export const metadata: Metadata = {
  title: "Vida Solidaria — Plataforma de Gestión",
  description: "Tu esfuerzo, nuestro motor",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/brand/favicon-192.png",
  },
}

// Violeta Vida — color institucional oficial (manual de identidad, 22/09/2026).
export const viewport: Viewport = {
  themeColor: "#73038C",
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
      <head>
        {/* Outfit (títulos/números) + Work Sans (cuerpo) — sistema tipográfico
            oficial del manual de identidad, sección 05 · TIPOGRAFÍA. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
