import { test, expect, type Page } from '@playwright/test'

// Undo/redo across the four mutation classes: a real dnd drag, an edit, a
// delete, and an agent patch — then undo all four in REVERSE order asserting
// EXACT state restoration at each step (lock flags, recalculated timings and
// costs included, via full trip-JSON equality), redo forward, keyboard
// semantics inside text inputs, the delete toast's Undo button, and inertness
// during a live build.

import { loadApp } from './helpers/app'

const TRIP_ID = 'trip_undo'
const act = (id: string, title: string, start: string, mins: number, amt: number, locked = false) => ({
  id, title, description: 'x', category: 'attraction',
  startTime: start, endTime: '23:59', durationMinutes: mins,
  location: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
  cost: { amount: amt, currency: 'SGD', isEstimate: true }, locked, weatherSensitive: false,
})
const SEED = {
  id: TRIP_ID, name: 'Undo Lab', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-16', budget: { cap: 1000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
  days: [
    { id: 'd1', date: '2026-09-15', dayTitle: 'Day One', activities: [
      act('a1', 'Senso-ji Temple', '09:00', 60, 10),
      act('a2', 'Ramen Lunch', '12:00', 60, 20, true), // LOCKED
      act('a3', 'TeamLab Planets', '15:00', 90, 40),
    ] },
    { id: 'd2', date: '2026-09-16', activities: [act('b1', 'Tsukiji Market', '09:00', 90, 30)] },
  ],
  suggestions: [], createdAt: '2026-06-12T00:00:00Z', updatedAt: '2026-06-12T00:00:00Z',
}

async function seed(page: Page) {
  await loadApp(page)
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] }, guidanceSeen: true }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Undo Lab' })).toBeVisible({ timeout: 15_000 })
}

// Full-trip JSON for exact-equality checks. liveData is excluded: it's a
// transient provider cache (own store action, correctly NOT history-captured)
// that the live-prices hook may populate asynchronously mid-test.
const tripJson = (page: Page) =>
  page.evaluate((id) => {
    const t = { ...JSON.parse(localStorage.getItem('wandr-v1')!).state.trips[id] }
    delete t.liveData
    return JSON.stringify(t)
  }, TRIP_ID)

async function dragCard(page: Page, fromTitle: string, toTitle: string) {
  const from = page.locator('[data-testid="activity-card"]').filter({ hasText: fromTitle }).first()
  const to = page.locator('[data-testid="activity-card"]').filter({ hasText: toTitle }).first()
  // Both cards must be INSIDE the viewport — mouse events outside it are lost.
  await from.scrollIntoViewIfNeeded()
  await to.scrollIntoViewIfNeeded()
  const fb = (await from.boundingBox())!
  const tb = (await to.boundingBox())!
  // dnd-kit listeners live on the 16px grip handle at the card's left edge.
  await page.mouse.move(fb.x + 8, fb.y + fb.height / 2)
  await page.mouse.down()
  // Exceed the 8px activation constraint, then glide to the target in steps.
  await page.mouse.move(fb.x + 8, fb.y + fb.height / 2 - 12, { steps: 3 })
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 3, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(400) // drop animation + store write
}

