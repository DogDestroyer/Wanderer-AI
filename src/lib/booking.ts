// ─── Booking derivation (pure, unit-tested) ───────────────────────────────────
// Turns the trip state into a booking checklist: flight legs, hotel stays and
// reservation-worthy activities. View-layer only — no AI, no new state shapes;
// "Mark as booked" flows into the EXISTING Reservations machinery.

import type { TripPlan, Day, Activity, Cost } from './types'
import { hotelDeepLink } from './deeplinks'
import { resolveIata } from './providers/travelpayouts'
import { addDays } from './wizard'

export type BookingGroup = 'flights' | 'stays' | 'activities'
export type BookingStatus = 'booked' | 'skipped'

export interface BookingRow {
  key: string            // stable identity for status tracking + undo labels
  group: BookingGroup
  title: string
  dates: string          // human "Sep 15 – 19" / "Sep 18"
  checkIn?: string       // ISO — stays only
  checkOut?: string
  estCost: Cost | null   // in original currency; view converts for display
  link: string | null    // affiliate-carrying deep link where available
  linkLabel: string
  activityId?: string    // activity rows: ties status to existing reservations
  indicative: boolean    // price is an indication, not a quote
}

// ── City clustering ───────────────────────────────────────────────────────────
// We have no explicit per-day city, so stays are derived from GEOGRAPHY: each
// day's activity-coordinate centroid, with consecutive days within ~60km
// forming one stay. Labels: the cluster containing day 1 uses the trip's
// destination city; later clusters use the most frequent location name (best
// available text — hotel search links tolerate venue-ish queries).

interface Cluster { startIdx: number; endIdx: number; label: string }

const KM_THRESHOLD = 60

