// ─── Travelpayouts (Aviasales) flight adapter (server-side) ───────────────────
// Indicative flight prices (cached aggregates) for an origin→destination on the
// trip dates. Degrades gracefully: returns null on any failure / missing token
// so the caller falls back to an AI estimate. NEVER throws to the route.

import type { FlightOffer } from '@/lib/types'
import { flightDeepLink } from '@/lib/deeplinks'

const BASE = 'https://api.travelpayouts.com/aviasales/v3'

// City / airport name → IATA. flyingFrom / destination may already be a 3-letter
// code, in which case we use it directly.
const CITY_IATA: Record<string, string> = {
  singapore: 'SIN', tokyo: 'TYO', osaka: 'OSA', kyoto: 'OSA', bangkok: 'BKK',
  seoul: 'SEL', 'hong kong': 'HKG', taipei: 'TPE', bali: 'DPS', denpasar: 'DPS',
  'kuala lumpur': 'KUL', jakarta: 'JKT', manila: 'MNL', 'ho chi minh city': 'SGN',
  hanoi: 'HAN', 'new delhi': 'DEL', delhi: 'DEL', mumbai: 'BOM', dubai: 'DXB',
  london: 'LON', paris: 'PAR', 'new york': 'NYC', 'los angeles': 'LAX',
  sydney: 'SYD', melbourne: 'MEL', amsterdam: 'AMS', rome: 'ROM', barcelona: 'BCN',
  madrid: 'MAD', frankfurt: 'FRA', zurich: 'ZRH', shanghai: 'SHA', beijing: 'BJS',
}

export function resolveIata(place: string | undefined): string | null {
  if (!place) return null
  const trimmed = place.trim()
  // Already an IATA code?
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase()
  // Take the first token before a comma ("Tokyo, Japan" → "Tokyo")
  const cityKey = trimmed.split(',')[0].trim().toLowerCase()
  return CITY_IATA[cityKey] ?? null
}

export interface SearchFlightParams {
  origin: string        // city name or IATA
  destination: string   // city name or IATA
  departDate: string    // YYYY-MM-DD
  returnDate?: string
  currency: string
  adults?: number
}

interface TpFlight {
  origin: string; destination: string; price: number; airline?: string
  departure_at?: string; return_at?: string; link?: string
}

export async function searchFlight(p: SearchFlightParams): Promise<FlightOffer | null> {
  const token = process.env.TRAVELPAYOUTS_TOKEN
  if (!token) return null // no token → caller falls back to an estimate

  const origin = resolveIata(p.origin)
  const destination = resolveIata(p.destination)
  if (!origin || !destination) return null

  const adults = p.adults ?? 2
  try {
    const params = new URLSearchParams({
      origin, destination,
      departure_at: p.departDate,
      currency: p.currency.toLowerCase(),
      sorting: 'price',
      direct: 'false',
      limit: '1',
      token,
    })
    if (p.returnDate) params.set('return_at', p.returnDate)

    const res = await fetch(`${BASE}/prices_for_dates?${params.toString()}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = await res.json()
    const flight: TpFlight | undefined = json?.data?.[0]
    if (!flight || typeof flight.price !== 'number') return null

    return {
      source: 'travelpayouts',
      originCode: origin,
      destinationCode: destination,
      departDate: p.departDate,
      returnDate: p.returnDate,
      price: Math.round(flight.price),
      currency: p.currency.toUpperCase(),
      airline: flight.airline,
      isIndicative: true,   // cached aggregate — verify via the deep link
      isEstimate: false,
      deepLink: flightDeepLink({
        originCode: origin, destinationCode: destination,
        departDate: p.departDate, returnDate: p.returnDate, adults,
      }),
    }
  } catch {
    return null
  }
}
