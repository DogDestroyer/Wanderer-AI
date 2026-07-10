import type { TripPlan } from './types'
import { convertAmount, convertCost, type RatesMap } from './currency'
import { calculateDayBudgetConverted, calculateTripBudgetConverted } from './recalculate'
import { deriveDayTitle } from './dayTitle'
import {
  formatCurrency, formatTime, formatDateRange, formatNights,
  getBudgetLabel, getPaceLabel, getTripStyleLabel,
} from './utils'

// ─── Client-side export (NO API calls) ────────────────────────────────────────
// Everything below renders the already-structured trip state into text formats.
// Pure code — no model calls, no server round trips.

export function slugify(name: string): string {
  return (name || 'trip').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trip'
}

function partySummary(trip: TripPlan): string {
  const p = trip.preferences
  const parts: string[] = []
  if (p.partyType) parts.push(p.partySize ? `${p.partyType} (${p.partySize})` : p.partyType)
  parts.push(getBudgetLabel(p.budgetLevel))
  parts.push(`${getPaceLabel(p.paceLevel)} pace`)
  if (p.tripStyle !== undefined) parts.push(getTripStyleLabel(p.tripStyle))
  return parts.join(' · ')
}

function money(amount: number, currency: string, to: string, rates: RatesMap): string {
  return formatCurrency(convertAmount(amount, currency, to, rates), to)
}

// ─── Markdown ──────────────────────────────────────────────────────────────────

export function tripToMarkdown(trip: TripPlan, rates: RatesMap): string {
  const cur = trip.budget.currency
  const L: string[] = []
  L.push(`# ${trip.name}`)
  L.push('')
  L.push(`**${formatDateRange(trip.startDate, trip.endDate)}** · ${formatNights(trip.startDate, trip.endDate)}`)
  L.push(`${partySummary(trip)}`)
  L.push('')

  // Flights & stays
  const flight = trip.liveData?.flight
  if (flight) {
    L.push(`## Flight`)
    L.push(`- ${flight.originCode} → ${flight.destinationCode}${flight.airline ? ` (${flight.airline})` : ''}: ${money(flight.price, flight.currency, cur, rates)}${flight.isIndicative ? ' _(indicative)_' : ''}`)
    L.push('')
  }

  // Days
  trip.days.forEach((day, i) => {
    const title = deriveDayTitle(day)
    L.push(`## Day ${i + 1}${title ? ` · ${title}` : ''} — ${day.date}`)
    for (const a of day.activities) {
      const cost = a.cost.amount > 0 ? ` — ${money(a.cost.amount, a.cost.currency, cur, rates)}${a.cost.isEstimate ? ' (est.)' : ''}` : ''
      const loc = a.location?.name ? ` @ ${a.location.name}` : ''
      L.push(`- ${formatTime(a.startTime)} **${a.title}**${loc}${cost}`)
    }
    const dayTotal = calculateDayBudgetConverted(day.activities, cur, rates)
    if (dayTotal > 0) L.push(`- _Day total: ${formatCurrency(dayTotal, cur)}_`)
    L.push('')
  })

  // Budget
  const spent = calculateTripBudgetConverted(trip.days, cur, rates)
  const flightCost = flight ? convertAmount(flight.price, flight.currency, cur, rates) : 0
  const reserved = (trip.reservations ?? [])
    .filter((r) => r.status !== 'cancelled' && r.cost)
    .reduce((s, r) => s + convertCost(r.cost!, cur, rates), 0)
  L.push(`## Budget (${cur})`)
  L.push(`- Estimated spend: ${formatCurrency(spent + flightCost, cur)}${trip.budget.cap > 0 ? ` / cap ${formatCurrency(trip.budget.cap, cur)}` : ''}`)
  if (reserved > 0) L.push(`- Reserved (actual): ${formatCurrency(reserved, cur)}`)
  L.push('')

  // Reservations
  const reservations = trip.reservations ?? []
  if (reservations.length) {
    L.push(`## Reservations`)
    for (const r of reservations) {
      const when = r.date ? ` — ${r.date}${r.time ? ` ${formatTime(r.time)}` : ''}` : ''
      const conf = r.confirmationNumber ? ` #${r.confirmationNumber}` : ''
      const cost = r.cost ? ` (${money(r.cost.amount, r.cost.currency, cur, rates)})` : ''
      L.push(`- **${r.name}** _(${r.type})_${when}${conf}${cost} — ${r.status}`)
    }
    L.push('')
  }

  // Checklist
  const checklist = trip.checklist ?? []
  if (checklist.length) {
    L.push(`## Checklist`)
    const sections = [...new Set(checklist.map((i) => i.section))]
    for (const section of sections) {
      L.push(`### ${section}`)
      for (const item of checklist.filter((i) => i.section === section).sort((a, b) => a.order - b.order)) {
        L.push(`- [${item.done ? 'x' : ' '}] ${item.text}`)
      }
      L.push('')
    }
  }

  return L.join('\n').trim() + '\n'
}

// ─── Plain text (compact, for clipboard) ──────────────────────────────────────

export function tripToPlainText(trip: TripPlan, rates: RatesMap): string {
  const cur = trip.budget.currency
  const L: string[] = []
  L.push(`${trip.name} — ${formatDateRange(trip.startDate, trip.endDate)} (${formatNights(trip.startDate, trip.endDate)})`)
  L.push(partySummary(trip))
  trip.days.forEach((day, i) => {
    const title = deriveDayTitle(day)
    L.push('')
    L.push(`Day ${i + 1}${title ? ` · ${title}` : ''} — ${day.date}`)
    for (const a of day.activities) {
      const cost = a.cost.amount > 0 ? `  ${money(a.cost.amount, a.cost.currency, cur, rates)}` : ''
      L.push(`  ${formatTime(a.startTime)}  ${a.title}${a.location?.name ? ` (${a.location.name})` : ''}${cost}`)
    }
  })
  const reservations = trip.reservations ?? []
  if (reservations.length) {
    L.push('')
    L.push('Reservations:')
    for (const r of reservations) L.push(`  - ${r.name} (${r.type}) — ${r.status}`)
  }
  const checklist = trip.checklist ?? []
  if (checklist.length) {
    L.push('')
    L.push(`Checklist (${checklist.filter((i) => i.done).length}/${checklist.length}):`)
    for (const item of checklist) L.push(`  [${item.done ? 'x' : ' '}] ${item.text}`)
  }
  return L.join('\n')
}

// ─── File download ─────────────────────────────────────────────────────────────

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
