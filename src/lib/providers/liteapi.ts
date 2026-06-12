// ─── liteAPI hotel adapter (server-side) ──────────────────────────────────────
// Real nightly hotel rates by city + dates, filtered by accommodation level.
// Degrades gracefully: returns [] on any failure / missing key so the caller
// falls back to AI estimates. NEVER throws to the route.

import type { HotelOffer, AccommodationType } from '@/lib/types'
import { hotelDeepLink } from '@/lib/deeplinks'

const BASE = 'https://api.liteapi.travel/v3.0'

// Map our accommodation preference to a liteAPI star range.
const STARS_FOR_LEVEL: Record<AccommodationType, number[]> = {
  hostel:      [1, 2],
  'mid-range': [3],
  boutique:    [4],
  luxury:      [5],
}

// Minimal country-name → ISO-3166 alpha-2 for the destinations we target.
const COUNTRY_ISO: Record<string, string> = {
  japan: 'JP', singapore: 'SG', thailand: 'TH', 'south korea': 'KR', korea: 'KR',
  china: 'CN', 'hong kong': 'HK', taiwan: 'TW', indonesia: 'ID', malaysia: 'MY',
  vietnam: 'VN', philippines: 'PH', india: 'IN', 'united states': 'US', usa: 'US',
  'united kingdom': 'GB', uk: 'GB', france: 'FR', italy: 'IT', spain: 'ES',
  germany: 'DE', netherlands: 'NL', switzerland: 'CH', australia: 'AU',
  'new zealand': 'NZ', 'united arab emirates': 'AE', uae: 'AE', canada: 'CA',
  mexico: 'MX', brazil: 'BR', portugal: 'PT', greece: 'GR', turkey: 'TR',
}

export function countryToIso(country: string | undefined): string | null {
  if (!country) return null
  const key = country.trim().toLowerCase()
  if (COUNTRY_ISO[key]) return COUNTRY_ISO[key]
  // Already a 2-letter code?
  if (/^[A-Za-z]{2}$/.test(country.trim())) return country.trim().toUpperCase()
  return null
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(checkin + 'T00:00:00').getTime()
  const b = new Date(checkout + 'T00:00:00').getTime()
  const n = Math.round((b - a) / 86_400_000)
  return n > 0 ? n : 1
}

interface LiteHotel {
  id: string; name: string; city: string; stars?: number; rating?: number
  main_photo?: string; thumbnail?: string; currency?: string
}

export interface SearchHotelsParams {
  city: string
  country: string
  checkin: string   // YYYY-MM-DD
  checkout: string  // YYYY-MM-DD
  accommodation: AccommodationType
  currency: string
  adults?: number
}

export async function searchHotels(p: SearchHotelsParams): Promise<HotelOffer[]> {
  const key = process.env.LITEAPI_API_KEY
  if (!key) return [] // no key → caller falls back to estimates

  const countryCode = countryToIso(p.country)
  if (!countryCode) return []

  const headers = { 'X-API-Key': key, 'Content-Type': 'application/json', accept: 'application/json' }
  const nights = nightsBetween(p.checkin, p.checkout)
  const adults = p.adults ?? 2

  try {
    // 1) Static hotel list for the city
    const listUrl = `${BASE}/data/hotels?countryCode=${countryCode}&cityName=${encodeURIComponent(p.city)}&limit=40`
    const listRes = await fetch(listUrl, { headers, signal: AbortSignal.timeout(8000) })
    if (!listRes.ok) return []
    const hotels: LiteHotel[] = (await listRes.json())?.data ?? []
    if (hotels.length === 0) return []

    // 2) Filter by accommodation star level (relax to all if too few)
    const wantStars = STARS_FOR_LEVEL[p.accommodation] ?? [3]
    let candidates = hotels.filter((h) => h.stars != null && wantStars.includes(h.stars))
    if (candidates.length < 3) candidates = hotels
    const byId = new Map(candidates.map((h) => [h.id, h]))
    const hotelIds = candidates.slice(0, 25).map((h) => h.id)

    // 3) Live rates for those hotels
    const ratesRes = await fetch(`${BASE}/hotels/rates`, {
      method: 'POST', headers,
      body: JSON.stringify({
        hotelIds, checkin: p.checkin, checkout: p.checkout,
        occupancies: [{ adults }], currency: p.currency, guestNationality: 'US',
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!ratesRes.ok) return []
    const rated: Array<{ hotelId: string; roomTypes?: Array<{ offerRetailRate?: { amount: number; currency: string } }> }> =
      (await ratesRes.json())?.data ?? []

    const offers: HotelOffer[] = []
    for (const r of rated) {
      const hotel = byId.get(r.hotelId)
      if (!hotel) continue
      // cheapest offer across room types → per-night
      const amounts = (r.roomTypes ?? [])
        .map((rt) => rt.offerRetailRate?.amount)
        .filter((a): a is number => typeof a === 'number' && a > 0)
      if (amounts.length === 0) continue
      const stayTotal = Math.min(...amounts)
      const perNight = Math.round(stayTotal / nights)
      offers.push({
        source: 'liteapi',
        hotelId: hotel.id,
        name: hotel.name,
        city: p.city,
        stars: hotel.stars,
        rating: hotel.rating,
        pricePerNight: perNight,
        currency: p.currency,
        photo: hotel.main_photo ?? hotel.thumbnail,
        isEstimate: false,
        deepLink: hotelDeepLink({ query: hotel.name, checkIn: p.checkin, checkOut: p.checkout, adults }),
      })
    }

    // Best-rated first, then cheapest; cap the shortlist.
    offers.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.pricePerNight - b.pricePerNight)
    return offers.slice(0, 8)
  } catch {
    return [] // timeout / network / shape change → graceful fallback
  }
}
