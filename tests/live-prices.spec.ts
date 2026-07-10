import { test, expect, type Page } from '@playwright/test'

// Live flight/hotel prices. Validates the live path when a provider key is
// configured (LITEAPI_API_KEY), and the graceful-degradation path either way.
// Resilient to environments without the key: it asserts correctness when hotels
// render, and "no crash" when they don't.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
const VERCEL_BYPASS = process.env.VERCEL_BYPASS ?? ''

async function grantBypass(page: Page) {
  if (!VERCEL_BYPASS) return
  const u = new URL(BASE_URL)
  u.searchParams.set('x-vercel-protection-bypass', VERCEL_BYPASS)
  u.searchParams.set('x-vercel-set-bypass-cookie', 'true')
  await page.goto(u.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {})
}

async function loadApp(page: Page) {
  await grantBypass(page)
  await page.goto(`${BASE_URL}/app`, { waitUntil: 'domcontentloaded' })
  if (page.url().includes('/login')) {
    if (!DEMO_PASSWORD) throw new Error(`${BASE_URL} is gated but no DEMO_PASSWORD provided`)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }
  // Fresh start now opens the new-trip wizard (the hero was removed); this test
  // seeds a trip and reloads right after, so just confirm the app is up.
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
}

const SEED = {
  id: 'trip_sgtyo', name: 'Singapore to Tokyo',
  destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-18',
  budget: { cap: 5000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 70, interests: ['food'], showLocalPrices: true, accommodation: 'luxury', flyingFrom: 'Singapore' },
  days: [
    { id: 'd1', date: '2026-09-15', activities: [
      { id: 'a1', title: 'Arrive Narita', description: 'x', category: 'transport', startTime: '09:00', endTime: '10:00', durationMinutes: 60, location: { name: 'Narita', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15, cost: { amount: 3000, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false },
    ] },
    { id: 'd2', date: '2026-09-16', activities: [
      { id: 'a2', title: 'teamLab', description: 'x', category: 'experience', startTime: '10:00', endTime: '12:00', durationMinutes: 120, location: { name: 'Toyosu', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15, cost: { amount: 3200, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false },
    ] },
  ],
  suggestions: [], createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
}

test('live hotel prices render, convert, deep-link, and cache across reload', async ({ page }) => {
  await loadApp(page)

  // Seed a Singapore→Tokyo trip and reload so the hook fetches live prices.
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] } }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })

  // Wait up to 20s for the live fetch to populate (or not, if no key).
  let hotelCount = 0
  for (let i = 0; i < 10; i++) {
    hotelCount = await page.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
        return s?.trips?.trip_sgtyo?.liveData?.hotels?.length ?? 0
      } catch { return 0 }
    })
    if (hotelCount > 0) break
    await page.waitForTimeout(2_000)
  }

  // App must be intact regardless.
  await expect(page.getByText('Singapore to Tokyo').first()).toBeVisible()

  if (hotelCount === 0) {
    console.log('\n[live-prices] No live hotels (LITEAPI_API_KEY not set here) — verifying graceful degradation only.\n')
    // Degradation: app renders, no crash, itinerary intact.
    await expect(page.getByText('teamLab').first()).toBeVisible()
    return
  }

  console.log(`\n[live-prices] ${hotelCount} live hotels fetched — verifying render/convert/deep-link/cache.\n`)

  // Hotel cards: real price displayed in the trip currency (SGD), with a deep link.
  const cards = page.locator('a').filter({ hasText: '/night' })
  await expect(cards.first()).toBeVisible({ timeout: 10_000 })
  const firstText = await cards.first().innerText()
  expect(firstText).toMatch(/SGD\s?\d/)            // converted to display currency
  const href = await cards.first().getAttribute('href')
  expect(href).toBeTruthy()
  expect(href!).toMatch(/agoda\.com|trip\.com/)
  expect(href!).toContain('2026-09-15')            // prefilled check-in date
  // "Live price" badge present (real, not estimate)
  await expect(page.getByText('Live price').first()).toBeVisible()

  // Cache: a reload must NOT refetch (key unchanged).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4_000)
  const refetches = await page.evaluate(() =>
    performance.getEntriesByType('resource').filter((r) => r.name.includes('/api/live-prices')).length,
  )
  expect(refetches, 'cached prices must survive reload without refetching').toBe(0)
  const hotelsAfter = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    return s?.trips?.trip_sgtyo?.liveData?.hotels?.length ?? 0
  })
  expect(hotelsAfter).toBe(hotelCount)

  // Degradation: provider down on a forced refresh → no crash, keeps last data.
  await page.route('**/api/live-prices', (route) => route.fulfill({ status: 500, body: 'down' }))
  await page.getByRole('button', { name: /refresh prices/i }).click().catch(() => {})
  await page.waitForTimeout(1_500)
  await expect(page.getByText('Singapore to Tokyo').first()).toBeVisible()
  await expect(page.getByText('teamLab').first()).toBeVisible()
})
