'use client'

import type { TripLiveData, AccommodationType } from './types'

// ─── Live-prices client helper ────────────────────────────────────────────────
// Calls /api/live-prices and stamps a cache key. We always fetch in a STABLE
// base currency (USD) and convert for display via the rates converter, so a
// display-currency change never triggers a refetch — only destination, dates,
// origin, or accommodation level do (see liveDataKey).

export interface LivePriceParams {
  origin?: string | null   // flyingFrom
  destination: string      // city (may include ", Country")
  country: string
  startDate: string
  endDate: string
  accommodation: AccommodationType
  adults?: number
}

/** Stable cache key — intentionally excludes display currency. */
export function liveDataKey(p: LivePriceParams): string {
  return [p.origin || '', cleanCity(p.destination), p.startDate, p.endDate, p.accommodation].join('|')
}

export function cleanCity(name: string): string {
  return (name || '').split(',')[0].trim()
}

export async function fetchLivePrices(p: LivePriceParams): Promise<TripLiveData | null> {
  try {
    const res = await fetch('/api/live-prices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: cleanCity(p.destination),
        country: p.country,
        startDate: p.startDate,
        endDate: p.endDate,
        origin: p.origin ?? null,
        accommodation: p.accommodation,
        currency: 'USD',          // stable base; converted for display
        adults: p.adults ?? 2,
      }),
    })
    if (!res.ok) return null
    const { hotels, flight } = await res.json()
    return {
      fetchedAt: Date.now(),
      key: liveDataKey(p),
      flight: flight ?? null,
      hotels: Array.isArray(hotels) ? hotels : [],
    }
  } catch {
    return null
  }
}
