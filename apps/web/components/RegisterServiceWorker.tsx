"use client"

import { useEffect } from "react"

/**
 * Fase O (24/09/2026): registra el service worker (app/sw.ts, compilado a
 * public/sw.js por @serwist/next) al cargar cualquier pantalla. Sin esto
 * la PWA no es instalable de verdad y las notificaciones push no tienen
 * dónde "vivir" cuando el celular está con la app cerrada.
 *
 * `register: true` (default de @serwist/next) ya inyecta un registro
 * automático — este componente queda como no-op explícito documentado acá
 * por si en algún momento se desactiva ese auto-registro; se deja vacío a
 * propósito en vez de duplicar el registro.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    // El registro automático de @serwist/next (register:true, default) ya
    // corre solo. Nada que hacer acá salvo loguear un fallo, si lo hay,
    // para que no quede en silencio en producción.
    navigator.serviceWorker.ready.catch((err) => {
      console.warn("[sw] El service worker no llegó a activarse:", err)
    })
  }, [])

  return null
}
