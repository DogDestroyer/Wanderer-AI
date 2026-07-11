import { test, expect, type Page, type Route } from '@playwright/test'

// Live generation EXPERIENCE. Mocks /api/chat with realistic DELAYS so the
// construction sequence is observable: instant scaffold → skeleton (day blocks)
// → batches (activities) → settle. Every UI beat is driven by a real event.

import { loadApp } from './helpers/app'

const DAYS = 10
const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function skeleton() {
  return {
    id: 'trip_gen', name: '10 Days in Tokyo & Kyoto',
    destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
    startDate: '2026-09-15', endDate: '2026-09-24', budget: { cap: 5000, currency: 'SGD' },
    preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
    days: Array.from({ length: DAYS }, (_, i) => ({ id: `day_${i + 1}`, date: `2026-09-${15 + i}`, dayTitle: `Day ${i + 1} Plan`, activities: [], dayNotes: '' })),
    suggestions: [], assumptions: [{ field: 'partyType', label: 'Party', value: 'Couple', source: 'message' }],
    createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
  }
}
const act = (id: string, n: number) => ({
  id: `${id}_${n}`, title: `Activity ${n}`, description: 'x', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60, location: { name: 'Tokyo', lat: 35.68, lng: 139.76 },
  travelTimeToNextMinutes: 15, cost: { amount: 2000, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
})

// skeletonDelay makes the scaffold observable; batchDelay makes population observable.
// failDay4 makes the [day_4..] batch json_error twice (transient failure).
async function installMock(page: Page, opts: { failDay4?: boolean } = {}) {
  let d4 = 0
  await page.route('**/api/chat', async (route: Route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[] }
    if (body.mode === 'skeleton') {
      await wait(1100)
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'Building…', trip: skeleton() } }) })
    }
    if (body.mode === 'fill') {
      const ids = body.fillDayIds ?? []
      await wait(650)
      if (opts.failDay4 && ids.includes('day_4')) {
        d4++
        if (d4 <= 2) return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'json_error', naturalMessage: 'partial', parseError: 'x' }) })
      }
      const patch = { tripId: 'trip_gen', dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', dayTitle: 'D', activities: [act(id, 1), act(id, 2), act(id, 3)], dayNotes: '' })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })
}

// Drive the wizard to Build a 10-day Tokyo trip.
async function buildTenDays(page: Page) {
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  await page.locator('button.wander-pill').filter({ hasText: 'Japan' }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase' }).click() // 7 → 10
  await page.getByRole('button', { name: 'Continue' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Build my trip' }).click()
}

const populatedCount = (page: Page) =>
  page.getByTestId('day-card').evaluateAll((els) => els.filter((e) => (e as HTMLElement).dataset.populated === 'true').length)
const genSnap = (page: Page) => page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
  const t = s?.trips?.trip_gen
  return t ? { total: t.days.length, empty: t.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length } : { total: 0, empty: -1 }
})

// ─── 1 · construction sequence + DOM parity ───────────────────────────────────

test('the trip constructs live: scaffold → day blocks → activities → settled parity', async ({ page }) => {
  await loadApp(page)
  await installMock(page)
  await buildTenDays(page)

  // Phase 1: instant scaffold (BEFORE any AI) — within ~1s.
  await expect(page.getByTestId('build-status')).toBeVisible({ timeout: 1000 })
  await expect(page.getByTestId('day-shimmer').first()).toBeVisible()

  // Phase 2: skeleton lands → all day blocks exist, activities NOT yet populated.
  await expect(page.getByTestId('day-card')).toHaveCount(DAYS, { timeout: 15_000 })
  await expect(page.getByTestId('day-shimmer-rows').first()).toBeVisible()

  // Phase 3: a populated (interactive) day co-exists with still-shimmering days.
  await expect.poll(async () => {
    const pop = await populatedCount(page)
    const shimmering = await page.getByTestId('day-shimmer-rows').count()
    return pop > 0 && shimmering > 0
  }, { timeout: 20_000 }).toBe(true)
  // The populated day is real/interactive content (an activity card is present).
  await expect(page.locator('[data-populated="true"]').first().getByText('Activity 1').first()).toBeVisible()

  // Phase 4: completes, status resolves, then settles (construction UI removed).
  await expect.poll(async () => (await genSnap(page)).empty, { timeout: 30_000 }).toBe(0)
  await expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 12_000 })
  await expect(page.getByTestId('day-shimmer-rows')).toHaveCount(0)
  await expect(page.getByTestId('day-shimmer')).toHaveCount(0)

  // DOM parity: the settled view equals a fresh normal load of the same trip.
  const signature = async () => ({
    dayCards: await page.getByTestId('day-card').count(),
    populated: await populatedCount(page),
    title: (await page.locator('h1').first().textContent())?.trim(),
    hasBuildUi: (await page.getByTestId('build-status').count()) + (await page.getByTestId('day-shimmer-rows').count()),
  })
  const built = await signature()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('day-card')).toHaveCount(DAYS, { timeout: 15_000 })
  const reloaded = await signature()
  expect(built).toEqual({ dayCards: DAYS, populated: DAYS, title: '10 Days in Tokyo & Kyoto', hasBuildUi: 0 })
  expect(built).toEqual(reloaded)
})

// ─── 2 · a failed batch shows a retry card in place while others complete ──────

test('a failed batch shows its retry card in place while other days build', async ({ page }) => {
  await loadApp(page)
  await installMock(page, { failDay4: true })
  await buildTenDays(page)

  // While constructing: the failed day shows a retry card AND other days populate.
  await expect.poll(async () => {
    const failed = await page.getByTestId('day-failed').count()
    const pop = await populatedCount(page)
    return failed > 0 && pop > 0
  }, { timeout: 35_000 }).toBe(true)

  // The rest of the trip still finished (only the failed batch's days are empty).
  await expect.poll(async () => (await genSnap(page)).empty, { timeout: 35_000 }).toBeLessThanOrEqual(3)
  await expect.poll(async () => (await genSnap(page)).total, { timeout: 5_000 }).toBe(DAYS)
})

// ─── 3 · reduced motion renders + completes without construction animations ────

test('reduced motion still constructs the trip correctly (animations collapsed)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadApp(page)
  await installMock(page)
  await buildTenDays(page)

  // Shimmer sweep is disabled under reduced motion (CSS), but the scaffold + build still work.
  await expect(page.getByTestId('build-status')).toBeVisible({ timeout: 2000 })
  await expect.poll(async () => (await genSnap(page)).empty, { timeout: 30_000 }).toBe(0)
  await expect(page.getByTestId('day-card')).toHaveCount(DAYS)
  await expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 12_000 })
})
