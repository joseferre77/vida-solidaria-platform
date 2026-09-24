/**
 * Fase O (24/09/2026): el wrapper PWA (@serwist/next) se conecta acá —
 * hasta ahora estaba solo instalado, nunca wireado ("se agrega al llegar
 * a esa fase del roadmap", nunca se había llegado). Necesario para que
 * exista un service worker real y, con eso, notificaciones push
 * verdaderas al celular (ver app/sw.ts). La config de Capacitor para el
 * build APK sigue pendiente para más adelante — ver ARCHITECTURE.md §7.
 */
import withSerwistInit from "@serwist/next"

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "standalone": empaqueta un server.js propio + node_modules mínimos.
  // Lo necesitan plataformas como Hostinger (Node.js Apps) que arman su
  // propio proceso de arranque a partir de la carpeta de build en vez de
  // correr "next start" directo.
  output: "standalone",
  // Este hosting compartido tiene un límite bajo de procesos simultáneos
  // (LVE) — el pool de workers que Next.js arma por defecto para el build
  // de "Generating static pages" hace child_process.spawn(node) por cada
  // worker, y ese spawn() de un PROCESO NUEVO es justo lo que el LVE
  // bloquea con "spawn .../node EAGAIN" (probado: pasa incluso con
  // cpus:1). workerThreads:true cambia jest-worker a worker_threads
  // (hilos dentro del mismo proceso, sin spawnear un node nuevo) y evita
  // el problema por completo. cpus:1 de paso limita a un solo hilo.
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
}

export default withSerwist(nextConfig)
