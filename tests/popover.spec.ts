import { test, expect, type Page } from '@playwright/test'

// Assumption-chip editor popovers: anchored + collision-handled positioning,
// portalled above content, single-open, dismissal, and long-value truncation.

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
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 })
}

const LONG_BUDGET = 'SGD ~180-230/night hotel + SGD ~40-60/day food & attractions per person (~USD 130-170 pp/day all-in)'
const SEED = {
  id: 'trip_assume', name: 'Tokyo Trip',
  destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-18', budget: { cap: 5000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [], accommodation: 'mid-range' },
  days: [{ id: 'd1', date: '2026-09-15', activities: [
    { id: 'a1', title: 'Senso-ji', description: 'x', category: 'attraction', startTime: '10:00', endTime: '11:30', durationMinutes: 90, location: { name: 'Asakusa', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15, cost: { amount: 0, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false },
  ] }],
  suggestions: [],
  assumptions: [
    { field: 'partyType', label: 'Party', value: 'Couple', source: 'inferred' },
    { field: 'budget', label: 'Budget', value: LONG_BUDGET, source: 'inferred' },
    { field: 'pace', label: 'Pace', value: 'Balanced', source: 'preference' },
    { field: 'tripStyle', label: 'Style', value: 'City-focused', source: 'inferred' },
    { field: 'dates', label: 'Dates', value: 'Sep 2026', source: 'message' },
  ],
  createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
}

async function seed(page: Page) {
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] } }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Planned for:')).toBeVisible({ timeout: 15_000 })
}

test('long chip value truncates with a tooltip', async ({ page }) => {
  await loadApp(page)
  await seed(page)
  const budgetChip = page.locator('button', { hasText: 'Budget:' }).first()
  const info = await budgetChip.evaluate((el) => {
    const spans = [...el.querySelectorAll('span')]
    const valueSpan = spans[spans.length - 1] as HTMLElement
    return { chipWidth: el.clientWidth, valScroll: valueSpan.scrollWidth, valClient: valueSpan.clientWidth, title: el.getAttribute('title') }
  })
  expect(info.chipWidth, 'chip must be capped ~360px').toBeLessThanOrEqual(362)
  expect(info.valScroll, 'value must be truncated (overflowing)').toBeGreaterThan(info.valClient)
  expect(info.title, 'full text available in tooltip').toContain('per person')
})

test('popovers anchor in a portal, stay in viewport, and enforce single-open + dismissal', async ({ page }) => {
  await loadApp(page)
  await seed(page)

  const budgetChip = page.locator('button', { hasText: 'Budget:' }).first()
  await budgetChip.click()
  const pop = page.locator('[role="dialog"]')
  await expect(pop).toBeVisible()

  // Portalled out of the header (not clipped), and fully within the viewport.
  const geo = await pop.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight, inHeader: !!el.closest('header') }
  })
  expect(geo.inHeader, 'popover must be portalled, not inside the clipping header').toBe(false)
  expect(geo.left).toBeGreaterThanOrEqual(-1)
  expect(geo.top).toBeGreaterThanOrEqual(-1)
  expect(geo.right).toBeLessThanOrEqual(geo.vw + 1)
  expect(geo.bottom).toBeLessThanOrEqual(geo.vh + 1)
  // The full value is shown inside the editor (unique substring of the long value).
  await expect(pop.getByText(/180-230\/night/)).toBeVisible()

  // Esc closes.
  await page.keyboard.press('Escape')
  await expect(pop).toHaveCount(0)

  // Only one open at a time: opening Pace while Budget is open leaves exactly one.
  await budgetChip.click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(1)
  await page.locator('button', { hasText: 'Pace:' }).first().click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(1)

  // Outside click closes (the trip title is outside the popover and not a link).
  await page.getByRole('heading', { name: 'Tokyo Trip' }).click()
  await expect(page.locator('[role="dialog"]')).toHaveCount(0)
})

test('popover stays in viewport at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 720 })
  await loadApp(page)
  await seed(page)
  // On mobile the chat panel overlays the itinerary — close it so the chips show.
  await page.getByRole('button', { name: 'Close' }).click().catch(() => {})
  await expect(page.getByText('Planned for:')).toBeVisible()
  // The rightmost chip is most likely to overflow — open Dates.
  await page.locator('button', { hasText: 'Dates:' }).first().click()
  const pop = page.locator('[role="dialog"]')
  await expect(pop).toBeVisible()
  const box = await pop.boundingBox()
  expect(box, 'popover has a box').not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1)
})
