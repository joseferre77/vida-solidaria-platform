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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-body min-h-screen">{children}</body>
    </html>
  )
}
