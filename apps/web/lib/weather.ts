// Clima fijo para Mar del Plata (no la ubicación del voluntario) — así la
// barra superior no le pide permiso de GPS a nadie solo para mostrar un
// dato ambiental, y el número (clima de la ciudad) alcanza para el
// propósito: dimensionar cómo viene el día para trabajar en la calle.
// Open-Meteo no requiere API key.
const MDP_LAT = -38.0055
const MDP_LON = -57.5426

export interface WeatherNow {
  tempC: number
  emoji: string
}

// Códigos WMO de Open-Meteo simplificados a un emoji reconocible de un vistazo.
function emojiForCode(code: number): string {
  if (code === 0) return "☀️"
  if (code === 1 || code === 2) return "🌤️"
  if (code === 3) return "☁️"
  if (code === 45 || code === 48) return "🌫️"
  if (code >= 51 && code <= 57) return "🌦️"
  if (code >= 61 && code <= 67) return "🌧️"
  if (code >= 71 && code <= 77) return "🌨️"
  if (code >= 80 && code <= 82) return "🌧️"
  if (code >= 95) return "⛈️"
  return "🌡️"
}

export async function fetchMarDelPlataWeather(): Promise<WeatherNow | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${MDP_LAT}&longitude=${MDP_LON}&current=temperature_2m,weather_code&timezone=auto`,
    )
    if (!res.ok) return null
    const data = await res.json()
    const tempC = data?.current?.temperature_2m
    const code = data?.current?.weather_code
    if (typeof tempC !== "number") return null
    return { tempC: Math.round(tempC), emoji: emojiForCode(typeof code === "number" ? code : -1) }
  } catch {
    return null
  }
}
