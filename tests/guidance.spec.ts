import { test, expect, type Page } from '@playwright/test'

// One-time post-build guidance: three sequential coach marks after the user's
// FIRST completed build; never again (persisted flag, survives refresh);
// second trips show none; never blocks interaction (no overlay/modal).

import { loadApp } from './helpers/app'

const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
const act = (id: string) => ({
  id, title: `Activity ${id}`, description: 'x', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
  cost: { amount: 10, currency: 'SGD', isEstimate: true }, locked: false, weatherSensitive: false,
})

let tripCounter = 0
async function installMock(page: Page) {
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[]; trip?: { id?: string } | null }
    if (body.mode === 'skeleton') {
      const id = `trip_g${++tripCounter}`
      const skeleton = {
        id, name: `Trip ${tripCounter}`, destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
        startDate: '2026-09-15', endDate: '2026-09-16', budget: { cap: 1000, currency: 'SGD' },
        preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
        days: [
          { id: `${id}_d1`, date: '2026-09-15', dayTitle: 'One', activities: [], dayNotes: '' },
          { id: `${id}_d2`, date: '2026-09-16', dayTitle: 'Two', activities: [], dayNotes: '' },
        ],
        suggestions: [], createdAt: 'x', updatedAt: 'x',
      }
      await new Promise((r) => setTimeout(r, 400))
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'ok', trip: skeleton } }) })
    }
    if (body.mode === 'fill') {
      const ids = body.fillDayIds ?? []
      const tripId = body.trip?.id ?? ''
      await new Promise((r) => setTimeout(r, 300))
      const patch = { tripId, dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', activities: [act(`${id}_a`)] })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })
}

async function buildTrip(page: Page) {
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Build my trip' }).click()
  await expect(page.getByTestId('build-status')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 60_000 })
}

test('first build shows all three marks exactly once; second trip shows none; flag survives refresh', async ({ page }) => {
  test.setTimeout(180_000)
  tripCounter = 0
  await loadApp(page) // fresh profile — guidanceSeen unset
  await installMock(page)

  // ── First build → mark 1 (drag) ─────────────────────────────────────────────
  await buildTrip(page)
  const mark = page.getByTestId('coach-mark')
  await expect(mark).toBeVisible({ timeout: 5_000 })
  await expect(mark).toContainText('Drag to reorder')
  // Never blocks interaction: no dimming overlay, hints float beside.
  expect(await page.locator('[data-testid="coach-mark"]').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')

  // Click anywhere → mark 2 (lock)
  await page.mouse.click(640, 60) // empty header spacer — never inside the hint bubble
  await expect(mark).toContainText('Lock anything', { timeout: 5_000 })

  // Click → mark 3 (chat)
  await page.mouse.click(640, 60) // empty header spacer — never inside the hint bubble
  await expect(mark).toContainText('tell Hodo', { timeout: 5_000 })

  // Click → sequence ends; flag persisted
  await page.mouse.click(640, 60) // empty header spacer — never inside the hint bubble
  await expect(mark).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wandr-v1')!).state.guidanceSeen)).toBe(true)

  // ── Flag persists across refresh ────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Trip 1' })).toBeVisible({ timeout: 15_000 })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wandr-v1')!).state.guidanceSeen)).toBe(true)
  await installMock(page) // route handlers don't survive reload

  // ── Second trip: NO marks ───────────────────────────────────────────────────
  await page.getByRole('button', { name: /Trip 1/ }).first().click()
  await page.getByRole('button', { name: 'New trip' }).click()
  await buildTrip(page)
  await page.waitForTimeout(2_000) // give any (wrong) mark a chance to appear
  await expect(page.getByTestId('coach-mark')).toHaveCount(0)
})

test('"Skip tips" on the first mark dismisses the sequence and sets the flag', async ({ page }) => {
  test.setTimeout(120_000)
  tripCounter = 10
  await loadApp(page)
  await installMock(page)
  await buildTrip(page)

  await expect(page.getByTestId('coach-mark')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: 'Skip tips' }).click()
  await expect(page.getByTestId('coach-mark')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wandr-v1')!).state.guidanceSeen)).toBe(true)
})
