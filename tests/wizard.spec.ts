import { test, expect, type Page, type Route } from '@playwright/test'

// New-trip WIZARD end-to-end. Mocks /api/chat so it's deterministic and free.
// The mock echoes the wizard's generation request and derives assumption SOURCES
// from the message (present → 'message'/user, absent → 'inferred'). Covers the
// refinement pass: complete country search, country-filtered cities, stepper-
// only days/people, computed dates, and the Work party type.

import { loadApp } from './helpers/app'

// The floating pills drift forever (CSS animation), so pill clicks use
// { force: true } to bypass Playwright's stability wait.

const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`

function mkActivity(id: string) {
  return {
    id: `${id}_a1`, title: `Activity ${id}`, description: 'x', category: 'attraction',
    startTime: '10:00', endTime: '11:00', durationMinutes: 60,
    location: { name: 'City', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
    cost: { amount: 0, currency: 'SGD', isEstimate: true }, locked: false, weatherSensitive: false,
  }
}

function assumptionsFor(bodyText: string) {
  const has = (re: RegExp) => re.test(bodyText)
  const src = (present: boolean) => (present ? 'message' : 'inferred')
  const partyVal = has(/work|business/i) ? 'Work' : has(/couple|people/i) ? 'Couple' : 'Solo'
  return [
    { field: 'partyType', label: 'Party',  value: partyVal, source: src(has(/work|business|couple|people/i)) },
    { field: 'budget',    label: 'Budget',  value: has(/SGD/i) ? 'SGD 5,000' : 'Mid-range', source: src(has(/SGD|budget style/i)) },
    { field: 'pace',      label: 'Pace',    value: 'Balanced', source: 'inferred' },
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
      const parsed = JSON.parse(raw) as { messages?: { content: string }[] }
      const msgText = (parsed.messages ?? []).map((m) => m.content).join(' ')
      const m = msgText.match(/(\d+)\s*days/i)
      const days = m ? parseInt(m[1], 10) : 3
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'Building your trip…', trip: skeletonTrip(days, msgText) } }) })
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
    if (!t) return { total: 0, empty: 0, assumptions: [] as { source: string; field: string; value: string }[] }
    return {
      total: t.days.length,
      empty: t.days.filter((d: { activities?: unknown[] }) => !d.activities || d.activities.length === 0).length,
      assumptions: (t.assumptions ?? []) as { source: string; field: string; value: string }[],
    }
  })
}

function draftSnapshot(page: Page) {
  return page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1') || '{}').state
    return s?.wizard?.draft ?? null
  })
}

// ─── 1 · full flow: one request with all answers (incl. Work) → all days ──────

test('completing the wizard fires ONE request with all answers and builds every day', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

  // Step 1 — country
  await page.getByRole('button', { name: 'Japan' }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 2 — cities
  await page.getByRole('button', { name: 'Tokyo', exact: true }).click()
  await page.getByRole('button', { name: 'Kyoto', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 3 — days: default 7 → 10 via steppers only
  await expect(page.getByTestId('stepper-value')).toHaveText('7')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase' }).click()
  await expect(page.getByTestId('stepper-value')).toHaveText('10')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 4 — dates: pick a future start (next month, day 15)
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: '15', exact: true }).click()
  await expect(page.getByText(/· 10 days/)).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 5 — people: default 3, choose Work
  await expect(page.getByTestId('stepper-value')).toHaveText('3')
  await page.getByRole('button', { name: 'Work', exact: true }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 6 — exact budget
  await page.getByPlaceholder('e.g. 4,500').fill('5000')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 7 — interests
  await page.getByRole('button', { name: 'food', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'museums', exact: true }).click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()

  // Step 8 — notes → build
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible()
  await page.getByRole('textbox').fill('We love ramen.')
  await page.getByRole('button', { name: 'Build my trip' }).click()

  await expect.poll(async () => (await tripSnapshot(page)).total, { timeout: 30_000 }).toBe(10)
  await expect.poll(async () => (await tripSnapshot(page)).empty, { timeout: 30_000 }).toBe(0)

  expect(state.skeletonBodies.length).toBe(1)
  const body = state.skeletonBodies[0]
  expect(body).toContain('Tokyo')
  expect(body).toContain('Kyoto')
  expect(body).toMatch(/10 days/)
  expect(body).toMatch(/\d{4}-\d{2}-\d{2}/)      // a concrete date
  expect(body).toMatch(/work|business/i)          // Work party type flowed through
  expect(body).toContain('SGD')
  expect(body).toContain('5,000')
  expect(body).toContain('museums')
  expect(body).toContain('ramen')

  await expect(page.getByTestId('wizard')).toBeHidden({ timeout: 10_000 })
  const snap = await tripSnapshot(page)
  const party = snap.assumptions.find((a) => a.field === 'partyType')
  expect(party?.value).toBe('Work')
  expect(party?.source).not.toBe('inferred')
  await expect(page.getByText('Work', { exact: true }).first()).toBeVisible()
})

// ─── 2 · skip every step → all-inferred assumptions ───────────────────────────

test('skipping every step still generates a trip with all-inferred assumptions', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await expect(page.getByRole('button', { name: 'Build my trip' })).toBeVisible()
  await page.getByRole('button', { name: 'Build my trip' }).click()

  await expect.poll(async () => (await tripSnapshot(page)).total, { timeout: 30_000 }).toBeGreaterThan(0)
  await expect.poll(async () => (await tripSnapshot(page)).empty, { timeout: 30_000 }).toBe(0)
  const snap = await tripSnapshot(page)
  expect(snap.assumptions.length).toBeGreaterThan(0)
  expect(snap.assumptions.every((a) => a.source === 'inferred')).toBe(true)
})

// ─── 3 · back navigation preserves answers; refresh resumes in place ──────────

test('back navigation preserves answers and a refresh resumes at the same step', async ({ page }) => {
  const state: MockState = { skeletonBodies: [] }
  await loadApp(page)
  await installMock(page, state)

  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  const japanPill = page.locator('button.wander-pill').filter({ hasText: 'Japan' })
  await japanPill.click({ force: true })
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 2 of 8')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(japanPill).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 3 of 8')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 3 of 8')
  await page.getByRole('button', { name: 'Back' }).click()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('button.wander-pill').filter({ hasText: 'Japan' })).toHaveAttribute('aria-pressed', 'true')
})

// ─── 4 · complete country search (typo-tolerant + full list) ──────────────────

test('country search finds Kazakhstan (typo) and Uzbekistan', async ({ page }) => {
  await loadApp(page)
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  // The search input's placeholder clears once a chip is added, so target it by role.
  const search = page.getByRole('textbox')

  await search.fill('Kazahstan') // deliberate typo
  await expect(page.getByRole('button', { name: /Kazakhstan/ })).toBeVisible()
  await page.getByRole('button', { name: /Kazakhstan/ }).click()

  await search.fill('Uzbek')
  await expect(page.getByRole('button', { name: /Uzbekistan/ })).toBeVisible()
})

// ─── 5 · cities are constrained to the selected country ───────────────────────

test('selecting China yields only Chinese cities (no Chicago / Chiang Mai)', async ({ page }) => {
  await loadApp(page)
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })

  // Select China via search (not a popular pill).
  await page.getByRole('textbox').fill('China')
  await page.getByRole('button', { name: 'China' }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  // Grid: Chongqing present + selectable; Chicago / Chiang Mai absent.
  await expect(page.getByRole('button', { name: 'Chongqing', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Chicago', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chiang Mai', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Chongqing', exact: true }).click()
  await expect(page.getByRole('button', { name: /Remove Chongqing/ })).toBeVisible()

  // Search is also constrained: "Chi" must not surface Chicago or Chiang Mai.
  await page.getByRole('textbox').fill('Chi')
  await page.waitForTimeout(300)
  await expect(page.getByRole('button', { name: 'Chicago', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Chiang Mai', exact: true })).toHaveCount(0)
})

// ─── 6 · days step: default 7, stepper-only ───────────────────────────────────

test('days step defaults to 7 and only steppers change it (no manual entry)', async ({ page }) => {
  await loadApp(page)
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  // Reach the days step by skipping 1 & 2.
  await page.getByRole('button', { name: 'Skip this step' }).click()
  await page.getByRole('button', { name: 'Skip this step' }).click()
  await expect(page.getByTestId('wizard-progress')).toHaveText('Step 3 of 8')

  await expect(page.getByTestId('stepper-value')).toHaveText('7')
  // No manual text/number entry on this step.
  await expect(page.locator('input[type="number"]')).toHaveCount(0)
  await expect(page.getByRole('spinbutton')).toHaveCount(0)

  await page.getByRole('button', { name: 'Increase' }).click()
  await expect(page.getByTestId('stepper-value')).toHaveText('8')
  await page.getByRole('button', { name: 'Decrease' }).click()
  await page.getByRole('button', { name: 'Decrease' }).click()
  await expect(page.getByTestId('stepper-value')).toHaveText('6')
})

// ─── 7 · dates: picking a start computes the locked end date ───────────────────

test('picking a start date computes the correct locked end date from the day count', async ({ page }) => {
  await loadApp(page)
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  // Skip to days, set to 10, continue to dates.
  await page.getByRole('button', { name: 'Skip this step' }).click()
  await page.getByRole('button', { name: 'Skip this step' }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Increase' }).click()
  await expect(page.getByTestId('stepper-value')).toHaveText('10')
  await page.getByRole('button', { name: 'Continue' }).click()

  // Pick day 15 of next month.
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByRole('button', { name: '15', exact: true }).click()
  await expect(page.getByText(/· 10 days/)).toBeVisible()

  const draft = await draftSnapshot(page)
  expect(draft.startDate).toMatch(/-15$/)
  // end = start + (10 - 1) days = the 24th of the same month.
  const start = new Date(draft.startDate + 'T00:00:00')
  const end = new Date(draft.endDate + 'T00:00:00')
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  expect(diff).toBe(9)
})
