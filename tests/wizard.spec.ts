import { test, expect, type Page, type Route } from '@playwright/test'

// New-trip WIZARD end-to-end. Mocks /api/chat so it's deterministic and free.
// The mock echoes the wizard's generation request: it builds the skeleton from
// the requested day count and derives assumption SOURCES from the message —
// fields present in the message become 'message' (user), absent ones 'inferred'.
// This proves the wiring: wizard answers → one request with all fields → chips.

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? ''
const VERCEL_BYPASS = process.env.VERCEL_BYPASS ?? ''

// The floating pills drift forever (CSS animation); reduced motion disables it
// (via a prefers-reduced-motion media query) so elements are click-stable.
test.use({ reducedMotion: 'reduce' })

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
}

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`

function mkActivity(id: string) {
  return {
    id: `${id}_a1`, title: `Activity ${id}`, description: 'x', category: 'attraction',
    startTime: '10:00', endTime: '11:00', durationMinutes: 60,
    location: { name: 'City', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
    cost: { amount: 0, currency: 'SGD', isEstimate: true }, locked: false, weatherSensitive: false,
  }
}

// Assumptions whose SOURCE depends on what the wizard put in the message.
function assumptionsFor(bodyText: string) {
  const has = (re: RegExp) => re.test(bodyText)
  const src = (present: boolean) => (present ? 'message' : 'inferred')
  return [
    { field: 'partyType', label: 'Party',  value: has(/couple|people/i) ? 'Couple' : 'Solo',       source: src(has(/couple|people/i)) },
    { field: 'budget',    label: 'Budget',  value: has(/SGD/i) ? 'SGD 5,000' : 'Mid-range',          source: src(has(/SGD|budget style/i)) },
    { field: 'pace',      label: 'Pace',    value: 'Balanced',                                       source: 'inferred' },
    { field: 'dates',     label: 'Dates',   value: has(/\d{4}-\d{2}-\d{2}/) ? 'Sep 2026' : 'Flexible', source: src(has(/\d{4}-\d{2}-\d{2}/)) },
  ]
}

function skeletonTrip(days: number, bodyText: string) {
  return {
    id: 'trip_wiz', name: 'Wizard Trip',
    destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
    startDate: '2026-09-15', endDate: '2026-09-24', budget: { cap: 5000, currency: 'SGD' },
    preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
    days: Array.from({ length: days }, (_, i) => ({ id: `day_${i + 1}`, date: `2026-09-${15 + i}`, dayTitle: `Day ${i + 1}`, activities: [], dayNotes: '' })),
    suggestions: [], assumptions: assumptionsFor(bodyText),
    createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
  }
}

interface MockState { skeletonBodies: string[] }

async function installMock(page: Page, state: MockState) {
  await page.route('**/api/chat', async (route: Route) => {
    const raw = route.request().postData() ?? ''
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[] }
    if (body.mode === 'skeleton') {
      state.skeletonBodies.push(raw)
      // Derive assumption sources from the MESSAGE only (what the user stated),
      // not the whole body (which always carries default preferences).
      const parsed = JSON.parse(raw) as { messages?: { content: string }[] }
      const msgText = (parsed.messages ?? []).map((m) => m.content).join(' ')
      const m = msgText.match(/(\d+)\s*days/i)
      const days = m ? parseInt(m[1], 10) : 3
      return route.fulfill({
        status: 200, headers: { 'Content-Type': 'text/event-stream' },
        body: sse({ type: 'done', response: { action: 'create_trip', message: 'Building your trip…', trip: skeletonTrip(days, msgText) } }),
      })
    }
    if (body.mode === 'fill') {
      const ids = body.fillDayIds ?? []
      const patch = { tripId: 'trip_wiz', dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', dayTitle: 'Day', activities: [mkActivity(id)], dayNotes: '' })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })
}

function tripSnapshot(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    const t = s?.trips?.trip_wiz
    if (!t) return { total: 0, empty: 0, assumptions: [] as { source: string }[] }
    return {
      total: t.days.length,
      empty: t.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length,
      assumptions: (t.assumptions ?? []) as { source: string }[],
    }
  })
}

// ─── Test 1 · full wizard → one request with all fields → 10 filled days ───────

test('completing the wizard fires ONE request with all answers and builds every day', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  // Wizard auto-opens on a fresh start.
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 1 of 9')

  // Step 1 — country (floating pill)
  await page.getByRole('button', { name: 'Japan' }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2 — cities
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click()
  await page.getByRole('button', { name: 'Kyoto', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3 — days (seed then set to 10)
  await page.getByRole('button', { name: 'Set a value' }).click()
  await page.getByRole('spinbutton').fill('10')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 4 — dates (range → confirms 10 days)
  const dates = page.locator('input[type="date"]')
  await dates.nth(0).fill('2026-09-15')
  await dates.nth(1).fill('2026-09-24')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 5 — people (seed 2 → couple)
  await page.getByRole('button', { name: 'Set a value' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 6 — exact budget
  await page.getByPlaceholder('e.g. 4,500').fill('5000')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 7 — interests
  await page.getByRole('button', { name: 'food', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'nature', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'history', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 8 — notes → build
  await page.getByRole('textbox').fill('We love ramen and want a day trip to Nara.')
  await page.getByRole('button', { name: 'Build my trip' }).click()

  // Generation runs; poll until all 10 days are filled.
  await expect.poll(async () => (await tripSnapshot(page)).total, { timeout: 30_000 }).toBe(10)
  await expect.poll(async () => (await tripSnapshot(page)).empty, { timeout: 30_000 }).toBe(0)

  // Exactly ONE skeleton (generation) request, and it carried every answer.
  expect(state.skeletonBodies.length).toBe(1)
  const body = state.skeletonBodies[0]
  expect(body).toContain('Tokyo')
  expect(body).toContain('Kyoto')
  expect(body).toContain('Japan')
  expect(body).toMatch(/10 days/)
  expect(body).toMatch(/2026-09-15/)
  expect(body).toMatch(/2 people|couple/)
  expect(body).toContain('SGD')
  expect(body).toContain('5,000')
  expect(body).toContain('food')
  expect(body).toContain('nature')
  expect(body).toContain('history')
  expect(body).toContain('ramen') // the verbatim note

  // Wizard hands off to the trip view; assumption chips reflect answers as
  // user-sourced (non-inferred) for every field the wizard provided.
  await expect(page.getByTestId('wizard')).toBeHidden({ timeout: 10_000 })
  const snap = await tripSnapshot(page)
  const answered = snap.assumptions.filter((a) => ['partyType', 'budget', 'dates'].includes((a as { field?: string }).field ?? ''))
  expect(answered.length).toBeGreaterThan(0)
  expect(answered.every((a) => a.source !== 'inferred')).toBe(true)
  await expect(page.getByText('Planned for:')).toBeVisible()
})

// ─── Test 2 · skip every step → still generates, all-inferred chips ────────────

test('skipping every step still generates a trip with all-inferred assumptions', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

  // Skip steps 1–7 via the footer, then Build on the notes step (no note).
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: 'Skip this step' }).click()
  }
  await page.getByRole('button', { name: 'Build my trip' }).click()

  // Generation still succeeds (mock defaults to a short trip), all days filled.
  await expect.poll(async () => (await tripSnapshot(page)).total, { timeout: 30_000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await tripSnapshot(page)).empty, { timeout: 30_000 }).toBe(0)

  const snap = await tripSnapshot(page)
  expect(snap.assumptions.length).toBeGreaterThan(0)
  expect(snap.assumptions.every((a) => a.source === 'inferred')).toBe(true)
})

// ─── Test 3 · back navigation preserves answers; refresh resumes in place ──────

test('back navigation preserves answers and a refresh resumes at the same step', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

  // Select a country, advance, then go back — the selection must persist.
  const japanPill = page.locator('button.wander-pill').filter({ hasText: 'Japan' })
  await japanPill.click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 2 of 9')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 1 of 9')
  // Japan pill is still selected (aria-pressed).
  await expect(japanPill).toHaveAttribute('aria-pressed', 'true')

  // Advance a couple of steps, then refresh — should resume at the same step.
  await page.getByRole('button', { name: 'Continue' }).click() // → 2
  await page.getByRole('button', { name: 'Continue' }).click() // → 3
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 3 of 9')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 3 of 9')

  // Going back to step 1 still shows Japan selected (draft persisted).
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('button.wander-pill').filter({ hasText: 'Japan' })).toHaveAttribute('aria-pressed', 'true')
})
