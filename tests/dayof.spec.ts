import { test, expect, type Page } from '@playwright/test'

// Day-of travel mode: with a trip spanning today, the Today tab leads the row
// + a banner offers today's plan; the hero picks the right activity from the
// (pinned) clock; Mark-as-done dims + recalculates remaining budget and is
// undoable; maps links carry coordinates; confirmation numbers surface.
// The ENTIRE file runs at a mobile viewport — this view is built for phones.

import { loadApp } from './helpers/app'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const TRIP_ID = 'trip_today'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
// Pin the app clock to 10:20 local time TODAY via the __HODO_NOW__ seam.
const NOW = new Date(`${isoDay(0)}T10:20:00`).getTime()

const act = (id: string, title: string, start: string, end: string, cost: { amount: number; currency: string }) => ({
  id, title, description: 'x', category: 'attraction',
  startTime: start, endTime: end, durationMinutes: 60,
  location: { name: title, lat: 35.71, lng: 139.79 }, travelTimeToNextMinutes: 15,
  cost: { ...cost, isEstimate: true }, locked: false, weatherSensitive: false,
})

// Day 1 yesterday, day 2 TODAY, day 3 tomorrow. At 10:20 the 09:00 activity is
// past, so the hero must be the 11:00 one — "starts in 40m".
const seedTrip = () => ({
  id: TRIP_ID, name: 'On Trip', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: isoDay(-1), endDate: isoDay(1), budget: { cap: 2000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
  days: [
    { id: 'd1', date: isoDay(-1), activities: [act('p1', 'Arrival Stroll', '15:00', '17:00', { amount: 0, currency: 'SGD' })] },
    { id: 'd2', date: isoDay(0), activities: [
      act('t1', 'Morning Market', '09:00', '10:00', { amount: 30, currency: 'SGD' }),
      act('t2', 'Tea Ceremony', '11:00', '12:00', { amount: 3000, currency: 'JPY' }),
      act('t3', 'Evening Izakaya', '18:00', '20:00', { amount: 60, currency: 'SGD' }),
    ] },
    { id: 'd3', date: isoDay(1), activities: [act('n1', 'Sunrise Hike', '06:00', '09:00', { amount: 0, currency: 'SGD' })] },
  ],
  reservations: [
    { id: 'r1', type: 'activity', name: 'Tea Ceremony', date: isoDay(0), confirmationNumber: 'TEA-777', status: 'booked', activityId: 't2' },
    { id: 'r2', type: 'hotel', name: 'Hotel Hodo', date: isoDay(0), confirmationNumber: 'HTL-123', status: 'booked' },
  ],
  suggestions: [], createdAt: 'x', updatedAt: 'x',
})

async function seed(page: Page, trip: Record<string, unknown>) {
  await page.addInitScript((now) => { (globalThis as Record<string, unknown>).__HODO_NOW__ = now }, NOW)
  // Deterministic FX: block live rates so the hardcoded fallback is used for
  // every read (otherwise "remaining" shifts mid-test when live rates land).
  await page.route('**/api.frankfurter.dev/**', (route) => route.abort())
  await loadApp(page)
  await page.evaluate((t) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [t.id as string]: t }, activeTripId: t.id, chatHistory: { [t.id as string]: [] }, guidanceSeen: true }, version: 0 }))
  }, trip)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: trip.name as string })).toBeVisible({ timeout: 15_000 })
}

test('on-trip: banner + Today tab first, correct day, live hero, done/undo, maps, confirmations', async ({ page }) => {
  await seed(page, seedTrip())

  // Banner + Today leads the tab row.
  await expect(page.getByTestId('on-trip-banner')).toBeVisible()
  const todayTab = page.getByRole('button', { name: 'Today', exact: true })
  const itinTab = page.getByRole('button', { name: 'Itinerary', exact: true })
  const [tb, ib] = [await todayTab.boundingBox(), await itinTab.boundingBox()]
  expect(tb!.x).toBeLessThan(ib!.x)

  await page.getByRole('button', { name: /Open today's plan/ }).click()
  await expect(page.getByTestId('today-panel')).toBeVisible()
  await expect(page.getByTestId('on-trip-banner')).toHaveCount(0) // banner yields to the view itself
  await expect(page.getByTestId('today-preview-note')).toHaveCount(0)

  // Correct day of the trip.
  await expect(page.getByTestId('today-header')).toContainText('Day 2 of 3')

  // Hero: 09:00 is past at 10:20 → the 11:00 activity, starting in 40m.
  const hero = page.getByTestId('today-hero')
  await expect(hero).toContainText('Tea Ceremony')
  await expect(page.getByTestId('hero-timing')).toHaveText('starts in 40m')
  // Local currency LARGE (what you hand the cashier) + budget conversion small.
  await expect(page.getByTestId('hero-local-price')).toContainText('3,000')
  await expect(hero).toContainText('≈')
  // Maps link carries the exact stored coordinates.
  await expect(page.getByTestId('hero-maps')).toHaveAttribute('href', /query=35\.71,139\.79/)
  // Linked reservation's confirmation number rides on the hero.
  await expect(page.getByTestId('hero-confirmation')).toHaveText('#TEA-777')
  // Unlinked same-day reservation listed with its code.
  await expect(page.getByTestId('today-panel').getByText('#HTL-123')).toBeVisible()

  // Remaining budget = today's total minus done costs.
  const remaining = page.getByTestId('today-remaining')
  const parse = async () => Number((await remaining.textContent())!.replace(/[^0-9.]/g, ''))
  const before = await parse()
  expect(before).toBeGreaterThan(90) // 30 + 60 SGD + converted ¥3,000

  // Mark the hero done: row dims, hero advances, remaining drops.
  await page.getByTestId('hero-done').click()
  const teaRow = page.getByTestId('today-row').filter({ hasText: 'Tea Ceremony' })
  await expect(teaRow).toHaveAttribute('data-done', 'true')
  await expect(hero).toContainText('Evening Izakaya') // next pending activity
  const after = await parse()
  expect(after).toBeLessThan(before)

  // Purely visual + undoable.
  await page.getByTestId('undo-button').click()
  await expect(teaRow).toHaveAttribute('data-done', 'false')
  expect(await parse()).toBe(before)

  // Tomorrow peek.
  await expect(page.getByTestId('tomorrow-peek')).toContainText('Sunrise Hike')
})

test('off-trip: Today is a preview at the end of the tab row', async ({ page }) => {
  const future = seedTrip()
  future.startDate = isoDay(10)
  future.endDate = isoDay(12)
  future.days = future.days.map((d, i) => ({ ...d, date: isoDay(10 + i) }))
  future.reservations = []
  await seed(page, future)

  // No banner; Today sits AFTER the other tabs.
  await expect(page.getByTestId('on-trip-banner')).toHaveCount(0)
  const todayTab = page.getByRole('button', { name: 'Today', exact: true })
  const mapTab = page.getByRole('button', { name: 'Map', exact: true })
  await todayTab.scrollIntoViewIfNeeded()
  const [tb, mb] = [await todayTab.boundingBox(), await mapTab.boundingBox()]
  expect(tb!.x).toBeGreaterThan(mb!.x)

  await todayTab.click()
  await expect(page.getByTestId('today-preview-note')).toContainText("hasn't started yet")
  await expect(page.getByTestId('today-header')).toContainText('Day 1 of 3')
  await expect(page.getByTestId('hero-timing')).toHaveText('first up')
})
