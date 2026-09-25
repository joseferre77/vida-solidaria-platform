/**
 * Cliente HTTP compartido para toda la web (antes cada lib/*.ts tenía su
 * propia copia de esto). Se centraliza acá por un motivo concreto: en el
 * uso real de Casos (Fase J) un voluntario relevando en la calle puede
 * tardar 5-10 minutos hablando con la persona antes de guardar, y el
 * access token (antes 15 min, ahora 2h en el backend) podía vencer justo
 * al apretar "Guardar" — aparecía como "sesión cerrada" y se perdía la
 * carga. Acá, cualquier 401 dispara un intento de POST /auth/refresh
 * (usa el refresh_token, que dura 30 días) y, si funciona, reintenta la
 * petición original UNA vez antes de darse por vencido. Esto hace que la
 * duración exacta del access token deje de importar para el uso normal.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

let refreshInFlight: Promise<boolean> | null = null

/**
 * Intenta renovar el access_token usando el refresh_token (cookie
 * httpOnly, dura 30 días). Compartido entre apiFetch/apiUpload de acá y
 * fetchMe de auth.ts — varias llamadas en paralelo que pisan un 401 al
 * mismo tiempo comparten el mismo intento en vez de disparar N refreshes.
 */
export function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null
      })
  }
  return refreshInFlight
}

async function parseErrorOrThrow(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new Error(body.error ?? "Tu sesión venció — volvé a entrar y probá de nuevo")
  }
  throw new Error(body.error ?? `Error ${res.status}`)
}

/**
 * fetch con JSON + cookies de sesión + reintento automático tras refresh.
 * `skipAuthRetry` es para las rutas propias de auth (login/refresh) que no
 * deben entrar en el ciclo de reintento.
 *
 * Fase V: Content-Type: application/json solo se manda cuando REALMENTE
 * hay un body. Antes se mandaba siempre, sin importar el método — y
 * Fastify, al ver esa etiqueta en una request sin contenido (típico en un
 * DELETE o un PATCH de "marcar como leído" que no necesita mandar nada),
 * la rechaza con FST_ERR_CTP_EMPTY_JSON_BODY antes de que llegue a la
 * ruta. Esto se veía en el navegador como un genérico "Error interno" —
 * lo reportó Josecito al borrar un usuario de prueba, y resultó ser el
 * mismo bug detrás de "Limpiar todo" en Notificaciones (markAllRead +
 * clearRead, las dos sin body) y, revisando el resto del código, de
 * decenas de otros botones de borrar/desasignar en Casos, Proyectos,
 * Logística y Equipos que comparten el mismo patrón. En vez de agregarle
 * `body: "{}"` a cada uno (como ya se había hecho a mano en un par —
 * rejectUser, regeneratePassword — antes de encontrar la causa real), se
 * arregla acá una sola vez para toda la app.
 */
export async function apiFetch(path: string, init?: RequestInit & { skipAuthRetry?: boolean }): Promise<any> {
  const { skipAuthRetry, ...rest } = init ?? {}
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...rest,
      credentials: "include",
      headers: { ...(rest.body ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    })

  let res = await doFetch()
  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh()
    if (refreshed) res = await doFetch()
  }
  if (!res.ok) return parseErrorOrThrow(res)
  if (res.status === 204) return null
  return res.json()
}

/**
 * Igual que apiFetch pero para POST multipart/form-data (subida de
 * archivos) — sin Content-Type manual, el browser arma el boundary solo.
 */
export async function apiUpload(path: string, formData: FormData): Promise<any> {
  const doFetch = () => fetch(`${API_URL}${path}`, { method: "POST", credentials: "include", body: formData })

  let res = await doFetch()
  if (res.status === 401) {
    const refreshed = await tryRefresh()
    if (refreshed) res = await doFetch()
  }
  if (!res.ok) return parseErrorOrThrow(res)
  return res.json()
}
