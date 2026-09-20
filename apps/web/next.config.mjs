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

export default nextConfig
