import { test, expect, type Page } from '@playwright/test'

// Export + day titles + Checklist/Reservations tabs — all client-side, ZERO AI.
// Guards the hard constraint: no /api/chat calls during any of it.

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
    if (!DEMO_PASSWORD) throw new Error(`${BASE_URL} gated but no DEMO_PASSWORD`)
    await page.fill('input[type="password"]', DEMO_PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL('**/app', { timeout: 15_000 })
  }
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 15_000 })
}

const act = (id: string, title: string, category: string, s: string, e: string, loc: string, amt: number) => ({
  id, title, description: 'x', category, startTime: s, endTime: e, durationMinutes: 60,
  location: { name: loc, lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 0,
  cost: { amount: amt, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
})

// LEGACY trip: days have NO dayTitle → titles must derive locally (no AI).
const SEED = {
  id: 'trip_feat', name: 'Tokyo Explorer',
  destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-16', budget: { cap: 5000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [], accommodation: 'mid-range', partyType: 'couple' },
  days: [
    { id: 'd1', date: '2026-09-15', activities: [act('a1', 'Senso-ji Temple', 'attraction', '10:00', '11:30', 'Asakusa', 0), act('a2', 'Shibuya Crossing', 'attraction', '14:00', '15:00', 'Shibuya', 2000)] },
    { id: 'd2', date: '2026-09-16', activities: [act('b1', 'Tsukiji Market', 'food', '09:00', '10:30', 'Tsukiji', 1800)] },
  ],
  suggestions: [], createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
}

test('day titles, tabs, export and reserve — with zero /api/chat calls', async ({ page, context }) => {
  const chatCalls: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/chat')) chatCalls.push(r.url()) })
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})

  await loadApp(page)
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] } }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Tokyo Explorer' })).toBeVisible()

  // 1. Legacy day title DERIVED locally (no dayTitle in data) — no AI.
  await expect(page.getByText(/Asakusa & Shibuya/).first()).toBeVisible()

  // 2. Checklist tab renders; starter template adds items.
  await page.getByRole('button', { name: /^Checklist/ }).click()
  await expect(page.getByText('Trip checklist')).toBeVisible()
  await page.getByRole('button', { name: '+ Documents' }).click()
  // (the hidden print document also contains this text, so scope to the first/visible one)
  await expect(page.getByText('Passport valid 6+ months').first()).toBeVisible()

  // 3. Reservations tab renders.
  await page.getByRole('button', { name: /^Reservations/ }).click()
  await expect(page.getByText('Reserved actual')).toBeVisible()

  // 4. Reserve an activity WITH a cost (Shibuya, ¥2000) → badge + budget actuals.
  await page.getByRole('button', { name: /^Itinerary/ }).click()
  await page.getByRole('button', { name: 'Mark as reserved' }).nth(1).click()
  await expect(page.getByText('Reserved', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: /^Reservations/ }).click()
  await expect(page.getByText('1 booking')).toBeVisible()
  await page.getByRole('button', { name: /^Budget/ }).click()
  await expect(page.getByText('Estimated vs reserved')).toBeVisible()

  // 5. Export: menu opens, Markdown triggers a download — NO /api/chat.
  await page.getByRole('button', { name: /^Itinerary/ }).click()
  const chatBefore = chatCalls.length
  await page.getByRole('button', { name: 'Export trip' }).click()
  await expect(page.getByText('Markdown (.md)')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByText('Markdown (.md)').click(),
  ])
  expect(download.suggestedFilename()).toMatch(/\.md$/)
  expect(chatCalls.length - chatBefore, 'export must not call /api/chat').toBe(0)
})