function centroid(day: Day): { lat: number; lng: number } | null {
  const pts = day.activities.filter((a) => a.location && (a.location.lat !== 0 || a.location.lng !== 0))
  if (pts.length === 0) return null
  return {
    lat: pts.reduce((s, a) => s + a.location.lat, 0) / pts.length,
    lng: pts.reduce((s, a) => s + a.location.lng, 0) / pts.length,
  }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

function cityPart(destinationName: string): string {
  return destinationName.split(',')[0].trim()
}

function modeLocationName(days: Day[]): string {
  const counts = new Map<string, number>()
  for (const d of days) for (const a of d.activities) {
    const n = a.location?.name?.trim()
    if (n) counts.set(n, (counts.get(n) ?? 0) + 1)
  }
  let best = ''
  let bestN = 0
  for (const [n, c] of counts) if (c > bestN) { best = n; bestN = c }
  return best
}

export function deriveClusters(trip: TripPlan): Cluster[] {
  const clusters: Cluster[] = []
  let prev: { lat: number; lng: number } | null = null
  for (let i = 0; i < trip.days.length; i++) {
    const c: { lat: number; lng: number } | null = centroid(trip.days[i]) ?? prev
    if (clusters.length === 0 || (c && prev && distanceKm(prev, c) > KM_THRESHOLD)) {
      clusters.push({ startIdx: i, endIdx: i, label: '' })
    } else {
      clusters[clusters.length - 1].endIdx = i
    }
    if (c) prev = c
  }
  for (const cl of clusters) {
    cl.label = cl.startIdx === 0
      ? cityPart(trip.destination.name)
      : modeLocationName(trip.days.slice(cl.startIdx, cl.endIdx + 1)) || cityPart(trip.destination.name)
  }
  return clusters
}

// ── Link builders ─────────────────────────────────────────────────────────────

/** Aviasales flight search when both IATA codes resolve; Google Flights text
 *  search otherwise (a sensible link beats no link). */
export function bookingFlightLink(fromLabel: string, toLabel: string, date: string): { url: string; label: string } {
  const o = resolveIata(fromLabel)
  const d = resolveIata(toLabel)
  if (o && d) {
    const ddmm = `${date.slice(8, 10)}${date.slice(5, 7)}`
    return { url: `https://www.aviasales.com/search/${o}${ddmm}${d}1`, label: 'Book on Aviasales' }
  }
  const q = encodeURIComponent(`Flights from ${fromLabel} to ${toLabel} on ${date}`)
  return { url: `https://www.google.com/travel/flights?q=${q}`, label: 'Search flights' }
}

// ── Row derivation ────────────────────────────────────────────────────────────

const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Activities that plausibly need advance booking: an explicit bookingUrl, or
 *  reservation-ish language in the agent's notes/description on a non-free,
 *  non-transport item. Free strolls stay out of the checklist. */
export function needsBooking(a: Activity): boolean {
  if (a.bookingUrl) return true
  if (!['attraction', 'experience', 'food'].includes(a.category)) return false
  const text = `${a.agentNotes ?? ''} ${a.description ?? ''}`
  return /\b(book|booking|reserve|reservation|tickets?|advance|timed entry|sells? out|sold.?out)\b/i.test(text)
}

export function deriveBookingRows(trip: TripPlan): BookingRow[] {
  const rows: BookingRow[] = []
  const clusters = deriveClusters(trip)
  const origin = trip.preferences?.flyingFrom?.trim()
  const cur = trip.budget.currency

  // ── Flights: origin → first city, inter-city legs, return ──────────────────
  const legs: Array<{ from: string; to: string; date: string }> = []
  if (origin) legs.push({ from: origin, to: clusters[0]?.label ?? cityPart(trip.destination.name), date: trip.startDate })
  for (let i = 1; i < clusters.length; i++) {
    legs.push({ from: clusters[i - 1].label, to: clusters[i].label, date: trip.days[clusters[i].startIdx].date })
  }
  if (origin) legs.push({ from: clusters[clusters.length - 1]?.label ?? cityPart(trip.destination.name), to: origin, date: trip.endDate })

  legs.forEach((leg, i) => {
    // The primary leg prefers the LIVE provider link (it carries the affiliate
    // marker exactly as fetched); constructed links are the fallback.
    const live = i === 0 && trip.liveData?.flight ? trip.liveData.flight : null
    const built = bookingFlightLink(leg.from, leg.to, leg.date)
    rows.push({
      key: `flight:${leg.from}->${leg.to}:${leg.date}`,
      group: 'flights',
      title: `${leg.from} → ${leg.to}`,
      dates: fmt(leg.date),
      estCost: live ? { amount: live.price, currency: live.currency, isEstimate: false } : null,
      link: live?.deepLink ?? built.url,
      linkLabel: live ? 'Book flight' : built.label,
      indicative: true,
    })
  })

  // ── Stays: one row per consecutive-nights city cluster ──────────────────────
  for (const cl of clusters) {
    const checkIn = trip.days[cl.startIdx].date
    const checkOut = addDays(trip.days[cl.endIdx].date, 1)
    const nights = cl.endIdx - cl.startIdx + 1
    // Nightly estimate: cheapest live hotel if this is the primary city, else null.
    const liveHotel = cl.startIdx === 0 ? (trip.liveData?.hotels ?? [])[0] : undefined
    rows.push({
      key: `stay:${cl.label}:${checkIn}`,
      group: 'stays',
      title: `${cl.label} · ${nights} night${nights === 1 ? '' : 's'}`,
      dates: `${fmt(checkIn)} – ${fmt(checkOut)}`,
      checkIn,
      checkOut,
      estCost: liveHotel ? { amount: liveHotel.pricePerNight * nights, currency: liveHotel.currency, isEstimate: liveHotel.isEstimate } : null,
      link: hotelDeepLink({ query: cl.label, checkIn, checkOut, adults: trip.preferences?.partySize ?? 2 }),
      linkLabel: 'Book on Agoda',
      indicative: true,
    })
  }

  // ── Activities that plausibly need advance booking ──────────────────────────
  for (const day of trip.days) {
    for (const a of day.activities) {
      if (!needsBooking(a)) continue
      rows.push({
        key: `act:${a.id}`,
        group: 'activities',
        title: a.title,
        dates: fmt(day.date),
        estCost: a.cost.amount > 0 ? a.cost : null,
        link: a.bookingUrl ?? `https://www.google.com/search?q=${encodeURIComponent(`${a.title} ${cityPart(trip.destination.name)} tickets`)}`,
        linkLabel: a.bookingUrl ? 'Book now' : 'Find tickets',
        activityId: a.id,
        indicative: a.cost.isEstimate,
      })
    }
  }

  void cur
  return rows
}

/** Resolve a row's status: explicit trip.bookingStatus wins; an activity row
 *  with a live linked reservation also counts as booked. */
export function rowStatus(trip: TripPlan, row: BookingRow): BookingStatus | null {
  const explicit = trip.bookingStatus?.[row.key] as BookingStatus | undefined
  if (explicit) return explicit
  if (row.activityId && (trip.reservations ?? []).some((r) => r.activityId === row.activityId && r.status !== 'cancelled')) {
    return 'booked'
  }
  return null
}
