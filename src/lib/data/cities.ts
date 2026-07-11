// ─── World cities dataset (static, GeoNames-derived, zero API) ────────────────
// Data generated at build time from `all-the-cities` (every city ≥100k pop) +
// a curated tourism overlay → generated/cities.json. Each record carries its
// country (ISO2), lat/lng, population and a `gem` flag (curated tourism town).
//
// Grid = top ~20 of the selected countries by population/tourism relevance.
// Search covers the full dataset, but is CONSTRAINED to the selected countries
// (the step-1 bug: selecting China must not surface Chicago or Chiang Mai).

import citiesData from './generated/cities.json'
import { countryByCode } from './countries'
import { compactText, editDistance } from './fuzzy'

interface RawCity { name: string; code: string; lat: number | null; lng: number | null; pop: number; gem: boolean }
const CITIES = citiesData as RawCity[]

export interface WizardCityHit { name: string; country: string; code: string; gem?: boolean }

// Ranking score: gems always float above raw-population entries.
const score = (c: RawCity) => (c.gem ? 1e12 : 0) + c.pop

// Index by country, pre-sorted by score (desc) for fast top-N grids.
const BY_COUNTRY = new Map<string, RawCity[]>()
for (const c of CITIES) {
  const list = BY_COUNTRY.get(c.code)
  if (list) list.push(c)
  else BY_COUNTRY.set(c.code, [c])
}
for (const list of BY_COUNTRY.values()) list.sort((a, b) => score(b) - score(a))

const toHit = (c: RawCity): WizardCityHit => ({ name: c.name, country: countryByCode(c.code)?.name ?? '', code: c.code, gem: c.gem })

/** Grid source: the top ~20 cities for each selected country (by score). */
export function citiesForCountries(codes: string[], perCountry = 20): WizardCityHit[] {
  const out: WizardCityHit[] = []
  const seen = new Set<string>()
  for (const code of codes) {
    for (const c of (BY_COUNTRY.get(code) ?? []).slice(0, perCountry)) {
      const key = `${c.name}|${code}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(toHit(c))
    }
  }
  return out
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search the full dataset. When `codes` is non-empty the search is constrained
 * to those countries — this is what keeps the step-1 country filter honest.
 */
export function searchCities(query: string, codes: string[] = [], limit = 10): WizardCityHit[] {
  const qc = compactText(query)
  if (!qc) return []
  const codeSet = codes.length ? new Set(codes) : null
  const max = qc.length <= 4 ? 1 : 2
  const scored: { c: RawCity; rank: number }[] = []
  for (const c of CITIES) {
    if (codeSet && !codeSet.has(c.code)) continue
    const nc = compactText(c.name)
    let rank: number
    if (nc.startsWith(qc)) rank = 0
    else if (nc.includes(qc)) rank = 1
    else if (editDistance(qc, nc.slice(0, qc.length), max) <= max) rank = 2
    else continue
    // Prefer better textual rank, then gems, then population.
    scored.push({ c, rank: rank * 1e13 - score(c) })
  }
  scored.sort((a, b) => a.rank - b.rank)
  return scored.slice(0, limit).map((x) => toHit(x.c))
}

// ── Global popular cities (shown only when step 1 was skipped) ─────────────────
export const POPULAR_CITIES: WizardCityHit[] = CITIES
  .filter((c) => c.gem)
  .sort((a, b) => b.pop - a.pop)
  .slice(0, 24)
  .map(toHit)
