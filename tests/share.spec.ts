import { test, expect, type Browser, type Page } from '@playwright/test'

// Read-only share links: create → copy → open in a FRESH context (incognito) →
// full itinerary renders with ZERO editing affordances, affiliate deep links
// verbatim, OG tags for unfurls, graceful 404, and creation rate limiting.

import { BASE_URL, loadApp } from './helpers/app'

const TRIP_ID = 'trip_share'
const act = (id: string, title: string, amt: number, bookingUrl?: string) => ({
  id, title, description: 'A lovely stop.', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
  cost: { amount: amt, currency: 'SGD', isEstimate: true }, locked: false, weatherSensitive: false,
  ...(bookingUrl ? { bookingUrl } : {}),
})
const SEED = {
  id: TRIP_ID, name: 'Shared Tokyo Adventure', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-16', budget: { cap: 2000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: ['food'], partyType: 'couple' },
  days: [
    { id: 'd1', date: '2026-09-15', dayTitle: 'Old Tokyo', activities: [act('a1', 'Senso-ji Temple', 10), act('a2', 'Ramen Alley', 30, 'https://www.trip.com/things?ref=abc&marker=hodo123')] },
    { id: 'd2', date: '2026-09-16', dayTitle: 'Modern Tokyo', activities: [act('b1', 'TeamLab Planets', 45)] },
  ],
  suggestions: [],
  liveData: {
    fetchedAt: 1, key: 'k', flight: null,
    hotels: [{ source: 'liteapi', hotelId: 'h1', name: 'Asakusa View Hotel', city: 'Tokyo', stars: 4, rating: 8.8, pricePerNight: 120, currency: 'USD', isEstimate: false, deepLink: 'https://www.agoda.com/search?textToSearch=Asakusa+View+Hotel&checkIn=2026-09-15&marker=hodo123' }],
  },
  createdAt: 'x', updatedAt: 'x',
}

async function seed(page: Page) {
  await loadApp(page)
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] }, guidanceSeen: true }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Shared Tokyo Adventure' })).toBeVisible({ timeout: 15_000 })
}

async function openFreshContext(browser: Browser, url: string): Promise<Page> {
  const ctx = await browser.newContext() // fresh profile — no cookies/localStorage
  const p = await ctx.newPage()
  // Vercel DEPLOYMENT PROTECTION (infra, not app auth) walls hash-URL deploys —
  // plant the bypass cookie for the shared link's origin. Real recipients use
  // the public production domain, which has no such wall.
  const bypass = process.env.VERCEL_BYPASS ?? ''
  if (bypass) {
    const u = new URL(url)
    u.pathname = '/'
    u.searchParams.set('x-vercel-protection-bypass', bypass)
    u.searchParams.set('x-vercel-set-bypass-cookie', 'true')
    await p.goto(u.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {})
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' })
  return p
}

test('share → open in incognito: read-only render, affiliate links, CTA', async ({ page, browser, context }) => {
  test.setTimeout(120_000)
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
  await seed(page)

  // Create the link; the copied URL is in the clipboard.
  const createRes = page.waitForResponse('**/api/share')
  await page.getByTestId('share-button').click()
  const status = (await createRes).status()
  // Live deployments without Blob enabled return 503 (graceful) — the full
  // flow is always covered against local prod via the in-memory fallback.
  test.skip(status === 503, 'share store not configured on this deployment (enable Vercel Blob)')
  await expect(page.getByText('Link copied — anyone can view this trip')).toBeVisible({ timeout: 10_000 })
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toMatch(/\/t\/[A-Za-z0-9_-]{12,}$/)

  // Open in a completely fresh context — no login, no app state.
  const shared = await openFreshContext(browser, url)

  // Full itinerary renders…
  await expect(shared.getByRole('heading', { name: 'Shared Tokyo Adventure' })).toBeVisible({ timeout: 15_000 })
  await expect(shared.getByTestId('shared-day')).toHaveCount(2)
  await expect(shared.getByText('Senso-ji Temple')).toBeVisible()
  await expect(shared.getByText('TeamLab Planets')).toBeVisible()
  await expect(shared.getByText(/Estimated total/)).toBeVisible()

  // …with ZERO editing affordances in the DOM.
  for (const sel of ['[data-coach="drag"]', '[data-coach="lock"]', '[aria-label="Edit activity"]',
                     '[data-testid="undo-button"]', '[data-testid="share-button"]', '[data-testid="day-quick-menu"]',
                     'textarea', '[data-coach="chat"]', '[data-testid="wizard"]']) {
    await expect(shared.locator(sel), `editing affordance leaked: ${sel}`).toHaveCount(0)
  }

  // Monetisation intact: deep links verbatim from the snapshot (marker present),
  // "Live price" label and the disclosure + CTA footer.
  await expect(shared.getByTestId('shared-hotel-link')).toHaveAttribute('href', /marker=hodo123/)
  await expect(shared.getByRole('link', { name: /Book/ })).toHaveAttribute('href', /marker=hodo123/)
  await expect(shared.getByText('Live price')).toBeVisible()
  await expect(shared.getByText(/may earn Hodo a commission/)).toBeVisible()
  await expect(shared.getByRole('link', { name: 'Plan your own trip' })).toHaveAttribute('href', '/')

  // Map tab renders (read-only Leaflet).
  await shared.getByRole('button', { name: 'map' }).click()
  await expect(shared.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 })

  // OG tags in the raw HTML (what WhatsApp/Telegram unfurl).
  const html = await (await shared.request.get(url)).text()
  expect(html).toContain('property="og:title"')
  expect(html).toContain('Shared Tokyo Adventure')
  expect(html).toMatch(/og:description[^>]+Tokyo, Japan/)

  await shared.context().close()
})

test('unknown id shows the graceful not-found page', async ({ browser }) => {
  const p = await openFreshContext(browser, `${BASE_URL}/t/nope12345678`)
  await expect(p.getByText("This trip link doesn't exist")).toBeVisible({ timeout: 15_000 })
  await expect(p.getByRole('link', { name: /Plan your own trip/ })).toBeVisible()
  await p.context().close()
})

test('rapid link creation is rate limited', async ({ page }) => {
  await seed(page)
  // Fire creations via the API directly (same IP); limit is 5/10min.
  const codes: number[] = []
  for (let i = 0; i < 7; i++) {
    const res = await page.request.post(`${BASE_URL}/api/share`, { data: SEED })
    codes.push(res.status())
  }
  expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(5)
  expect(codes).toContain(429)
})
