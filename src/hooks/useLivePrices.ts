'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import type { TripPlan } from '@/lib/types'
import { liveDataKey, fetchLivePrices, type LivePriceParams } from '@/lib/livePrices'

// ─── useLivePrices ────────────────────────────────────────────────────────────
// Fetches live flight + hotel prices for a trip and caches them in trip state.
// Per the quota rules it fetches ONLY when destination / dates / origin /
// accommodation change (the cache key), never per chat message; a manual
// refresh() forces a refetch. The cached data is keyed so an unchanged trip
// re-uses it across reloads (it's persisted on the trip).

export function useLivePrices(trip: TripPlan | null) {
  const setTripLiveData = useStore((s) => s.setTripLiveData)
  const [loading, setLoading] = useState(false)
  const inFlightKey = useRef<string | null>(null)

  const params: LivePriceParams | null = trip
    ? {
        origin: trip.preferences?.flyingFrom,
        destination: trip.destination.name,
        country: trip.destination.country,
        startDate: trip.startDate,
        endDate: trip.endDate,
        accommodation: trip.preferences?.accommodation ?? 'mid-range',
      }
    : null
  const currentKey = params ? liveDataKey(params) : null

  const run = useCallback(
    async (force: boolean) => {
      if (!trip || !params || !currentKey) return
      // Cache hit — params unchanged since last fetch.
      if (!force && trip.liveData?.key === currentKey) return
      // De-dupe concurrent fetches for the same key.
      if (inFlightKey.current === currentKey && !force) return
      inFlightKey.current = currentKey
      setLoading(true)
      const data = await fetchLivePrices(params)
      setLoading(false)
      inFlightKey.current = null
      if (data) setTripLiveData(trip.id, data)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip?.id, currentKey],
  )

  // Auto-fetch when the cache key changes (destination/dates/origin/accommodation).
  useEffect(() => {
    run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

  return { loading, refresh: () => run(true) }
}
