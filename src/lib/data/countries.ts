// ─── Country dataset (complete, static, zero API) ─────────────────────────────
// Data generated at build time from `world-countries` (all ~194 sovereign
// states, ISO 3166 alpha-2, flag emoji, alt spellings) → generated/countries.json.
// Every country on Earth is findable via search; the floating pills are the
// curated popular subset. Search is diacritic/space-insensitive, matches alt
// spellings ("Holland" → Netherlands), and is typo-tolerant ("Kazahstan").

import countriesData from './generated/countries.json'

export interface Country {
  name: string
  code: string   // ISO 3166-1 alpha-2
  flag: string   // emoji
  popular: boolean
  alt: string[]  // normalized alternate spellings for search
}

export const COUNTRIES: Country[] = countriesData as Country[]
export const POPULAR_COUNTRIES: Country[] = COUNTRIES.filter((c) => c.popular)

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]))
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

export function countryByName(name: string): Country | undefined {
  return BY_NAME.get(name.toLowerCase())
}
export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code)
}

// ── Fuzzy search helpers ──────────────────────────────────────────────────────
export const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
export const normalizeText = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()
export const compactText = (s: string) => normalizeText(s).replace(/[^a-z0-9]/g, '')
const norm = normalizeText
const compact = compactText

// Bounded Levenshtein distance (early-exits past `max`).
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// Lower score = better match; undefined = no match.
function scoreCountry(c: Country, q: string, qc: string): number | undefined {
  const name = norm(c.name)
  const nc = compact(c.name)
  if (name.startsWith(q) || nc.startsWith(qc)) return 0
  if (name.includes(q) || nc.includes(qc)) return 1
  if (c.alt.some((a) => a.startsWith(q))) return 2
  if (c.alt.some((a) => a.includes(q))) return 3
  // Typo tolerance on the name (whole + leading slice of the query's length).
  const max = qc.length <= 4 ? 1 : 2
  const d = Math.min(editDistance(qc, nc, max), editDistance(qc, nc.slice(0, qc.length), max))
  if (d <= max) return 4 + d
  return undefined
}

export function searchCountries(query: string, limit = 8): Country[] {
  const q = norm(query)
  const qc = compact(query)
  if (!qc) return []
  const scored: { c: Country; s: number }[] = []
  for (const c of COUNTRIES) {
    const s = scoreCountry(c, q, qc)
    if (s !== undefined) scored.push({ c, s })
  }
  scored.sort((a, b) => a.s - b.s || a.c.name.length - b.c.name.length || a.c.name.localeCompare(b.c.name))
  return scored.slice(0, limit).map((x) => x.c)
}
