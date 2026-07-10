// ─── Static country dataset (no API, no AI) ───────────────────────────────────
// Powers the wizard's "Where would you like to go?" step: autocomplete over the
// full list + a curated set of popular countries as floating pills.
//
// Each entry: [name, ISO-3166 alpha-2 code, flag emoji, popular?]. `popular`
// flags the ~28 destinations shown as drifting pills. The list is intentionally
// broad (travel-relevant + all major nations) so autocomplete feels complete.

export interface Country {
  name: string
  code: string   // ISO 3166-1 alpha-2
  flag: string   // emoji
  popular: boolean
}

// Compact tuples keep this readable; expanded into objects below.
type Row = [string, string, string, boolean?]

const ROWS: Row[] = [
  ['Japan', 'JP', '🇯🇵', true],
  ['Italy', 'IT', '🇮🇹', true],
  ['France', 'FR', '🇫🇷', true],
  ['Spain', 'ES', '🇪🇸', true],
  ['Thailand', 'TH', '🇹🇭', true],
  ['United States', 'US', '🇺🇸', true],
  ['United Kingdom', 'GB', '🇬🇧', true],
  ['Greece', 'GR', '🇬🇷', true],
  ['Portugal', 'PT', '🇵🇹', true],
  ['Indonesia', 'ID', '🇮🇩', true],
  ['Vietnam', 'VN', '🇻🇳', true],
  ['Mexico', 'MX', '🇲🇽', true],
  ['Australia', 'AU', '🇦🇺', true],
  ['Turkey', 'TR', '🇹🇷', true],
  ['Germany', 'DE', '🇩🇪', true],
  ['Netherlands', 'NL', '🇳🇱', true],
  ['Switzerland', 'CH', '🇨🇭', true],
  ['India', 'IN', '🇮🇳', true],
  ['Singapore', 'SG', '🇸🇬', true],
  ['South Korea', 'KR', '🇰🇷', true],
  ['United Arab Emirates', 'AE', '🇦🇪', true],
  ['Morocco', 'MA', '🇲🇦', true],
  ['Croatia', 'HR', '🇭🇷', true],
  ['Iceland', 'IS', '🇮🇸', true],
  ['New Zealand', 'NZ', '🇳🇿', true],
  ['Egypt', 'EG', '🇪🇬', true],
  ['Peru', 'PE', '🇵🇪', true],
  ['Brazil', 'BR', '🇧🇷', true],
  // ── Broader list (autocomplete) ──
  ['Argentina', 'AR', '🇦🇷'],
  ['Austria', 'AT', '🇦🇹'],
  ['Belgium', 'BE', '🇧🇪'],
  ['Cambodia', 'KH', '🇰🇭'],
  ['Canada', 'CA', '🇨🇦'],
  ['Chile', 'CL', '🇨🇱'],
  ['China', 'CN', '🇨🇳'],
  ['Colombia', 'CO', '🇨🇴'],
  ['Costa Rica', 'CR', '🇨🇷'],
  ['Czech Republic', 'CZ', '🇨🇿'],
  ['Denmark', 'DK', '🇩🇰'],
  ['Ecuador', 'EC', '🇪🇨'],
  ['Estonia', 'EE', '🇪🇪'],
  ['Finland', 'FI', '🇫🇮'],
  ['Georgia', 'GE', '🇬🇪'],
  ['Hungary', 'HU', '🇭🇺'],
  ['Ireland', 'IE', '🇮🇪'],
  ['Israel', 'IL', '🇮🇱'],
  ['Jordan', 'JO', '🇯🇴'],
  ['Kenya', 'KE', '🇰🇪'],
  ['Laos', 'LA', '🇱🇦'],
  ['Latvia', 'LV', '🇱🇻'],
  ['Lithuania', 'LT', '🇱🇹'],
  ['Malaysia', 'MY', '🇲🇾'],
  ['Maldives', 'MV', '🇲🇻'],
  ['Malta', 'MT', '🇲🇹'],
  ['Nepal', 'NP', '🇳🇵'],
  ['Norway', 'NO', '🇳🇴'],
  ['Oman', 'OM', '🇴🇲'],
  ['Philippines', 'PH', '🇵🇭'],
  ['Poland', 'PL', '🇵🇱'],
  ['Qatar', 'QA', '🇶🇦'],
  ['Romania', 'RO', '🇷🇴'],
  ['Saudi Arabia', 'SA', '🇸🇦'],
  ['Slovenia', 'SI', '🇸🇮'],
  ['South Africa', 'ZA', '🇿🇦'],
  ['Sri Lanka', 'LK', '🇱🇰'],
  ['Sweden', 'SE', '🇸🇪'],
  ['Taiwan', 'TW', '🇹🇼'],
  ['Tanzania', 'TZ', '🇹🇿'],
  ['Tunisia', 'TN', '🇹🇳'],
  ['Ukraine', 'UA', '🇺🇦'],
  ['Uruguay', 'UY', '🇺🇾'],
]

export const COUNTRIES: Country[] = ROWS.map(([name, code, flag, popular]) => ({
  name, code, flag, popular: !!popular,
}))

export const POPULAR_COUNTRIES: Country[] = COUNTRIES.filter((c) => c.popular)

const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]))
const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]))

export function countryByName(name: string): Country | undefined {
  return BY_NAME.get(name.toLowerCase())
}
export function countryByCode(code: string): Country | undefined {
  return BY_CODE.get(code)
}

/** Case-insensitive prefix/substring search over country names, capped. */
export function searchCountries(query: string, limit = 8): Country[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: Country[] = []
  const contains: Country[] = []
  for (const c of COUNTRIES) {
    const n = c.name.toLowerCase()
    if (n.startsWith(q)) starts.push(c)
    else if (n.includes(q)) contains.push(c)
  }
  return [...starts, ...contains].slice(0, limit)
}
