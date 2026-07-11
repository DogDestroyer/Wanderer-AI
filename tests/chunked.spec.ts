import { test, expect, type Page, type Route } from '@playwright/test'
import { driveWizardToBuild } from './helpers/wizard'

// Chunked generation completion contract + batch resilience. Uses a MOCKED
// /api/chat so it's deterministic and free: a 9-day skeleton, batch [d4,d5,d6]
// fails twice, and we assert the OTHER batches still fill, the failed days show
// an incomplete state + Resume, and resuming completes them.

import { BASE_URL, DEMO_PASSWORD, VERCEL_BYPASS, grantBypass, loadApp } from './helpers/app'


const DAYS = 9
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`
const mkActivity = (id: string) => ({
  id, title: `Activity ${id}`, description: 'x', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
  cost: { amount: 0, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
})
function skeletonTrip() {
  return {
    id: 'trip_mock', name: 'Tokyo Trip', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
    startDate: '2026-09-15', endDate: '2026-09-23', budget: { cap: 5000, currency: 'SGD' },
    preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
    days: Array.from({ length: DAYS }, (_, i) => ({ id: `day_d${i + 1}`, date: `2026-09-${15 + i}`, dayTitle: `Day ${i + 1}`, activities: [], dayNotes: '' })),
    suggestions: [], createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
  }
}

// Install the mock. `failBatchTwice` makes the [d4,d5,d6] batch json_error its
// first two attempts (then succeed) — simulating a transient mid-gen failure.
async function installMock(page: Page) {
  let d4Attempts = 0
  await page.route('**/api/chat', async (route: Route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[]; trip?: { id: string } }
    if (body.mode === 'skeleton') {
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'Your 9-day Tokyo trip', trip: skeletonTrip() } }) })
    }
    if (body.mode === 'fill') {
      const ids = body.fillDayIds ?? []
      if (ids.includes('day_d4')) {
        d4Attempts++
        if (d4Attempts <= 2) {
          return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'json_error', naturalMessage: 'partial', parseError: 'simulated failure' }) })
        }
      }
      const patch = { tripId: 'trip_mock', dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', dayTitle: 'Day', activities: [mkActivity(id)], dayNotes: '' })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })
}

function emptyDayCount(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    const t = s?.trips?.trip_mock
    return { total: t?.days?.length ?? 0, empty: t ? t.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length : 0 }
  })
}

test('a failed batch does not abort the rest; incomplete state + resume completes it', async ({ page }) => {
  await loadApp(page)
  await installMock(page)

  await driveWizardToBuild(page, '9 days in Tokyo')

  // Wait until generation settles (batches are instant mocks).
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    return s?.trips?.trip_mock && s.isGenerating !== true
  }, { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1500)

  // Batch [d4,d5,d6] failed twice → those 3 days empty; the other 6 filled.
  // RESILIENCE: the loop continued past the failure (days 7-9 got built).
  let counts = await emptyDayCount(page)
  expect(counts.total).toBe(9)
  expect(counts.empty, 'exactly the 3 failed days remain empty').toBe(3)
  const d7 = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    return (s.trips.trip_mock.days.find((d: { id: string }) => d.id === 'day_d7')?.activities?.length ?? 0)
  })
  expect(d7, 'days AFTER the failed batch were still built (not aborted)').toBeGreaterThan(0)

  // Incomplete state is explicit, not a silent success.
  await expect(page.getByText(/didn't finish building/i).first()).toBeVisible()
  await expect(page.getByText(/still need activities/i).first()).toBeVisible()

  // Resume completes the remaining days (the mock now succeeds for d4-d6).
  await page.getByRole('button', { name: /^Resume$/ }).click()
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    const t = s?.trips?.trip_mock
    return t && s.isGenerating !== true && t.days.every((d: { activities?: unknown[] }) => d.activities && d.activities.length > 0)
  }, { timeout: 20_000 })
  counts = await emptyDayCount(page)
  expect(counts, 'all days filled after resume').toEqual({ total: 9, empty: 0 })
})

test('requested day count is honored end-to-end (all filled, none empty)', async ({ page }) => {
  await loadApp(page)
  // Same mock but no failures (d4 batch succeeds first try by pre-advancing).
  let started = false
  await page.route('**/api/chat', async (route: Route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[] }
    if (body.mode === 'skeleton') {
      started = true
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: '9-day trip', trip: skeletonTrip() } }) })
    }
    if (body.mode === 'fill' && started) {
      const ids = body.fillDayIds ?? []
      const patch = { tripId: 'trip_mock', dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', dayTitle: 'Day', activities: [mkActivity(id)], dayNotes: '' })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })

  await driveWizardToBuild(page, '9 days in Tokyo')
  await page.waitForFunction(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    const t = s?.trips?.trip_mock
    return t && s.isGenerating !== true && t.days.length === 9 && t.days.every((d: { activities?: unknown[] }) => d.activities && d.activities.length > 0)
  }, { timeout: 20_000 })
  const counts = await emptyDayCount(page)
  expect(counts).toEqual({ total: 9, empty: 0 })
})
