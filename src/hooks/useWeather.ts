'use client'

import { useEffect, useRef } from 'react'
import type { TripPlan } from '@/lib/types'
import { useStore } from '@/lib/store'
import { fetchTripWeather } from '@/lib/weather'

// Fetches Open-Meteo forecast for the active trip and writes it into the store.
// Results are cached by `tripId::startDate::endDate` so re-renders and tab
// switches don't trigger redundant network calls.

export function useWeather(trip: TripPlan | null) {
  const updateTripWeather = useStore((s) => s.updateTripWeather)
  const fetched = useRef(new Set<string>())

  useEffect(() => {
    if (!trip) return

    const key = `${trip.id}::${trip.startDate}::${trip.endDate}`
    if (fetched.current.has(key)) return
    fetched.current.add(key)

    fetchTripWeather(trip)
      .then((weatherMap) => {
        if (Object.keys(weatherMap).length > 0) {
          updateTripWeather(trip.id, weatherMap)
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[useWeather] skipped —', msg)
        fetched.current.delete(key) // allow retry on next mount
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, trip?.startDate, trip?.endDate])
}
