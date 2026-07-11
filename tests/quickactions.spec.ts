import { test, expect, type Page } from '@playwright/test'

// Day quick actions: "Make it cheaper" on Day 2 → ONLY Day 2 changes, its
// locked card survives, the canned instruction lands in chat history, other
// days stay interactive during processing, and undo restores exactly.

import { loadApp } from './helpers/app'

const TRIP_ID = 'trip_qa'
const act = (id: string, title: string, amt: number, locked = false) => ({
  id, title, description: 'x', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: 'Tokyo', lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 15,
  cost: { amount: amt, currency: 'SGD', isEstimate: true }, locked, weatherSensitive: false,
})
const SEED = {
  id: TRIP_ID, name: 'QA Trip', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-16', budget: { cap: 1000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [] },
  days: [
    { id: 'd1', date: '2026-09-15', dayTitle: 'One', activities: [act('a1', 'Senso-ji', 10)] },
    { id: 'd2', date: '2026-09-16', dayTitle: 'Two', activities: [act('b1', 'Kaiseki Dinner', 200), act('b2', 'Locked Gem', 50, true)] },
  ],
  suggestions: [], createdAt: 'x', updatedAt: 'x',
}

const sse = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
// liveData and per-day weather are transient caches populated asynchronously by
// real provider fetches — excluded from exact-equality comparisons.
const tripState = (page: Page) =>
  page.evaluate((id) => {
    const t = { ...JSON.parse(localStorage.getItem('wandr-v1')!).state.trips[id] }
    delete t.liveData
    t.days = t.days.map((d: { weather?: unknown }) => { const c = { ...d }; delete c.weather; return c })
    return JSON.stringify(t)
  }, TRIP_ID)

test('"Make it cheaper" on Day 2: scoped change, locked survives, chat message, interactive elsewhere, undo', async ({ page }) => {
  test.setTimeout(120_000)
  await loadApp(page)
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] }, guidanceSeen: true }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'QA Trip' })).toBeVisible({ timeout: 15_000 })
  const s0 = await tripState(page)
  const day1Before = JSON.parse(s0).days[0]

  // Mock: single-shot quick edit. The agent returns a cheaper Day 2 — but tries
  // to DROP the locked card (the client backstop must restore it). Delayed so
  // the processing state is observable.
  await page.route('**/api/chat', async (route) => {
    const body = route.request().postDataJSON() as { mode?: string; messages?: { content: string }[] }
    const msg = (body.messages ?? []).map((m) => m.content).join(' ')
    if (!body.mode && /cheaper/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1800))
      const patch = { tripId: TRIP_ID, dayIds: ['d2'], days: [{ id: 'd2', date: '2026-09-16', dayTitle: 'Two', activities: [act('b9', 'Street Food Crawl', 15)] }] }
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'replace_day_activities', message: 'Cheaper day 2!', patch } }) })
    }
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse({ type: 'done', response: { action: 'chat-only', message: 'hi' } }) })
  })

  // Open Day 2's ⋯ menu → Make it cheaper.
  const day2Card = page.locator('[data-testid="day-card"][data-day-id="d2"]')
  await day2Card.getByTestId('day-quick-menu').click()
  await page.getByRole('menuitem', { name: 'Make it cheaper' }).click()

  // PROCESSING: Day 2 shows the in-progress state, its menu is disabled…
  await expect(day2Card.getByTestId('day-processing')).toBeVisible({ timeout: 5_000 })
  await expect(day2Card.getByTestId('day-quick-menu')).toBeDisabled()
  // …while Day 1 stays fully interactive (no shimmer, menu enabled, editable).
  const day1Card = page.locator('[data-testid="day-card"][data-day-id="d1"]')
  await expect(day1Card.getByTestId('day-processing')).toHaveCount(0)
  await expect(day1Card.getByTestId('day-quick-menu')).toBeEnabled()
  await day1Card.getByRole('button', { name: 'Edit day title' }).click()
  await expect(page.getByPlaceholder('Day title')).toBeVisible()
  await page.keyboard.press('Escape')

  // APPLIED: only Day 2 changed; the locked card survived the agent's drop.
  await expect(page.getByText('Street Food Crawl').first()).toBeVisible({ timeout: 15_000 })
  const s1 = JSON.parse(await tripState(page))
  expect(JSON.stringify(s1.days[0])).toBe(JSON.stringify(day1Before)) // Day 1 untouched
  const day2Titles = s1.days[1].activities.map((a: { title: string }) => a.title)
  expect(day2Titles).toContain('Street Food Crawl')
  expect(day2Titles).toContain('Locked Gem') // backstop re-inserted the locked card
  expect(s1.days[1].activities.find((a: { title: string }) => a.title === 'Locked Gem').locked).toBe(true)

  // The canned instruction is a real user message in chat history.
  const lastUserMsg = await page.evaluate((id) => {
    const msgs = JSON.parse(localStorage.getItem('wandr-v1')!).state.chatHistory[id] ?? []
    return [...msgs].reverse().find((m: { role: string }) => m.role === 'user')?.content ?? ''
  }, TRIP_ID)
  expect(lastUserMsg).toMatch(/Make day 2 cheaper/)
  expect(lastUserMsg).toMatch(/id d2/)

  // Undo (toast label names the day) restores the exact prior state.
  await expect(page.getByTestId('undo-button')).toHaveAttribute('title', /Undo: AI updated Day 2/)
  await page.getByTestId('undo-button').click()
  await expect.poll(() => tripState(page)).toBe(s0)
})
