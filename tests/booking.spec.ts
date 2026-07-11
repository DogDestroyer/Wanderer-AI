import { test, expect, type Page } from '@playwright/test'

// "Book this trip": the booking view derives correct rows from a 2-city trip
// (flight legs, per-city stays with night counts, only reservation-worthy
// activities), affiliate links carry the marker + prefilled dates, and
// "Mark as booked" creates a real Reservation (budget actuals + itinerary
// badge + progress follow), all undoable.

import { loadApp } from './helpers/app'

const TRIP_ID = 'trip_book'
const act = (id: string, title: string, lat: number, lng: number, over: Record<string, unknown> = {}) => ({
  id, title, description: 'x', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: title, lat, lng }, travelTimeToNextMinutes: 15,
  cost: { amount: 3000, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
  ...over,
})

// Two cities >60km apart: Tokyo days 1-2, Kyoto days 3-4.
const SEED = {
  id: TRIP_ID, name: 'Booking Trip', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-18', budget: { cap: 4000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [], flyingFrom: 'Singapore', partySize: 2 },
  days: [
    { id: 'd1', date: '2026-09-15', activities: [
      act('a1', 'Senso-ji Temple', 35.71, 139.79),
      act('a2', 'teamLab Planets', 35.65, 139.79, { agentNotes: 'Timed entry — book tickets in advance, it sells out.' }),
    ] },
    { id: 'd2', date: '2026-09-16', activities: [act('a3', 'Shibuya Crossing', 35.66, 139.70, { cost: { amount: 0, currency: 'JPY', isEstimate: true } })] },
    { id: 'd3', date: '2026-09-17', activities: [act('b1', 'Fushimi Inari', 34.97, 135.77, { location: { name: 'Kyoto', lat: 34.97, lng: 135.77 } })] },
    { id: 'd4', date: '2026-09-18', activities: [act('b2', 'Kinkaku-ji', 35.04, 135.73, { location: { name: 'Kyoto', lat: 35.04, lng: 135.73 } })] },
  ],
  suggestions: [], createdAt: 'x', updatedAt: 'x',
  // Cached live flight (key matches the trip params → no refetch). The deep
  // link carries the affiliate marker exactly as the provider returned it.
  liveData: {
    fetchedAt: 1, key: 'Singapore|Tokyo|2026-09-15|2026-09-18|mid-range',
    hotels: [],
    flight: { source: 'travelpayouts', originCode: 'SIN', destinationCode: 'TYO', departDate: '2026-09-15', price: 420, currency: 'SGD', isIndicative: true, isEstimate: false, deepLink: 'https://www.aviasales.com/search/SIN1509TYO1?marker=hodo123' },
  },
}

// liveData + weather are transient provider caches — excluded from equality.
const tripState = (page: Page) =>
  page.evaluate((id) => {
    const t = { ...JSON.parse(localStorage.getItem('wandr-v1')!).state.trips[id] }
    delete t.liveData
    t.days = t.days.map((d: { weather?: unknown }) => { const c = { ...d }; delete c.weather; return c })
    return JSON.stringify(t)
  }, TRIP_ID)

