import type { AccommodationType } from '@/lib/types'
import { searchHotels } from '@/lib/providers/liteapi'
import { searchFlight } from '@/lib/providers/travelpayouts'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'

// Hotel rates can take ~15s; give headroom but stay modest.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/live-prices — provider-agnostic wrapper for live flight + hotel data.
// Always returns 200 with whatever it could fetch ({} pieces null/empty on
// failure) so the client never breaks; the caller falls back to AI estimates.
export async function POST(request: Request): Promise<Response> {
  const rl = rateLimit(`prices:${clientIp(request)}`, 20, 5 * 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfterMs)

  let body: {
    destination?: string
    country?: string
    startDate?: string
    endDate?: string
    origin?: string | null
    accommodation?: AccommodationType
    currency?: string
    adults?: number
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ hotels: [], flight: null })
  }

  const {
    destination, country, startDate, endDate,
    origin, accommodation = 'mid-range', currency = 'USD', adults = 2,
  } = body

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
  if (!destination || !startDate || !endDate || !ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) {
    return Response.json({ hotels: [], flight: null })
  }

  // Fetch both providers in parallel; each degrades to []/null on its own.
  const [hotels, flight] = await Promise.all([
    searchHotels({
      city: destination, country: country ?? '', checkin: startDate, checkout: endDate,
      accommodation, currency, adults,
    }).catch(() => []),
    origin
      ? searchFlight({ origin, destination, departDate: startDate, returnDate: endDate, currency, adults }).catch(() => null)
      : Promise.resolve(null),
  ])

  return Response.json({ hotels, flight })
}
