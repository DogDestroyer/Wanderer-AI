import type { TripPlan, WeatherForecast, WeatherCondition } from './types'

// ─── WMO weather code → our condition type ────────────────────────────────────

const WMO_CONDITION: Record<number, WeatherCondition> = {
  0: 'sunny',
  1: 'sunny',   2: 'partly-cloudy', 3: 'cloudy',
  45: 'cloudy', 48: 'cloudy',
  51: 'rainy',  53: 'rainy',  55: 'rainy',
  61: 'rainy',  63: 'rainy',  65: 'rainy',
  66: 'rainy',  67: 'rainy',
  71: 'snowy',  73: 'snowy',  75: 'snowy',  77: 'snowy',
  80: 'rainy',  81: 'rainy',  82: 'rainy',
  85: 'snowy',  86: 'snowy',
  95: 'stormy', 96: 'stormy', 99: 'stormy',
}

const WMO_DESCRIPTION: Record<number, string> = {
  0:  'Clear sky',
  1:  'Mainly clear',    2: 'Partly cloudy',     3: 'Overcast',
  45: 'Foggy',          48: 'Icy fog',
  51: 'Light drizzle',  53: 'Drizzle',           55: 'Heavy drizzle',
  61: 'Light rain',     63: 'Moderate rain',     65: 'Heavy rain',
  66: 'Freezing rain',  67: 'Heavy freezing rain',
  71: 'Light snow',     73: 'Moderate snow',     75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',  81: 'Showers',           82: 'Heavy showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm',   96: 'Thunderstorm + hail', 99: 'Severe thunderstorm',
}

// ─── fetchTripWeather ─────────────────────────────────────────────────────────
// Calls the Open-Meteo forecast API (free, no key, CORS-enabled) and returns a
// Record of day ID → WeatherForecast for every day in the trip that falls within
// the 16-day forecast window.  Returns {} silently when dates are out of range.

export async function fetchTripWeather(
  trip: TripPlan
): Promise<Record<string, WeatherForecast>> {
  const { destination, days } = trip
  if (!days.length) return {}
  // Guard: skip if destination has no meaningful coordinates
  if (destination.lat === 0 && destination.lng === 0) return {}

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const startDate = sorted[0].date
  const endDate = sorted[sorted.length - 1].date

  const params = new URLSearchParams({
    latitude:  String(destination.lat),
    longitude: String(destination.lng),
    daily: [
      'weathercode',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'windspeed_10m_max',
    ].join(','),
    start_date: startDate,
    end_date:   endDate,
    timezone:   'auto',
    // Note: forecast_days is mutually exclusive with start_date/end_date
  })

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)

  const data = await res.json()

  // Open-Meteo omits the daily key when no dates fall in the forecast window
  if (!data.daily?.time?.length) return {}

  const {
    time,
    weathercode,
    temperature_2m_max,
    temperature_2m_min,
    precipitation_probability_max,
    windspeed_10m_max,
  } = data.daily as Record<string, number[]>

  // Build date-string → forecast lookup
  const byDate: Record<string, WeatherForecast> = {}
  for (let i = 0; i < time.length; i++) {
    const code = weathercode[i] ?? 0
    byDate[time[i]] = {
      tempHighC: Math.round(temperature_2m_max[i] ?? 0),
      tempLowC:  Math.round(temperature_2m_min[i] ?? 0),
      condition: WMO_CONDITION[code] ?? 'partly-cloudy',
      precipitationProbability: precipitation_probability_max[i] ?? 0,
      windSpeedKph: Math.round(windspeed_10m_max[i] ?? 0),
      description: WMO_DESCRIPTION[code] ?? 'Unknown',
    }
  }

  // Map day IDs → WeatherForecast
  const result: Record<string, WeatherForecast> = {}
  for (const day of days) {
    if (byDate[day.date]) result[day.id] = byDate[day.date]
  }
  return result
}
