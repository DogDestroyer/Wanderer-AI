import { test, expect, type Page, type Route } from '@playwright/test'

// Live generation REVEAL. Mocks /api/chat with realistic delays so the
// strictly-sequential construction is observable. Governing rules under test:
//  1. Nothing appears without an animated entrance (no pop-in).
//  2. Day N+1's block is absent from the DOM until day N is fully populated.
// Plus: chat stays closed at completion (unread dot only), per-day
// interactivity, reduced-motion ordering, DOM parity, and a frame-time trace.

import { loadApp } from './helpers/app'

const DAYS = 10
const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function skeleton(days = DAYS) {
  return {
    id: 'trip_gen', name: '10 Days in Tokyo & Kyoto',
    destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
    startDate: '2026-09-15', endDate: '2026-09-24', budget: { cap: 5000, currency: 'SGD' },
    preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
    days: Array.from({ length: days }, (_, i) => ({ id: `day_${i + 1}`, date: `2026-09-${15 + i}`, dayTitle: `Day ${i + 1} Plan`, activities: [], dayNotes: '' })),
    suggestions: [], assumptions: [{ field: 'partyType', label: 'Party', value: 'Couple', source: 'message' }],
    createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
  }
}
const act = (id: string, n: number) => ({
  id: `${id}_${n}`, title: `Activity ${n}`, description: 'x', category: 'attraction',
  startTime: `${9 + n}:00`, endTime: `${10 + n}:00`, durationMinutes: 60, location: { name: 'Tokyo', lat: 35.68, lng: 139.76 },
  travelTimeToNextMinutes: 15, cost: { amount: 2000, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
})

async function installMock(page: Page, opts: { failDay4?: boolean; days?: number } = {}) {
  const days = opts.days ?? DAYS
  let d4 = 0
  await page.route('**/api/chat', async (route: Route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[] }
    if (body.mode === 'skeleton') {
      await wait(900)
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'Building…', trip: skeleton(days) } }) })
    }
    if (body.mode === 'fill') {
      const ids = body.fillDayIds ?? []
      await wait(600)
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

// MutationObserver installed before the app loads: records (a) any day card
// that mounts while an EARLIER card is still unpopulated (and not a failed-day
// retry card) — the strict-order rule; (b) any day card whose entrance wrapper
// is already at full opacity when it enters the DOM — the no-pop-in rule.
async function installOrderingObserver(page: Page) {
  await page.addInitScript(() => {
    // @ts-expect-error test-only global
    window.__violations = []
    const push = (v: string) => (window as unknown as { __violations: string[] }).__violations.push(v)
    const obs = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof HTMLElement)) continue
        const cards = n.matches?.('[data-testid="day-card"]') ? [n] : [...(n.querySelectorAll?.('[data-testid="day-card"]') ?? [])]
        for (const c of cards as HTMLElement[]) {
          const all = [...document.querySelectorAll('[data-testid="day-card"]')]
          const idx = all.indexOf(c)
          for (let i = 0; i < idx; i++) {
            const prev = all[i] as HTMLElement
            if (prev.dataset.populated !== 'true' && !prev.querySelector('[data-testid="day-failed"]')) {
              push(`day-card[${idx}] mounted while day-card[${i}] was unpopulated`)
            }
          }
          const op = parseFloat(getComputedStyle(c.parentElement as Element).opacity)
          if (op >= 0.99) push(`day-card[${idx}] appeared without an entrance (opacity ${op})`)
        }
      }
    })
    document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, { childList: true, subtree: true }))
  })
}

async function buildTenDays(page: Page, days = DAYS) {
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  await page.locator('button.wander-pill').filter({ hasText: 'Japan' }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  for (let i = 0; i < days - 7; i++) await page.getByRole('button', { name: 'Increase' }).click() // 7 → N
  await page.getByRole('button', { name: 'Continue' }).click()
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Build my trip' }).click()
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)
const settleGone = (page: Page) => expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 90_000 })

// ─── 1 · strict sequential reveal + entrances + chat behaviour + parity ────────

