"use client"

import "leaflet/dist/leaflet.css"
import L from "leaflet"
import { useMemo } from "react"
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet"
import {
  OPERATIONAL_POINT_CATEGORY_COLOR,
  OPERATIONAL_POINT_CATEGORY_LABEL,
  type MapVolunteer,
  type OperationalPointItem,
} from "../../lib/map"

/**
 * Mapa de voluntarios (Fase X, pedido de Josecito 07/11/2026): un pin por
 * voluntario geolocalizado + un pin por punto de operación (acopio de
 * ropa, cocina, etc., color según categoría) + dos líneas que cruzan en
 * `center` dividiendo el mapa en 4 cuadrantes visuales. Mismas razones que
 * CasosMap.tsx (../analitica/CasosMap.tsx) para los detalles técnicos:
 * se carga siempre vía next/dynamic con ssr:false (Leaflet toca window al
 * cargar), y se usan CircleMarker en vez del ícono default de Leaflet para
 * no depender de imágenes que Webpack/Next rompen si no se reconfiguran.
 *
 * El pin del cruce de cuadrantes SÍ necesita poder arrastrarse (Josecito
 * pidió que el centro no sea fijo) — CircleMarker no soporta drag nativo
 * de Leaflet, así que para ESE pin puntual se usa un Marker con un ícono
 * propio hecho con L.divIcon (un div con CSS, no una imagen), que evita el
 * mismo problema de rutas rotas sin perder el drag.
 */

const CENTER_ICON = L.divIcon({
  className: "",
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#fbbf24;border:2px solid #1a1a1a;box-shadow:0 0 0 4px rgba(251,191,36,0.3);cursor:grab;"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// ~0.5° alcanza y sobra para cubrir Mar del Plata completa en cualquier
// zoom razonable de ciudad (≈ 40-55km a esta latitud).
const LINE_SPAN = 0.5

export default function MapaVoluntariosMap({
  volunteers,
  points,
  center,
  canMoveCenter,
  onMoveCenter,
}: {
  volunteers: MapVolunteer[]
  points: OperationalPointItem[]
  center: [number, number]
  canMoveCenter: boolean
  onMoveCenter: (lat: number, lng: number) => void
}) {
  const mapCenter = useMemo((): [number, number] => {
    const allLat = [...volunteers.map((v) => v.lat), ...points.map((p) => p.lat)]
    const allLng = [...volunteers.map((v) => v.lng), ...points.map((p) => p.lng)]
    if (allLat.length === 0) return center
    const avgLat = allLat.reduce((s, v) => s + v, 0) / allLat.length
    const avgLng = allLng.reduce((s, v) => s + v, 0) / allLng.length
    return [avgLat, avgLng]
  }, [volunteers, points, center])

  return (
    <div className="overflow-hidden rounded-2xl border border-white/15">
      <MapContainer center={mapCenter} zoom={13} scrollWheelZoom style={{ height: 520, width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Líneas de los 4 cuadrantes, cruzando en `center` */}
        <Polyline
          positions={[
            [center[0], center[1] - LINE_SPAN],
            [center[0], center[1] + LINE_SPAN],
          ]}
          pathOptions={{ color: "#fbbf24", weight: 1.5, opacity: 0.6, dashArray: "6 6" }}
        />
        <Polyline
          positions={[
            [center[0] - LINE_SPAN, center[1]],
            [center[0] + LINE_SPAN, center[1]],
          ]}
          pathOptions={{ color: "#fbbf24", weight: 1.5, opacity: 0.6, dashArray: "6 6" }}
        />

        {/* Pin del cruce — arrastrable solo con permiso de escritura */}
        <Marker
          position={center}
          icon={CENTER_ICON}
          draggable={canMoveCenter}
          eventHandlers={
            canMoveCenter
              ? { dragend: (e) => onMoveCenter(e.target.getLatLng().lat, e.target.getLatLng().lng) }
              : undefined
          }
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">Centro de los 4 cuadrantes</p>
              {canMoveCenter && <p className="text-cream/70">Arrastrá este pin para moverlo.</p>}
            </div>
          </Popup>
        </Marker>

        {/* Voluntarios */}
        {volunteers.map((v) => (
          <CircleMarker
            key={`vol-${v.id}`}
            center={[v.lat, v.lng]}
            radius={7}
            pathOptions={{ color: "#1a1a1a", weight: 1.5, fillColor: "#60a5fa", fillOpacity: 0.9 }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{v.name}</p>
                {v.address && <p className="text-cream/70">{v.address}</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Puntos de operación */}
        {points.map((p) => (
          <CircleMarker
            key={`point-${p.id}`}
            center={[p.lat, p.lng]}
            radius={10}
            pathOptions={{
              color: "#1a1a1a",
              weight: 1.5,
              fillColor: OPERATIONAL_POINT_CATEGORY_COLOR[p.category],
              fillOpacity: p.active ? 0.95 : 0.35,
            }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold">{p.name}</p>
                <p>{OPERATIONAL_POINT_CATEGORY_LABEL[p.category]}</p>
                {p.address && <p className="text-cream/70">{p.address}</p>}
                {!p.active && <p className="text-orange">Inactivo</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}
