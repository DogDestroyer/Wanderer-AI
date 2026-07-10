/**
 * Prebuild step. Runs before `next dev` and `next build`.
 *
 *  1. Next.js 16 does not allow both middleware.ts and proxy.ts in src/. We use a
 *     route-group layout for auth, so we delete the empty middleware.ts stub.
 *  2. Generate the wizard's static datasets from bundled, GeoNames/ISO-derived
 *     packages (zero runtime API calls):
 *       - countries: all ~194 sovereign states (world-countries) + alt spellings
 *       - cities:    every city with population ≥ 100k (all-the-cities), merged
 *                    with a curated tourism overlay, with country/lat/lng/pop
 *     Outputs are written to src/lib/data/generated/ and committed so type-checks
 *     resolve without a build. Generation is deterministic (packages are pinned).
 */
import { unlinkSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// ── 1. Remove the middleware stub ─────────────────────────────────────────────
const stub = join(root, 'src', 'middleware.ts')
if (existsSync(stub)) {
  unlinkSync(stub)
  console.log('✓ Removed src/middleware.ts (superseded by proxy.ts convention)')
}

// ── helpers ───────────────────────────────────────────────────────────────────
const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()
const isLatin = (s) => /^[a-z0-9 .'’()-]+$/.test(s)
const outDir = join(root, 'src', 'lib', 'data', 'generated')
mkdirSync(outDir, { recursive: true })

// The datasets below are regenerated from dev-only packages. If those packages
// aren't installed (e.g. a production-only install), we skip generation and rely
// on the committed generated/*.json — so the build never fails on this step.
let worldCountries, allCities
try {
  worldCountries = require('world-countries')
  allCities = require('all-the-cities')
} catch (err) {
  console.log(`↷ Skipping dataset generation (using committed files): ${err.message}`)
}

if (worldCountries && allCities) {
  await generateDatasets(worldCountries, allCities)
}

async function generateDatasets(worldCountries, allCities) {
// ── 2a. Countries ─────────────────────────────────────────────────────────────

// ~24 popular destinations shown as floating pills.
const POPULAR = new Set([
  'JP', 'IT', 'FR', 'ES', 'TH', 'US', 'GB', 'GR', 'PT', 'ID', 'VN', 'MX', 'AU',
  'TR', 'DE', 'NL', 'CH', 'IN', 'SG', 'KR', 'AE', 'MA', 'HR', 'IS', 'NZ', 'EG', 'PE', 'BR',
])

// Common informal names not always in altSpellings.
const MANUAL_ALTS = {
  US: ['usa', 'america', 'united states of america', 'the states'],
  GB: ['uk', 'britain', 'great britain', 'england'],
  AE: ['uae', 'emirates'],
  KR: ['korea', 'south korea'],
  KP: ['north korea'],
  CZ: ['czechia'],
  MM: ['burma'],
  NL: ['holland'],
  CI: ['ivory coast'],
  CD: ['drc', 'congo kinshasa'],
  CG: ['congo brazzaville'],
  TR: ['turkiye'],
  MK: ['macedonia'],
  SZ: ['swaziland'],
  TL: ['east timor'],
  LA: ['laos'],
  RU: ['russian federation'],
  SY: ['syrian arab republic'],
  VN: ['viet nam'],
}

const countries = worldCountries
  .filter((c) => c.independent || c.unMember)
  .map((c) => {
    const name = c.name.common
    const code = c.cca2
    const altSet = new Set()
    const add = (v) => { const n = norm(v); if (n && n !== norm(name) && n.length > 1 && isLatin(n)) altSet.add(n) }
    ;(c.altSpellings ?? []).forEach(add)
    if (c.name.official) add(c.name.official)
    ;(MANUAL_ALTS[code] ?? []).forEach(add)
    return { name, code, flag: c.flag, popular: POPULAR.has(code), alt: [...altSet] }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

writeFileSync(join(outDir, 'countries.json'), JSON.stringify(countries))
console.log(`✓ Generated ${countries.length} countries → generated/countries.json`)

// ── 2b. Cities ────────────────────────────────────────────────────────────────
const { CURATED_CITIES } = await import('./curated-cities.mjs')

const POP_MIN = 100_000
const round = (n) => Math.round(n * 1000) / 1000

// Dedup key: country + normalized name. Keep the highest-population instance.
const byKey = new Map()
function upsert(rec) {
  const key = rec.code + '|' + norm(rec.name)
  const cur = byKey.get(key)
  if (!cur || rec.pop > cur.pop || (rec.gem && !cur.gem)) {
    byKey.set(key, { ...cur, ...rec, gem: rec.gem || cur?.gem || false })
  }
}

// Base: every city at or above the population threshold.
for (const c of allCities) {
  if (c.population < POP_MIN) continue
  const [lng, lat] = c.loc.coordinates
  upsert({ name: c.name, code: c.country, lat: round(lat), lng: round(lng), pop: c.population, gem: false })
}

// Index all-the-cities by country+normalized-name for curated lookups.
const cityIndex = new Map()
for (const c of allCities) {
  const key = c.country + '|' + norm(c.name)
  const cur = cityIndex.get(key)
  if (!cur || c.population > cur.population) cityIndex.set(key, c)
}

// Curated tourism overlay: guarantee famous towns exist and rank as gems.
let curatedAdded = 0
for (const [code, names] of Object.entries(CURATED_CITIES)) {
  for (const name of names) {
    const hit = cityIndex.get(code + '|' + norm(name))
    if (hit) {
      const [lng, lat] = hit.loc.coordinates
      upsert({ name, code, lat: round(lat), lng: round(lng), pop: hit.population, gem: true })
    } else {
      upsert({ name, code, lat: null, lng: null, pop: 0, gem: true })
      curatedAdded++
    }
  }
}

const cities = [...byKey.values()]
writeFileSync(join(outDir, 'cities.json'), JSON.stringify(cities))
console.log(`✓ Generated ${cities.length} cities (${curatedAdded} curated-only) → generated/cities.json`)
}