async function seed(page: Page) {
  await loadApp(page)
  // Belt & braces: never let a real prices fetch overwrite the seeded cache.
  await page.route('**/api/live-prices', (route) => route.fulfill({ status: 500, body: '{}' }))
  await page.evaluate((trip) => {
    localStorage.setItem('wandr-v1', JSON.stringify({ state: { trips: { [trip.id]: trip }, activeTripId: trip.id, chatHistory: { [trip.id]: [] }, guidanceSeen: true }, version: 0 }))
  }, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Booking Trip' })).toBeVisible({ timeout: 15_000 })
}

test('derives flight legs, city stays and reservation-worthy activities with affiliate links', async ({ page }) => {
  await seed(page)

  // The header button is unpushy secondary styling and opens the Book tab.
  await page.getByTestId('book-trip-button').click()
  await expect(page.getByTestId('booking-progress')).toBeVisible()
  await expect(page.getByTestId('booking-progress')).toContainText('0 of 6 booked or skipped')

  const rows = page.getByTestId('booking-row')
  await expect(rows).toHaveCount(6) // 3 flights + 2 stays + 1 activity

  // Flight legs: origin → Tokyo, Tokyo → Kyoto, Kyoto → origin.
  await expect(rows.nth(0)).toContainText('Singapore → Tokyo')
  await expect(rows.nth(1)).toContainText('Tokyo → Kyoto')
  await expect(rows.nth(2)).toContainText('Kyoto → Singapore')
  // The primary leg uses the cached provider link, marker intact.
  const firstLink = rows.nth(0).getByTestId('booking-link')
  await expect(firstLink).toHaveAttribute('href', /marker=hodo123/)
  await expect(firstLink).toHaveAttribute('target', '_blank')

  // Stays: one per city cluster with correct night counts + prefilled dates.
  await expect(rows.nth(3)).toContainText('Tokyo · 2 nights')
  const tokyoStayLink = rows.nth(3).getByTestId('booking-link')
  await expect(tokyoStayLink).toHaveAttribute('href', /checkIn=2026-09-15/)
  await expect(tokyoStayLink).toHaveAttribute('href', /checkOut=2026-09-17/)
  await expect(tokyoStayLink).toHaveAttribute('href', /adults=2/)
  await expect(rows.nth(4)).toContainText('Kyoto · 2 nights')
  await expect(rows.nth(4).getByTestId('booking-link')).toHaveAttribute('href', /checkIn=2026-09-17/)

  // Activities: ONLY the reservation-worthy one (teamLab); strolls stay out.
  await expect(rows.nth(5)).toContainText('teamLab Planets')
  await expect(page.getByTestId('booking-row').filter({ hasText: 'Senso-ji' })).toHaveCount(0)
  await expect(page.getByTestId('booking-row').filter({ hasText: 'Shibuya' })).toHaveCount(0)

  // Honesty: indicative label + visible affiliate disclosure.
  await expect(rows.nth(0)).toContainText('indicative')
  await expect(page.getByText(/may earn Hodo a commission/)).toBeVisible()
})

test('Mark as booked creates a Reservation, updates budget actuals + itinerary badge; undo reverts', async ({ page }) => {
  await seed(page)
  const s0 = await tripState(page)

  await page.getByTestId('book-trip-button').click()
  const teamLabRow = page.getByTestId('booking-row').filter({ hasText: 'teamLab Planets' })

  // Inline form, prefilled from the row; enter actual price + confirmation.
  await teamLabRow.getByRole('button', { name: 'Mark as booked' }).click()
  await expect(page.getByTestId('booked-form')).toBeVisible()
  await page.getByTestId('booked-form').getByPlaceholder('e.g. 420').fill('42')
  await page.getByTestId('booked-form').getByPlaceholder('e.g. ABC123').fill('TL-9876')
  await page.getByTestId('booked-save').click()

  // Row flips to Booked; progress advances.
  await expect(teamLabRow).toHaveAttribute('data-status', 'booked')
  await expect(page.getByTestId('booking-progress')).toContainText('1 of 6')

  // A real linked Reservation exists in state (existing machinery).
  const res = await page.evaluate((id) => JSON.parse(localStorage.getItem('wandr-v1')!).state.trips[id].reservations, TRIP_ID)
  expect(res).toHaveLength(1)
  expect(res[0]).toMatchObject({ type: 'activity', activityId: 'a2', confirmationNumber: 'TL-9876', status: 'booked' })
  expect(res[0].cost).toMatchObject({ amount: 42, currency: 'SGD', isEstimate: false })

  // Budget tab shows the reserved ACTUAL spend.
  await page.getByRole('button', { name: 'Budget', exact: true }).click()
  await expect(page.getByText('Estimated vs reserved')).toBeVisible()
  await expect(page.getByText(/^SGD\s42$/)).toBeVisible() // the actual, not the estimate (Intl may use NBSP)

  // The itinerary card is badged Reserved.
  await page.getByRole('button', { name: 'Itinerary' }).click()
  const card = page.getByTestId('activity-card').filter({ hasText: 'teamLab Planets' })
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByText('Reserved')).toBeVisible()

  // Skip is a distinct, honest status.
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  const kyotoStay = page.getByTestId('booking-row').filter({ hasText: 'Kyoto · 2 nights' })
  await kyotoStay.getByRole('button', { name: 'Skip' }).click()
  await expect(kyotoStay).toHaveAttribute('data-status', 'skipped')
  await expect(page.getByTestId('booking-progress')).toContainText('2 of 6')

  // Undo twice (skip, then booking) restores the exact pre-booking state.
  await page.getByTestId('undo-button').click()
  await expect(kyotoStay).toHaveAttribute('data-status', 'none')
  await page.getByTestId('undo-button').click()
  await expect(teamLabRow).toHaveAttribute('data-status', 'none')
  await expect(page.getByTestId('booking-progress')).toContainText('0 of 6')
  await expect.poll(() => tripState(page)).toBe(s0)
})
