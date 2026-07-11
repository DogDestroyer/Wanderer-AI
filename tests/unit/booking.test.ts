import { describe, it, expect } from 'vitest'
import { deriveClusters, deriveBookingRows, needsBooking, bookingFlightLink, rowStatus } from '@/lib/booking'
import type { TripPlan, Activity } from '@/lib/types'

const act = (id: string, title: string, lat: number, lng: number, over: Partial<Activity> = {}): Activity => ({
  id, title, description: '', category: 'attraction',
  startTime: '10:00', endTime: '11:00', durationMinutes: 60,
  location: { name: title, lat, lng }, travelTimeToNextMinutes: 15,
  cost: { amount: 10, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
  ...over,
})

// Two-city fixture: 2 days Tokyo (35.68,139.76), 2 days Kyoto (35.01,135.77) — ~370km apart.
const trip: TripPlan = {
  id: 't', name: 'Two Cities', destination: { name: 'Tokyo, Japan', country: 'Japan', lat: 35.68, lng: 139.76 },
  startDate: '2026-09-15', endDate: '2026-09-18', budget: { cap: 4000, currency: 'SGD' },
  preferences: { paceLevel: 50, budgetLevel: 50, interests: [], flyingFrom: 'Singapore', partySize: 2 },
  days: [
    { id: 'd1', date: '2026-09-15', activities: [act('a1', 'Senso-ji', 35.71, 139.79)] },
    { id: 'd2', date: '2026-09-16', activities: [act('a2', 'Shibuya', 35.66, 139.70)] },
    { id: 'd3', date: '2026-09-17', activities: [act('a3', 'Kyoto', 35.01, 135.77), act('a4', 'Kyoto', 35.02, 135.76)] },
    { id: 'd4', date: '2026-09-18', activities: [act('a5', 'Kyoto', 35.00, 135.78)] },
  ],
  suggestions: [], createdAt: 'x', updatedAt: 'x',
}

describe('deriveClusters', () => {
  it('groups consecutive days by geography and labels sensibly', () => {
    const clusters = deriveClusters(trip)
    expect(clusters).toHaveLength(2)
    expect(clusters[0]).toMatchObject({ startIdx: 0, endIdx: 1, label: 'Tokyo' })     // destination city
    expect(clusters[1]).toMatchObject({ startIdx: 2, endIdx: 3, label: 'Kyoto' })     // mode location name
  })
  it('a day without coordinates inherits the previous cluster', () => {
    const t2 = { ...trip, days: [trip.days[0], { id: 'dx', date: '2026-09-16', activities: [] }, trip.days[2]] }
    const clusters = deriveClusters(t2 as TripPlan)
    expect(clusters[0].endIdx).toBe(1) // empty day stays with Tokyo
    expect(clusters).toHaveLength(2)
  })
})

describe('deriveBookingRows', () => {
  const rows = deriveBookingRows(trip)

  it('derives 3 flight legs (out, inter-city, return) with dates', () => {
    const flights = rows.filter((r) => r.group === 'flights')
    expect(flights.map((f) => f.title)).toEqual(['Singapore → Tokyo', 'Tokyo → Kyoto', 'Kyoto → Singapore'])
    expect(flights[1].key).toContain('2026-09-17') // inter-city leg on the Kyoto arrival day
  })

  it('derives one stay per city with correct night counts and prefilled dates', () => {
    const stays = rows.filter((r) => r.group === 'stays')
    expect(stays).toHaveLength(2)
    expect(stays[0].title).toBe('Tokyo · 2 nights')
    expect(stays[0].checkIn).toBe('2026-09-15')
    expect(stays[0].checkOut).toBe('2026-09-17')
    expect(stays[1].title).toBe('Kyoto · 2 nights')
    expect(stays[0].link).toContain('checkIn=2026-09-15')
    expect(stays[0].link).toContain('checkOut=2026-09-17')
    expect(stays[0].link).toContain('adults=2')
  })

  it('includes only reservation-worthy activities', () => {
    expect(rows.filter((r) => r.group === 'activities')).toHaveLength(0) // free strolls stay out
    const withBooking = {
      ...trip,
      days: [{
        id: 'd1', date: '2026-09-15', activities: [
          act('b1', 'teamLab', 35.6, 139.7, { agentNotes: 'Timed entry — book tickets in advance.' }),
          act('b2', 'Ghibli Museum', 35.7, 139.5, { bookingUrl: 'https://example.com/tickets?marker=hodo123' }),
          act('b3', 'Free park stroll', 35.7, 139.7),
        ],
      }],
    } as TripPlan
    const actRows = deriveBookingRows(withBooking).filter((r) => r.group === 'activities')
    expect(actRows.map((r) => r.title)).toEqual(['teamLab', 'Ghibli Museum'])
    expect(actRows[1].link).toContain('marker=hodo123') // explicit bookingUrl verbatim
  })

  it('the primary flight leg prefers the live provider deep link', () => {
    const withLive = { ...trip, liveData: { fetchedAt: 1, key: 'k', hotels: [], flight: { source: 'travelpayouts', originCode: 'SIN', destinationCode: 'TYO', departDate: '2026-09-15', price: 420, currency: 'USD', isIndicative: true, isEstimate: false, deepLink: 'https://tp.example/f?marker=hodo123' } } } as unknown as TripPlan
    const flights = deriveBookingRows(withLive).filter((r) => r.group === 'flights')
    expect(flights[0].link).toBe('https://tp.example/f?marker=hodo123')
    expect(flights[0].estCost).toMatchObject({ amount: 420, currency: 'USD' })
  })
})

describe('bookingFlightLink', () => {
  it('builds an Aviasales search when both IATA codes resolve', () => {
    const { url, label } = bookingFlightLink('Singapore', 'Tokyo', '2026-09-15')
    expect(url).toBe('https://www.aviasales.com/search/SIN1509TYO1')
    expect(label).toBe('Book on Aviasales')
  })
  it('falls back to a Google Flights text search otherwise', () => {
    const { url } = bookingFlightLink('Smalltown', 'Tokyo', '2026-09-15')
    expect(url).toContain('google.com/travel/flights')
    expect(url).toContain('Smalltown')
  })
})

describe('needsBooking / rowStatus', () => {
  it('flags bookingUrl or reservation-ish language only', () => {
    expect(needsBooking(act('x', 'X', 0, 0, { bookingUrl: 'https://x' }))).toBe(true)
    expect(needsBooking(act('x', 'X', 0, 0, { description: 'Reserve a table ahead.' , category: 'food' }))).toBe(true)
    expect(needsBooking(act('x', 'X', 0, 0, { description: 'A pleasant stroll.' }))).toBe(false)
    expect(needsBooking(act('x', 'X', 0, 0, { category: 'transport', description: 'book tickets' }))).toBe(false)
  })
  it('explicit status wins; a linked reservation implies booked', () => {
    const rows = deriveBookingRows(trip)
    const stay = rows.find((r) => r.group === 'stays')!
    expect(rowStatus(trip, stay)).toBeNull()
    expect(rowStatus({ ...trip, bookingStatus: { [stay.key]: 'skipped' } }, stay)).toBe('skipped')
    const withRes = { ...trip, reservations: [{ id: 'r1', type: 'activity', name: 'x', status: 'booked', activityId: 'a1' }] } as TripPlan
    const actRow = { ...stay, activityId: 'a1' }
    expect(rowStatus(withRes, actRow)).toBe('booked')
  })
})
