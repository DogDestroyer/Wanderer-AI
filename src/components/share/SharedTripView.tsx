'use client'

// ─── SharedTripView ───────────────────────────────────────────────────────────
// Read-only rendering of a shared trip snapshot (/t/{id}). Deliberately renders
// NO editing affordances: no drag handles, locks, edit pencils, chat, quick
// actions, wizard or mutating tabs — just the itinerary, budget summary, live
// travel prices (deep links verbatim from the snapshot, affiliate markers
// intact) and a map. Mobile-first single column.

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { MapPin, Calendar, Gauge, Star, Clock, ExternalLink } from 'lucide-react'
import type { TripPlan, Activity } from '@/lib/types'
import { cn, formatCurrency, formatTime, formatDurationMins, formatDateRange, formatNights, getPaceLabel, getBudgetLabel, getCategoryEmoji } from '@/lib/utils'
import { convertCost, FALLBACK_RATES, type RatesMap } from '@/lib/currency'
import { deriveDayTitle } from '@/lib/dayTitle'

const TripMap = dynamic(() => import('@/components/map/TripMap').then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="h-[420px] flex items-center justify-center text-[12px] text-[#444]">Loading map…</div>,
})

export function SharedTripView({ trip, liveRates }: { trip: TripPlan; liveRates: RatesMap | null }) {
  const rates = liveRates ?? FALLBACK_RATES
  const [tab, setTab] = useState<'itinerary' | 'map'>('itinerary')
  const { budget, preferences } = trip

  const cur = budget.currency
  const conv = (a: Activity) => convertCost(a.cost, cur, rates)
  const dayTotal = (acts: Activity[]) => acts.reduce((s, a) => s + conv(a), 0)
  const total = trip.days.reduce((s, d) => s + dayTotal(d.activities), 0)
  const flight = trip.liveData?.flight ?? null
  const flightCost = flight ? convertCost({ amount: flight.price, currency: flight.currency }, cur, rates) : 0
  const grandTotal = total + flightCost
  const capSet = budget.cap > 0
  const over = capSet && grandTotal > budget.cap

  // Per-category breakdown for the budget summary.
  const byCategory = new Map<string, number>()
  for (const d of trip.days) for (const a of d.activities) {
    byCategory.set(a.category, (byCategory.get(a.category) ?? 0) + conv(a))
  }
  const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])

  const hotels = trip.liveData?.hotels ?? []

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f0f0f0]">
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8 pb-16">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <p className="text-[10px] font-bold tracking-[0.35em] uppercase text-[#444] mb-6">HODO · SHARED TRIP</p>
        <h1 className="text-2xl font-bold leading-tight">{trip.name}</h1>
        <div className="flex items-center gap-1 mt-1.5">
          <MapPin size={12} className="text-[#555]" />
          <span className="text-[13px] text-[#888]">{trip.destination.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mt-4">
          <Chip icon={<Calendar size={10} />} label={formatDateRange(trip.startDate, trip.endDate)} />
          <Chip icon={<Calendar size={10} />} label={formatNights(trip.startDate, trip.endDate)} />
          {preferences && (
            <>
              <Chip icon={<Gauge size={10} />} label={getPaceLabel(preferences.paceLevel)} />
              <Chip icon={<Star size={10} />} label={getBudgetLabel(preferences.budgetLevel)} />
              {preferences.partyType && <Chip label={preferences.partyType[0].toUpperCase() + preferences.partyType.slice(1)} />}
            </>
          )}
        </div>

        {/* Budget line */}
        <div className="mt-5 p-3.5 rounded-xl bg-[#111111] border border-[#1f1f1f]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#555]">Estimated total</span>
            <span className={cn('text-[14px] font-bold tabular-nums', over ? 'text-[#ef4444]' : 'text-[#f0f0f0]')}>
              {formatCurrency(grandTotal, cur)}
              {capSet && <span className="text-[#444] font-normal text-[12px]"> / {formatCurrency(budget.cap, cur)}</span>}
            </span>
          </div>
          {capSet && (
            <div className="h-px bg-[#1f1f1f] rounded-full overflow-hidden mt-2">
              <div className={cn('h-full', over ? 'bg-[#ef4444]' : 'bg-white')} style={{ width: `${Math.min((grandTotal / budget.cap) * 100, 100)}%` }} />
            </div>
          )}
        </div>

        {/* ── Tabs: Itinerary | Map (read-only both) ─────────────────────────── */}
        <div className="flex gap-0 border-b border-[#1f1f1f] mt-6">
          {(['itinerary', 'map'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors capitalize',
                tab === t ? 'border-white text-[#f0f0f0]' : 'border-transparent text-[#555] hover:text-[#888]',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'map' ? (
          <div className="mt-4 rounded-xl overflow-hidden border border-[#1f1f1f] h-[420px]">
            <TripMap trip={trip} />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {/* Live travel prices (snapshot data; deep links verbatim → affiliate intact) */}
            {(hotels.length > 0 || flight) && (
              <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4">
                <p className="text-[12px] font-semibold text-[#f0f0f0] mb-3">Flights & stays</p>
                {flight && (
                  <a
                    href={flight.deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 mb-3 group"
                  >
                    <span className="text-[12px] text-[#aaa] group-hover:text-white transition-colors">
                      ✈ {flight.originCode} → {flight.destinationCode}
                      {flight.isIndicative && (
                        <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-[#666]" title="Cached aggregate price — verify via the booking link">
                          indicative
                        </span>
                      )}
                    </span>
                    <span className="text-[12px] font-semibold tabular-nums flex items-center gap-1">
                      {formatCurrency(flightCost, cur)} <ExternalLink size={10} className="text-[#555]" />
                    </span>
                  </a>
                )}
                {hotels.length > 0 && (
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {hotels.map((h) => (
                      <a
                        key={h.hotelId ?? h.name}
                        href={h.deepLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="shared-hotel-link"
                        className="shrink-0 w-[150px] rounded-lg border border-[#1f1f1f] bg-[#0d0d0d] p-2.5 hover:border-[#333] transition-colors"
                      >
                        <p className="text-[11px] font-semibold text-[#e0e0e0] leading-tight line-clamp-2">{h.name}</p>
                        <p className="text-[10px] text-[#666] mt-1">
                          {h.stars ? `${h.stars}★` : ''}{h.rating ? ` · ${h.rating}` : ''}
                        </p>
                        <p className="text-[11px] font-bold mt-1 tabular-nums">
                          {formatCurrency(convertCost({ amount: h.pricePerNight, currency: h.currency }, cur, rates), cur)}
                          <span className="text-[9px] text-[#555] font-normal"> /night</span>
                        </p>
                        {!h.isEstimate && <span className="inline-block mt-1 text-[8px] px-1 py-0.5 rounded bg-[#0d1a12] text-[#3eb87a]">Live price</span>}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Day cards */}
            {trip.days.map((day, i) => (
              <div key={day.id} data-testid="shared-day" className="rounded-xl bg-[#111111] border border-[#1f1f1f] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-[#1f1f1f] flex items-center justify-center text-[11px] font-bold text-[#888] shrink-0">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold truncate">
                        Day {i + 1}{deriveDayTitle(day) && <span className="text-[#888] font-medium"> · {deriveDayTitle(day)}</span>}
                      </p>
                      <p className="text-[11px] text-[#777]">
                        {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  {dayTotal(day.activities) > 0 && (
                    <span className="text-[11px] font-medium text-[#555] bg-[#161616] border border-[#2a2a2a] rounded-lg px-2 py-1 tabular-nums shrink-0">
                      {formatCurrency(dayTotal(day.activities), cur)}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-[#161616]">
                  {day.activities.map((a, ai) => (
                    <div key={a.id}>
                      {ai > 0 && (day.activities[ai - 1].travelTimeToNextMinutes ?? 0) > 0 && (
                        <p className="text-[10px] text-[#777] font-medium px-4 pt-2">↓ {formatDurationMins(day.activities[ai - 1].travelTimeToNextMinutes)} travel</p>
                      )}
                      <div className="flex gap-3.5 px-4 py-3">
                        <div className="flex flex-col items-end w-14 shrink-0 pt-0.5">
                          <span className="text-[11px] font-semibold text-[#aaa] tabular-nums">{formatTime(a.startTime)}</span>
                          <span className="text-[10px] text-[#777] tabular-nums">{formatTime(a.endTime)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#1a1a1a] text-[#888] capitalize">{getCategoryEmoji(a.category)} {a.category}</span>
                            {a.cost.amount > 0 && (
                              <span className="text-[11px] font-semibold text-[#888] tabular-nums shrink-0">
                                {formatCurrency(conv(a), cur)}{a.cost.isEstimate && <span className="text-[#444]"> ~</span>}
                              </span>
                            )}
                          </div>
                          <p className="text-[13px] font-semibold mt-1 leading-snug">{a.title}</p>
                          {a.description && <p className="text-[11px] text-[#777] mt-0.5 leading-relaxed">{a.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-[#777]">
                            <span className="flex items-center gap-1"><Clock size={9} />{formatDurationMins(a.durationMinutes)}</span>
                            {a.location?.name && <span className="flex items-center gap-1 truncate"><MapPin size={9} />{a.location.name}</span>}
                            {a.bookingUrl && (
                              <a href={a.bookingUrl} target="_blank" rel="noopener noreferrer" className="text-[#5a9fd4] hover:underline flex items-center gap-1">
                                Book <ExternalLink size={9} />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Budget summary */}
            {categories.length > 0 && (
              <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] p-4">
                <p className="text-[12px] font-semibold mb-3">Budget summary</p>
                <div className="space-y-1.5">
                  {categories.map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-[12px]">
                      <span className="text-[#888] capitalize">{getCategoryEmoji(cat)} {cat}</span>
                      <span className="tabular-nums text-[#aaa]">{formatCurrency(amt, cur)}</span>
                    </div>
                  ))}
                  {flight && (
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-[#888]">✈ Flights</span>
                      <span className="tabular-nums text-[#aaa]">{formatCurrency(flightCost, cur)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[13px] pt-2 border-t border-[#1f1f1f] font-semibold">
                    <span>Total</span>
                    <span className={cn('tabular-nums', over && 'text-[#ef4444]')}>{formatCurrency(grandTotal, cur)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer: disclosure + CTA ─────────────────────────────────────────── */}
        <div className="mt-10 pt-6 border-t border-[#1f1f1f] text-center space-y-3">
          {(hotels.length > 0 || flight || trip.days.some((d) => d.activities.some((a) => a.bookingUrl))) && (
            <p className="text-[10px] text-[#444] leading-relaxed">
              Prices are estimates or cached indications — verify via the booking links.
              Some links may earn Hodo a commission at no cost to you.
            </p>
          )}
          <p className="text-[12px] text-[#666]">
            Planned with <span className="font-bold tracking-wide text-[#888]">HODO</span>
            {' · '}
            <Link href="/" className="text-[#aaa] hover:text-white underline underline-offset-2 transition-colors">
              Plan your own trip
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 bg-[#111111] border border-[#1f1f1f] rounded-lg text-[11px] text-[#666] font-medium">
      {icon && <span className="text-[#444]">{icon}</span>}
      {label}
    </span>
  )
}
