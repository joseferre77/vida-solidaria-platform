/**
 * Estado: config base. El wrapper PWA (@serwist/next) y la config de
 * Capacitor para el build APK se agregan al llegar a esa fase del roadmap
 * (no antes del Módulo 1) — ver ARCHITECTURE.md §1 y §7.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "standalone": empaqueta un server.js propio + node_modules mínimos.
  // Lo necesitan plataformas como Hostinger (Node.js Apps) que arman su
  // propio proceso de arranque a partir de la carpeta de build en vez de
  // correr "next start" directo.
  output: "standalone",
}

export default nextConfig
