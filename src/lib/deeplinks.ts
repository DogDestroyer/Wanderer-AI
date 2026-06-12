// ─── Booking deep links ───────────────────────────────────────────────────────
// Build "Check price" URLs that open Agoda / Trip.com prefilled with the trip's
// search criteria (destination/property, check-in/out dates, guest count). These
// are best-effort search URLs — the providers' deep-link params are not formally
// versioned — so the unit tests assert URL CONSTRUCTION (correct host + encoded
// params), not third-party behaviour.

export type HotelProvider = 'agoda' | 'tripcom'
export type FlightProvider = 'tripcom'

export interface HotelDeepLinkParams {
  /** Property name (preferred) or just the city — used as the search text. */
  query: string
  checkIn: string   // YYYY-MM-DD
  checkOut: string  // YYYY-MM-DD
  adults?: number   // default 2
  provider?: HotelProvider // default 'agoda'
}

export interface FlightDeepLinkParams {
  originCode: string       // IATA, e.g. "SIN"
  destinationCode: string  // IATA, e.g. "TYO"
  departDate: string       // YYYY-MM-DD
  returnDate?: string      // YYYY-MM-DD — omit for one-way
  adults?: number          // default 2
  provider?: FlightProvider // default 'tripcom'
}

function isoDate(d: string): string {
  // Defensive: keep only the YYYY-MM-DD part if a full ISO timestamp slips in.
  return (d || '').slice(0, 10)
}

/** A "Check price" hotel search URL, prefilled with dates + guests. */
export function hotelDeepLink({
  query,
  checkIn,
  checkOut,
  adults = 2,
  provider = 'agoda',
}: HotelDeepLinkParams): string {
  const ci = isoDate(checkIn)
  const co = isoDate(checkOut)

  if (provider === 'tripcom') {
    const params = new URLSearchParams({
      keyword: query,
      checkin: ci,
      checkout: co,
      crn: '1',                 // 1 room
      adult: String(adults),
      children: '0',
    })
    return `https://www.trip.com/hotels/list?${params.toString()}`
  }

  // Agoda (default)
  const params = new URLSearchParams({
    textToSearch: query,
    checkIn: ci,
    checkOut: co,
    rooms: '1',
    adults: String(adults),
  })
  return `https://www.agoda.com/search?${params.toString()}`
}

/** A "Check price" flight search URL, prefilled with route + dates + guests. */
export function flightDeepLink({
  originCode,
  destinationCode,
  departDate,
  returnDate,
  adults = 2,
  provider = 'tripcom',
}: FlightDeepLinkParams): string {
  void provider // only Trip.com is supported today; param kept for forward-compat
  const from = originCode.toUpperCase()
  const to = destinationCode.toUpperCase()
  const params = new URLSearchParams({
    dcity: from,
    acity: to,
    ddate: isoDate(departDate),
    triptype: returnDate ? 'rt' : 'ow',
    class: 'y',
    quantity: String(adults),
  })
  if (returnDate) params.set('rdate', isoDate(returnDate))
  return `https://www.trip.com/flights/showfarefirst?${params.toString()}`
}
