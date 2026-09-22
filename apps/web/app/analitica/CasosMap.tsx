"use client"

import "leaflet/dist/leaflet.css"
import { useRouter } from "next/navigation"
import { useMemo } from "react"
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet"
import { CASE_MAP_COLOR, CASE_MAP_COLOR_LABEL, type CaseMapPoint } from "../../lib/analytics"

/**
 * Mapa de casos (post-Fase-K, pedido de Josecito 21/09/2026): un pin por
 * caso en su última ubicación GPS conocida (`CaseLocation` más reciente),
 * con el nombre del PSC y color según clasificación. Clickear un pin lleva
 * a /casos?caseId=<id> (Casos ya sabía abrir un caso puntual del listado
 * vía el prop `openCaseId` del bloque E — acá se agregó la lectura del
 * query param en app/casos/page.tsx para poder llegar desde otra página).
 *
 * Se importa siempre vía `next/dynamic` con `ssr: false` desde page.tsx:
 * Leaflet toca `window`/`document` al cargar, revienta en SSR.
 *
 * Se usan `CircleMarker` (círculos de color puro) en vez de los íconos
 * default de Leaflet a propósito: el ícono default de Leaflet depende de
 * imágenes (marker-icon.png, etc.) cuyas rutas se rompen con bundlers
 * como Webpack/Next si no se reconfiguran a mano — un círculo de color
 * resuelve el pedido ("rojo/naranja/amarillo/verde") sin ese problema.
 */
export default function CasosMap({ points }: { points: CaseMapPoint[] }) {
  const router = useRouter()

  const center = useMemo((): [number, number] => {
    if (points.length === 0) return [-38.0055, -57.5426] // Mar del Plata, centro por defecto
    const avgLat = points.reduce((s, p) => s + p.lat, 0) / points.length
    const avgLng = points.reduce((s, p) => s + p.lng, 0) / points.length
    return [avgLat, avgLng]
  }, [points])

  return (
    <div className="overflow-hidden rounded-2xl border border-white/15">
      <MapContainer center={center} zoom={points.length ? 12 : 13} scrollWheelZoom style={{ height: 420, width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((p) => (
          <CircleMarker
            key={p.caseId}
            center={[p.lat, p.lng]}
            radius={9}
            pathOptions={{
              color: "#1a1a1a",
              weight: 1.5,
              fillColor: CASE_MAP_COLOR[p.status],
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: () => router.push(`/casos?caseId=${p.caseId}`),
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{p.fullName}</p>
                {p.alias && <p className="text-cream/70">"{p.alias}"</p>}
                <p>{p.caseNumber}</p>
                <p>{CASE_MAP_COLOR_LABEL[p.status]}</p>
                <button
                  onClick={() => router.push(`/casos?caseId=${p.caseId}`)}
                  className="mt-1 font-semibold text-purple-deep underline"
                >
                  Ver caso →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