test('days reveal strictly in order with animated entrances; chat stays closed with a dot', async ({ page }) => {
  test.setTimeout(180_000)
  await installOrderingObserver(page)
  await loadApp(page)
  await installMock(page)
  await buildTenDays(page)

  // Mid-reveal: a populated interactive day co-exists with the one revealing,
  // and later days are NOT in the DOM.
  await expect.poll(async () => {
    const interactive = await page.locator('[data-testid="day-card"][data-interactive="true"][data-populated="true"]').count()
    const total = await page.getByTestId('day-card').count()
    return interactive >= 1 && total < DAYS ? 'partial' : `i=${interactive} t=${total}`
  }, { timeout: 30_000 }).toBe('partial')

  // Strict order held for every mount so far, and nothing popped in.
  expect(await violations(page)).toEqual([])

  // Completion: all days revealed, construction UI dissolves.
  await expect(page.getByTestId('day-card')).toHaveCount(DAYS, { timeout: 90_000 })
  await settleGone(page)
  expect(await violations(page)).toEqual([])

  // Chat did NOT open; the unread dot marks the waiting summary; opening clears it.
  await expect(page.locator('textarea')).toHaveCount(0)
  await expect(page.getByTestId('chat-unread-dot')).toBeVisible()
  await page.getByRole('button', { name: 'Chat', exact: true }).click()
  await expect(page.locator('textarea').first()).toBeVisible()
  await expect(page.getByTestId('chat-unread-dot')).toHaveCount(0)
  await page.getByRole('button', { name: 'Close' }).click()

  // DOM parity: the settled view equals a fresh reload of the same trip.
  const signature = async () => ({
    dayCards: await page.getByTestId('day-card').count(),
    populated: await page.locator('[data-populated="true"]').count(),
    title: (await page.locator('h1').first().textContent())?.trim(),
    buildUi: (await page.getByTestId('build-status').count()),
  })
  const built = await signature()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('day-card')).toHaveCount(DAYS, { timeout: 15_000 })
  const reloaded = await signature()
  expect(built).toEqual({ dayCards: DAYS, populated: DAYS, title: '10 Days in Tokyo & Kyoto', buildUi: 0 })
  expect(built).toEqual(reloaded)
})

// ─── 2 · failed batch: retry card enters in sequence; later days continue ──────

test('a failed batch reveals its retry card in sequence while later days continue', async ({ page }) => {
  test.setTimeout(180_000)
  await installOrderingObserver(page)
  await loadApp(page)
  await installMock(page, { failDay4: true })
  await buildTenDays(page)

  // The failed day's retry card appears through the queue…
  await expect(page.getByTestId('day-failed').first()).toBeVisible({ timeout: 60_000 })
  // …and the queue continues: days after it still reveal.
  await expect.poll(async () => page.getByTestId('day-card').count(), { timeout: 90_000 }).toBe(DAYS)
  expect(await violations(page)).toEqual([])
})

// ─── 3 · reduced motion: same strict ordering, entrances collapse to fades ─────

test('reduced motion keeps strict ordering (entrances collapse to fades)', async ({ page }) => {
  test.setTimeout(180_000)
  await installOrderingObserver(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await loadApp(page)
  await installMock(page)
  await buildTenDays(page)

  await expect(page.getByTestId('day-card')).toHaveCount(DAYS, { timeout: 90_000 })
  await settleGone(page)
  expect(await violations(page)).toEqual([])
  await expect(page.getByTestId('chat-unread-dot')).toBeVisible()
})

// ─── 4 · 16-day frame-time trace (no sustained jank) ───────────────────────────

test('16-day reveal holds frame budget (performance trace)', async ({ page }) => {
  test.setTimeout(240_000)
  await loadApp(page)
  await installMock(page, { days: 16 })
  await buildTenDays(page, 16)

  // Sample rAF deltas for the whole reveal.
  await page.evaluate(() => {
    // @ts-expect-error test-only global
    window.__frames = []
    let last = performance.now()
    const tick = (t: number) => {
      ;(window as unknown as { __frames: number[] }).__frames.push(t - last)
      last = t
      if (document.querySelector('[data-testid="build-status"]') || (window as unknown as { __frames: number[] }).__frames.length < 60) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })

  await expect(page.getByTestId('day-card')).toHaveCount(16, { timeout: 120_000 })
  await expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 90_000 })

  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames)
  const long = frames.filter((f) => f > 34) // > ~2 missed 60fps frames
  const p95 = [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)]
  console.log(`[perf] frames=${frames.length} p95=${p95?.toFixed(1)}ms long(>34ms)=${long.length} (${((long.length / frames.length) * 100).toFixed(1)}%)`)
  expect(frames.length).toBeGreaterThan(100)
  // No sustained jank: fewer than 10% of frames blow the 2-frame budget.
  expect(long.length / frames.length).toBeLessThan(0.1)
})
