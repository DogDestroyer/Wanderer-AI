'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { fetchRates, FALLBACK_RATES, RATES_TTL_MS, type RatesMap } from '@/lib/currency'

/**
 * Returns the current EUR-based exchange rates.
 *
 * On mount, fetches from Frankfurter if rates are absent or older than 24 h.
 * Falls back to hardcoded FALLBACK_RATES if the API is unreachable.
 * Rates are stored in Zustand (not persisted) so a page reload triggers a fresh
 * fetch, but subsequent renders within the same session reuse the cached values.
 */
export function useExchangeRates(): RatesMap {
  const exchangeRates  = useStore((s) => s.exchangeRates)
  const ratesTimestamp = useStore((s) => s.ratesTimestamp)
  const setExchangeRates = useStore((s) => s.setExchangeRates)

  useEffect(() => {
    const now = Date.now()
    if (exchangeRates && ratesTimestamp && now - ratesTimestamp < RATES_TTL_MS) return
    fetchRates().then((rates) => {
      if (rates) setExchangeRates(rates, Date.now())
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // intentionally run once per mount

  return exchangeRates ?? FALLBACK_RATES
}
