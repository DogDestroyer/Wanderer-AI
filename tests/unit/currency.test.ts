import { describe, it, expect } from 'vitest'
import { convertAmount, convertCost, FALLBACK_RATES, COMMON_CURRENCIES } from '@/lib/currency'

describe('convertAmount', () => {
  const rates = { EUR: 1, USD: 2, JPY: 200 } // 1 EUR = 2 USD = 200 JPY

  it('is identity for same currency', () => {
    expect(convertAmount(123, 'USD', 'USD', rates)).toBe(123)
  })
  it('converts through the EUR base', () => {
    expect(convertAmount(200, 'JPY', 'USD', rates)).toBe(2) // ¥200 → €1 → $2
    expect(convertAmount(2, 'USD', 'JPY', rates)).toBe(200)
  })
  it('is case-insensitive on codes', () => {
    expect(convertAmount(200, 'jpy', 'usd', rates)).toBe(2)
  })
  it('returns the amount unchanged for unknown currencies (no silent corruption)', () => {
    expect(convertAmount(500, 'XXX', 'USD', rates)).toBe(500)
    expect(convertAmount(500, 'USD', 'XXX', rates)).toBe(500)
  })
})

describe('convertCost', () => {
  it('delegates to convertAmount using the cost currency', () => {
    const rates = { EUR: 1, USD: 2 }
    expect(convertCost({ amount: 4, currency: 'USD' }, 'EUR', rates)).toBe(2)
  })
})

describe('rate-table invariants', () => {
  it('every picker currency has a fallback rate (conversion always works offline)', () => {
    for (const code of COMMON_CURRENCIES) {
      expect(FALLBACK_RATES[code], `missing fallback rate for ${code}`).toBeGreaterThan(0)
    }
  })
})
