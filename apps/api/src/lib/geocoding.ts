/**
 * Geocodificación gratuita de direcciones vía Nominatim (OpenStreetMap) —
 * Fase X, mapa de voluntarios y puntos de operación. Se eligió Nominatim
 * (en vez de Google Maps/Mapbox) porque no requiere tarjeta ni API key,
 * consistente con el resto del stack de bajo costo de este proyecto
 * (Hostinger compartido + Supabase).
 *
 * Política de uso de Nominatim (operations.osmfoundation.org/policies/nominatim):
 * máximo 1 request/segundo y un User-Agent descriptivo (nunca el default de
 * fetch/curl). `throttle()` fuerza ese mínimo de 1.1s entre pedidos reales
 * sin necesidad de una cola externa — alcanza porque son pocos usuarios
 * reales (~14 coordinadores + los voluntarios con dirección cargada).
 *
 * Se le agrega ", Mar del Plata, Argentina" a la dirección antes de
 * buscarla si el texto no lo menciona ya, para que direcciones cortas
 * ("Alvarado 1234") no devuelvan un resultado de otra ciudad/país.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const USER_AGENT = "VidaSolidariaMDP-Gestion/1.0 (+https://gestion.vidasolidariamdp.com)"
const MIN_INTERVAL_MS = 1100

let lastRequestAt = 0

async function throttle() {
  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  lastRequestAt = Date.now()
}

export interface GeocodeResult {
  lat: number
  lng: number
}

/** Devuelve null si no se pudo geocodificar (dirección vacía, sin resultados, o error de red) — nunca tira. */
export async function geocodeAddress(address: string | null | undefined): Promise<GeocodeResult | null> {
  const trimmed = address?.trim()
  if (!trimmed) return null

  const query = /mar del plata/i.test(trimmed) ? trimmed : `${trimmed}, Mar del Plata, Argentina`

  try {
    await throttle()
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" } })
    if (!res.ok) return null
    const results = (await res.json()) as { lat: string; lon: string }[]
    if (!results.length) return null
    const lat = parseFloat(results[0].lat)
    const lng = parseFloat(results[0].lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  } catch {
    return null
  }
}
