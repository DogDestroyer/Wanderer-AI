// ─── Currency conversion utilities ────────────────────────────────────────────
// Fetches live EUR-based rates from Frankfurter (api.frankfurter.dev, ECB data,
// no API key required).  Falls back to hardcoded rates if the API is unreachable.
// All rates are stored as EUR = 1.0 so cross-pair math is: (amount / from) * to.

import type { Cost } from './types'

export type RatesMap = Record<string, number>

// ─── Hardcoded fallback rates (EUR = 1.0, approximate mid-market) ─────────────
export const FALLBACK_RATES: RatesMap = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.85,
  JPY: 163,
  AUD: 1.65,
  CAD: 1.47,
  SGD: 1.46,
  THB: 38.5,
  INR: 89.9,
  CNY: 7.8,
  KRW: 1450,
  HKD: 8.4,
  NZD: 1.78,
  MYR: 5.0,
  IDR: 17200,
  TWD: 34.5,
  VND: 27800,
  PHP: 61.5,
  AED: 3.97,
  CHF: 0.96,
  MXN: 20.5,
  BRL: 5.6,
  ZAR: 20.1,
  TRY: 35.0,
  SAR: 4.04,
}

export const RATES_TTL_MS = 24 * 60 * 60 * 1000  // 24 hours

// ─── API fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch latest EUR-based rates from Frankfurter.
 * Returns null on any failure — callers must fall back to FALLBACK_RATES.
 */
export async function fetchRates(): Promise<RatesMap | null> {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest', {
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = await res.json() as { base: string; rates: Record<string, number> }
    // Frankfurter returns EUR-based rates without EUR itself; add it explicitly
    return { EUR: 1, ...data.rates }
  } catch {
    return null
  }
}

// ─── Conversion helpers ───────────────────────────────────────────────────────

/**
 * Convert an amount from one ISO currency to another.
 * Falls back to returning the original amount if either currency is unknown
 * (avoids silent data corruption from missing rates).
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: RatesMap,
): number {
  const f = from.toUpperCase()
  const t = to.toUpperCase()
  if (f === t) return amount
  const fromRate = rates[f]
  const toRate = rates[t]
  if (!fromRate || !toRate) return amount   // unknown currency — return as-is
  // from → EUR → to
  return (amount / fromRate) * toRate
}

/**
 * Convert a Cost's amount to a target currency.
 */
export function convertCost(
  cost: Pick<Cost, 'amount' | 'currency'>,
  to: string,
  rates: RatesMap,
): number {
  return convertAmount(cost.amount, cost.currency, to, rates)
}

/**
 * Format a muted secondary hint like "~$17" or "~¥2,500".
 * Uses integer formatting since it is always an approximation.
 */
export function formatConvertedHint(amount: number, currency: string): string {
  const rounded = Math.round(amount)
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(rounded)
  } catch {
    return `${currency} ${rounded.toLocaleString()}`
  }
}