const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`

test('drag, edit, delete, agent patch → undo ×4 exact restoration → redo ×4', async ({ page }) => {
  test.setTimeout(150_000)
  await seed(page)
  const s0 = await tripJson(page)

  // ── 1 · DRAG: move TeamLab above Ramen Lunch (one entry per completed drop) ──
  await dragCard(page, 'TeamLab Planets', 'Ramen Lunch')
  const s1 = await tripJson(page)
  expect(s1).not.toBe(s0)
  const order1 = JSON.parse(s1).days[0].activities.map((a: { title: string }) => a.title)
  expect(order1.indexOf('TeamLab Planets')).toBeLessThan(order1.indexOf('Ramen Lunch'))
  // Timings recalculated by the drop:
  expect(JSON.parse(s1).days[0].activities[1].startTime).not.toBe('12:00')

  // ── 2 · EDIT: rename Day 1 ────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Edit day title' }).first().click()
  await page.getByPlaceholder('Day title').fill('Custom Day')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Custom Day').first()).toBeVisible()
  const s2 = await tripJson(page)
  expect(s2).not.toBe(s1)

  // ── 3 · DELETE: Senso-ji via the edit form; toast with Undo appears ─────────
  const senso = page.locator('[data-testid="activity-card"]').filter({ hasText: 'Senso-ji Temple' }).first()
  await senso.hover()
  await senso.getByRole('button', { name: 'Edit activity' }).click({ force: true })
  await page.getByRole('button', { name: 'Delete Senso-ji Temple' }).click()
  await expect(page.getByText('Deleted Senso-ji Temple')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeVisible() // discovery surface
  const s3 = await tripJson(page)
  expect(JSON.parse(s3).days[0].activities).toHaveLength(2)
  await page.waitForTimeout(6300) // let the toast expire — we undo via keyboard below

  // ── 4 · AGENT PATCH (mocked single-shot) replacing Day 2 ────────────────────
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string }
    if (!body.mode) {
      const patch = { tripId: TRIP_ID, dayIds: ['d2'], days: [{ id: 'd2', date: '2026-09-16', activities: [act('b9', 'Kaiseki Dinner', '19:00', 120, 80)] }] }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'Swapped day 2.', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })
  // Open the chat if it isn't already (desktop defaults open, post-build closed).
  if (!(await page.locator('textarea').first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Chat', exact: true }).click()
  }
  await page.locator('textarea').first().fill('replace day 2 with a kaiseki dinner')
  await page.keyboard.press('Enter')
  await expect(page.getByText('AI updated a day')).toBeVisible({ timeout: 15_000 })
  const s4 = await tripJson(page)
  expect(JSON.parse(s4).days[1].activities[0].title).toBe('Kaiseki Dinner')
  await page.getByRole('button', { name: 'Close' }).click() // close chat (its textarea would swallow Ctrl+Z)
  await page.waitForTimeout(6300) // let the agent toast expire

  // ── UNDO ×4 (Ctrl+Z) — exact reverse restoration, lock flags included ───────
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => tripJson(page)).toBe(s3)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => tripJson(page)).toBe(s2)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => tripJson(page)).toBe(s1)
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => tripJson(page)).toBe(s0)
  // Locked flag survived the round trip exactly:
  expect(JSON.parse(await tripJson(page)).days[0].activities[1]).toMatchObject({ title: 'Ramen Lunch', locked: true, startTime: '12:00' })

  // ── REDO ×4 (Ctrl+Shift+Z) — forward through the same states ────────────────
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => tripJson(page)).toBe(s1)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => tripJson(page)).toBe(s2)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => tripJson(page)).toBe(s3)
  await page.keyboard.press('ControlOrMeta+Shift+z')
  await expect.poll(() => tripJson(page)).toBe(s4)

  // ── Ctrl+Z while typing must NOT trigger trip undo ──────────────────────────
  await page.getByRole('button', { name: 'Edit day title' }).first().click()
  const titleInput = page.getByPlaceholder('Day title')
  await titleInput.fill('scratch text')
  await titleInput.press('ControlOrMeta+z') // native text undo territory
  expect(await tripJson(page)).toBe(s4) // trip state untouched
  await titleInput.press('Escape')

  // ── Header buttons: tooltips carry labels; undo via button works too ────────
  await expect(page.getByTestId('undo-button')).toHaveAttribute('title', /Undo: AI updated a day/)
  await page.getByTestId('undo-button').click()
  await expect.poll(() => tripJson(page)).toBe(s3)
  await expect(page.getByTestId('redo-button')).toHaveAttribute('title', /Redo: AI updated a day/)
  await page.getByTestId('redo-button').click()
  await expect.poll(() => tripJson(page)).toBe(s4)

  // ── Delete toast's Undo button restores ─────────────────────────────────────
  const tsukiji = page.locator('[data-testid="activity-card"]').filter({ hasText: 'Kaiseki Dinner' }).first()
  await tsukiji.hover()
  await tsukiji.getByRole('button', { name: 'Edit activity' }).click({ force: true })
  await page.getByRole('button', { name: 'Delete Kaiseki Dinner' }).click()
  await expect.poll(async () => JSON.parse(await tripJson(page)).days[1].activities.length).toBe(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => tripJson(page)).toBe(s4)
})

test('undo is inert during a live build and the stack starts fresh after', async ({ page }) => {
  test.setTimeout(120_000)
  await loadApp(page)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('wandr-v1') || '{"state":{}}')
    raw.state.guidanceSeen = true // keep coach marks out of this test
    localStorage.setItem('wandr-v1', JSON.stringify(raw))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })

  const DAYS = 3
  const skeleton = {
    id: 'trip_b', name: 'Build Trip', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
    startDate: '2026-09-15', endDate: '2026-09-17', budget: { cap: 1000, currency: 'SGD' },
    preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
    days: Array.from({ length: DAYS }, (_, i) => ({ id: `bd${i + 1}`, date: `2026-09-${15 + i}`, dayTitle: `Day ${i + 1}`, activities: [], dayNotes: '' })),
    suggestions: [], createdAt: 'x', updatedAt: 'x',
  }
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string; fillDayIds?: string[] }
    if (body.mode === 'skeleton') {
      await new Promise((r) => setTimeout(r, 600))
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'create_trip', message: 'ok', trip: skeleton } }) })
    }
    if (body.mode === 'fill') {
      await new Promise((r) => setTimeout(r, 600))
      const ids = body.fillDayIds ?? []
      const patch = { tripId: 'trip_b', dayIds: ids, days: ids.map((id) => ({ id, date: '2026-09-15', activities: [act(`${id}a`, `Act ${id}`, '10:00', 60, 5)] })) }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'ok', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })

  // Drive the wizard to a build.
  await expect(page.getByTestId('wizard')).toBeVisible({ timeout: 15_000 })
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Skip this step' }).click()
  await page.getByRole('button', { name: 'Build my trip' }).click()

  // Mid-build: undo buttons are hidden and Ctrl+Z is inert.
  await expect(page.getByTestId('build-status')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('undo-button')).toHaveCount(0)
  const midDays = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1')!).state
    return s.trips['trip_b'] ? s.trips['trip_b'].days.length : -1
  })
  await page.keyboard.press('ControlOrMeta+z')
  await page.waitForTimeout(300)
  const midDaysAfter = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('wandr-v1')!).state
    return s.trips['trip_b'] ? s.trips['trip_b'].days.length : -1
  })
  expect(midDaysAfter).toBe(midDays)

  // After the build settles: buttons exist but the stack is FRESH (disabled).
  await expect(page.getByTestId('build-status')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByTestId('undo-button')).toBeDisabled()
  await expect(page.getByTestId('redo-button')).toBeDisabled()
})
