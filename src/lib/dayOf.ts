// ─── Day-of mode helpers (pure, unit-tested) ──────────────────────────────────
// Everything the Today view computes from the trip + device time. Client-side
// only, no AI, no network: works offline from persisted local state.

import type { TripPlan, Day, Activity } from './types'

/** Test seam: fixtures pin the clock via globalThis.__HODO_NOW__ (epoch ms). */
export function nowMs(): number {
  const override = (globalThis as Record<string, unknown>).__HODO_NOW__
  return typeof override === 'number' ? override : Date.now()
}

/** Local calendar date as YYYY-MM-DD (trip dates are local-date strings). */
export function localDateISO(ms: number = nowMs()): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Index of today's day within the trip; -1 when today is outside the dates. */
export function todayIndex(trip: TripPlan, ms: number = nowMs()): number {
  const today = localDateISO(ms)
  return trip.days.findIndex((d) => d.date === today)
}

/** True when the device date falls within the trip's date range. */
export function isOnTrip(trip: TripPlan, ms: number = nowMs()): boolean {
  const today = localDateISO(ms)
  return today >= trip.startDate && today <= trip.endDate
}

export function minutesOfDay(ms: number = nowMs()): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

const hm = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export interface HeroPick {
  activity: Activity
  /** 'now' while inside the window; otherwise minutes until start. */
  status: 'now' | 'upcoming'
  startsInMin: number
}

/** The hero card: the activity happening NOW, else the next upcoming one.
 *  Done items are skipped (you've moved on). Null when the day is finished. */
export function pickHero(day: Day, doneIds: string[], nowMin: number): HeroPick | null {
  const done = new Set(doneIds)
  const pending = day.activities.filter((a) => !done.has(a.id))
  const current = pending.find((a) => hm(a.startTime) <= nowMin && nowMin < hm(a.endTime))
  if (current) return { activity: current, status: 'now', startsInMin: 0 }
  const next = pending
    .filter((a) => hm(a.startTime) > nowMin)
    .sort((a, b) => hm(a.startTime) - hm(b.startTime))[0]
  if (next) return { activity: next, status: 'upcoming', startsInMin: hm(next.startTime) - nowMin }
  return null
}

export function formatStartsIn(min: number): string {
  if (min <= 0) return 'now'
  if (min < 60) return `starts in ${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `starts in ${h}h${m > 0 ? ` ${m}m` : ''}`
}

/** Google Maps link from stored coordinates — defers to the OS/app offline. */
export function mapsLink(a: Activity): string {
  return `https://www.google.com/maps/search/?api=1&query=${a.location.lat},${a.location.lng}`
}
