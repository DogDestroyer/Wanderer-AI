import { describe, it, expect, afterEach } from 'vitest'
import { nowMs, localDateISO, todayIndex, isOnTrip, pickHero, formatStartsIn, mapsLink, minutesOfDay } from '@/lib/dayOf'
import type { TripPlan, Day, Activity } from '@/lib/types'

const act = (id: string, start: string, end: string): Activity => ({
  id, title: id, description: '', category: 'attraction',
  startTime: start, endTime: end, durationMinutes: 60,
  location: { name: id, lat: 35.68, lng: 139.76 }, travelTimeToNextMinutes: 0,
  cost: { amount: 0, currency: 'JPY', isEstimate: true }, locked: false, weatherSensitive: false,
})

const day: Day = { id: 'd1', date: '2026-09-15', activities: [act('a1', '09:00', '10:30'), act('a2', '11:00', '12:00'), act('a3', '14:00', '16:00')] }

const trip = {
  startDate: '2026-09-15', endDate: '2026-09-17',
  days: [day, { id: 'd2', date: '2026-09-16', activities: [] }, { id: 'd3', date: '2026-09-17', activities: [] }],
} as unknown as TripPlan

const g = globalThis as Record<string, unknown>
afterEach(() => { delete g.__HODO_NOW__ })

describe('clock seam', () => {
  it('__HODO_NOW__ overrides Date.now', () => {
    g.__HODO_NOW__ = 1234
    expect(nowMs()).toBe(1234)
    delete g.__HODO_NOW__
    expect(Math.abs(nowMs() - Date.now())).toBeLessThan(50)
  })
})

describe('date logic', () => {
  const on = new Date('2026-09-16T10:00:00').getTime()   // local time, day 2
  const before = new Date('2026-09-10T10:00:00').getTime()
  it('todayIndex / isOnTrip', () => {
    expect(localDateISO(on)).toBe('2026-09-16')
    expect(todayIndex(trip, on)).toBe(1)
    expect(isOnTrip(trip, on)).toBe(true)
    expect(todayIndex(trip, before)).toBe(-1)
    expect(isOnTrip(trip, before)).toBe(false)
  })
})

describe('pickHero', () => {
  it('picks the activity happening now', () => {
    const h = pickHero(day, [], 9 * 60 + 30)
    expect(h).toMatchObject({ status: 'now', startsInMin: 0 })
    expect(h!.activity.id).toBe('a1')
  })
  it('picks the next upcoming with minutes-until-start', () => {
    const h = pickHero(day, [], 10 * 60 + 40) // 10:40 — between a1 and a2
    expect(h).toMatchObject({ status: 'upcoming', startsInMin: 20 })
    expect(h!.activity.id).toBe('a2')
  })
  it('skips done activities', () => {
    const h = pickHero(day, ['a2'], 10 * 60 + 40)
    expect(h!.activity.id).toBe('a3')
  })
  it('null when the day is finished', () => {
    expect(pickHero(day, [], 23 * 60)).toBeNull()
    expect(pickHero(day, ['a1', 'a2', 'a3'], 9 * 60 + 30)).toBeNull()
  })
})

describe('formatting + links', () => {
  it('formatStartsIn', () => {
    expect(formatStartsIn(0)).toBe('now')
    expect(formatStartsIn(40)).toBe('starts in 40m')
    expect(formatStartsIn(90)).toBe('starts in 1h 30m')
    expect(formatStartsIn(120)).toBe('starts in 2h')
  })
  it('mapsLink carries the exact coordinates', () => {
    expect(mapsLink(act('x', '09:00', '10:00'))).toBe('https://www.google.com/maps/search/?api=1&query=35.68,139.76')
  })
  it('minutesOfDay respects the pinned clock', () => {
    g.__HODO_NOW__ = new Date('2026-09-16T13:45:00').getTime()
    expect(minutesOfDay()).toBe(13 * 60 + 45)
  })
})
