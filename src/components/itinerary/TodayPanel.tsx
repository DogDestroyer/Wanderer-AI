'use client'

// ─── TodayPanel (Day-of mode) ─────────────────────────────────────────────────
// The travel companion: mobile-first, works offline from persisted state, no
// AI, no GPS, no notifications (future options — see CLAUDE.md). Higher
// contrast than the rest of the app by design: this gets read on sunlit
// streets. Local currency LARGE (what you hand the cashier), budget small.

import { useEffect, useMemo, useState } from 'react'
import { MapPin, Check, Navigation, ChevronDown } from 'lucide-react'
import type { TripPlan, Activity, Reservation } from '@/lib/types'
import { useStore } from '@/lib/store'
import { cn, formatCurrency, formatTime, getWeatherEmoji, getCategoryEmoji } from '@/lib/utils'
import { convertCost, type RatesMap } from '@/lib/currency'
import { nowMs, localDateISO, todayIndex, minutesOfDay, pickHero, formatStartsIn, mapsLink } from '@/lib/dayOf'

export function TodayPanel({ trip, rates }: { trip: TripPlan; rates: RatesMap }) {
  const toggleDayOfDone = useStore((s) => s.toggleDayOfDone)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Re-evaluate the clock every 30s so "starts in Xm" stays honest.
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const now = nowMs()
  const tIdx = todayIndex(trip, now)
  const preview = tIdx === -1
  const dayIdx = preview ? (localDateISO(now) < trip.startDate ? 0 : trip.days.length - 1) : tIdx
  const day = trip.days[dayIdx]
  const done = trip.dayOfDone ?? []
  const nowMin = minutesOfDay(now)
  const cur = trip.budget.currency

  const hero = useMemo(
    () => (preview ? pickHero(day, done, 0) : pickHero(day, done, nowMin)),
    [preview, day, done, nowMin],
  )

  // Remaining budget today = day total minus done items' costs.
  const dayTotal = day.activities.reduce((s, a) => s + convertCost(a.cost, cur, rates), 0)
  const doneSpend = day.activities.filter((a) => done.includes(a.id)).reduce((s, a) => s + convertCost(a.cost, cur, rates), 0)
  const remaining = Math.max(0, dayTotal - doneSpend)

  // Today's reservations: linked ones badge their cards; unlinked ones list below.
  const reservations = (trip.reservations ?? []).filter((r) => r.status !== 'cancelled')
  const resByActivity = new Map(reservations.filter((r) => r.activityId).map((r) => [r.activityId!, r]))
  const unlinkedToday = reservations.filter((r) => !r.activityId && r.date === day.date && r.confirmationNumber)

  const tomorrow = trip.days[dayIdx + 1]
  const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <div className="flex-1 overflow-y-auto animate-in" data-testid="today-panel">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-12 space-y-4">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            {preview && (
              <p className="text-[10px] font-medium text-[#f59e0b] mb-1" data-testid="today-preview-note">
                Preview — your trip {localDateISO(now) < trip.startDate ? "hasn't started yet" : 'has ended'}
              </p>
            )}
            <h2 className="text-[17px] font-bold text-white leading-tight" data-testid="today-header">
              Day {dayIdx + 1} of {trip.days.length} · {dateStr}
            </h2>
            <p className="text-[13px] text-[#aaa] mt-0.5 flex items-center gap-1">
              <MapPin size={11} className="text-[#888]" /> {trip.destination.name.split(',')[0]}
            </p>
          </div>
          {day.weather && (
            <div className="flex items-center gap-1.5 text-[14px] shrink-0 bg-[#111111] border border-[#2a2a2a] rounded-xl px-3 py-2">
              <span>{getWeatherEmoji(day.weather.condition)}</span>
              <span className="font-semibold text-white">{day.weather.tempHighC}°</span>
              <span className="text-[#888]">/{day.weather.tempLowC}°</span>
            </div>
          )}
        </div>

        {/* ── Hero: current / next activity ──────────────────────────────────── */}
        {hero ? (
          <HeroCard
            hero={hero}
            preview={preview}
            reservation={resByActivity.get(hero.activity.id)}
            budgetCurrency={cur}
            rates={rates}
            onDone={() => toggleDayOfDone(trip.id, hero.activity.id, hero.activity.title)}
          />
        ) : (
          <div className="rounded-2xl bg-[#111111] border border-[#2a2a2a] p-6 text-center" data-testid="day-complete">
            <p className="text-[15px] font-semibold text-white">That&apos;s the day done ✓</p>
            <p className="text-[12px] text-[#999] mt-1">Everything on today&apos;s plan is finished.</p>
          </div>
        )}

        {/* ── Quick glances ──────────────────────────────────────────────────── */}
        <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] px-4 py-3 flex items-center justify-between">
          <span className="text-[12px] text-[#999]">Remaining today</span>
          <span className="text-[15px] font-bold text-white tabular-nums" data-testid="today-remaining">
            {formatCurrency(remaining, cur)}
          </span>
        </div>

        {/* ── The rest of today ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          {day.activities.map((a) => {
            const isDone = done.includes(a.id)
            const isHero = hero?.activity.id === a.id
            const res = resByActivity.get(a.id)
            const isOpen = expanded === a.id
            return (
              <div
                key={a.id}
                data-testid="today-row"
                data-done={isDone ? 'true' : 'false'}
                className={cn('rounded-xl border transition-colors', isDone ? 'bg-[#0d0d0d] border-[#161616]' : 'bg-[#111111] border-[#1f1f1f]', isHero && !isDone && 'border-[#333]')}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : a.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[52px]"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDayOfDone(trip.id, a.id, a.title) }}
                    aria-label={isDone ? `Unmark ${a.title}` : `Mark ${a.title} as done`}
                    className={cn('w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors',
                      isDone ? 'bg-white border-white text-black' : 'border-[#3a3a3a] text-transparent hover:border-[#666]')}
                  >
                    <Check size={14} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[14px] font-semibold leading-tight', isDone ? 'text-[#666] line-through' : 'text-white')}>
                      {getCategoryEmoji(a.category)} {a.title}
                    </p>
                    <p className="text-[12px] text-[#999] mt-0.5 tabular-nums">
                      {formatTime(a.startTime)} – {formatTime(a.endTime)}
                      {res?.confirmationNumber && (
                        <span className="ml-2 text-[#3eb87a] font-medium" data-testid="today-confirmation">#{res.confirmationNumber}</span>
                      )}
                    </p>
                  </div>
                  <ChevronDown size={14} className={cn('text-[#666] shrink-0 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-3.5 -mt-1 space-y-2">
                    {a.description && <p className="text-[12px] text-[#aaa] leading-relaxed">{a.description}</p>}
                    <div className="flex items-center gap-2">
                      <a
                        href={mapsLink(a)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[12px] font-medium text-white hover:border-[#444] transition-colors min-h-[40px]"
                      >
                        <Navigation size={12} /> {a.location.name || 'Map'}
                      </a>
                      {a.cost.amount > 0 && (
                        <span className="text-[13px] font-bold text-white tabular-nums ml-auto">
                          {formatCurrency(a.cost.amount, a.cost.currency)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Today's unlinked reservations (booking codes at your fingertips) */}
        {unlinkedToday.length > 0 && (
          <div className="rounded-xl bg-[#111111] border border-[#1f1f1f] px-4 py-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#666]">Today&apos;s bookings</p>
            {unlinkedToday.map((r) => (
              <p key={r.id} className="text-[12px] text-[#ccc]">
                {r.name} <span className="text-[#3eb87a] font-medium">#{r.confirmationNumber}</span>
              </p>
            ))}
          </div>
        )}

        {/* ── Tomorrow peek ───────────────────────────────────────────────────── */}
        {tomorrow && tomorrow.activities.length > 0 && (
          <p className="text-[12px] text-[#888] text-center pt-2" data-testid="tomorrow-peek">
            Tomorrow starts with <span className="text-[#ccc] font-medium">{tomorrow.activities[0].title}</span> at {formatTime(tomorrow.activities[0].startTime)}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── HeroCard ─────────────────────────────────────────────────────────────────

function HeroCard({ hero, preview, reservation, budgetCurrency, rates, onDone }: {
  hero: NonNullable<ReturnType<typeof pickHero>>
  preview: boolean
  reservation?: Reservation
  budgetCurrency: string
  rates: RatesMap
  onDone: () => void
}) {
  const a: Activity = hero.activity
  const local = a.cost.amount > 0 ? formatCurrency(a.cost.amount, a.cost.currency) : null
  const converted = a.cost.amount > 0 && a.cost.currency.toUpperCase() !== budgetCurrency.toUpperCase()
    ? formatCurrency(convertCost(a.cost, budgetCurrency, rates), budgetCurrency)
    : null

  return (
    <div className="rounded-2xl bg-[#141414] border border-[#333] p-5" data-testid="today-hero">
      <div className="flex items-center justify-between gap-2">
        <span
          data-testid="hero-timing"
          className={cn('text-[11px] font-bold uppercase tracking-widest',
            hero.status === 'now' ? 'text-[#3eb87a]' : 'text-[#f0b429]')}
        >
          {preview ? 'first up' : hero.status === 'now' ? '● now' : formatStartsIn(hero.startsInMin)}
        </span>
        <span className="text-[12px] text-[#999] tabular-nums">{formatTime(a.startTime)} – {formatTime(a.endTime)}</span>
      </div>

      <h3 className="text-[20px] font-bold text-white leading-snug mt-2">{a.title}</h3>
      <p className="text-[13px] text-[#aaa] mt-1 flex items-center gap-1">
        <MapPin size={12} /> {a.location.name}
        {reservation?.confirmationNumber && (
          <span className="ml-1 text-[#3eb87a] font-semibold" data-testid="hero-confirmation">#{reservation.confirmationNumber}</span>
        )}
      </p>

      {local && (
        <p className="mt-3">
          <span className="text-[26px] font-bold text-white tabular-nums" data-testid="hero-local-price">{local}</span>
          {converted && <span className="text-[12px] text-[#888] ml-2 tabular-nums">≈ {converted}</span>}
        </p>
      )}

      <div className="flex items-center gap-2.5 mt-4">
        <a
          href={mapsLink(a)}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="hero-maps"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white text-black text-[13px] font-bold hover:bg-[#e8e8e8] transition-colors min-h-[48px]"
        >
          <Navigation size={14} /> Open in Google Maps
        </a>
        <button
          onClick={onDone}
          data-testid="hero-done"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[#3a3a3a] text-white text-[13px] font-semibold hover:border-[#666] transition-colors min-h-[48px]"
        >
          <Check size={14} /> Done
        </button>
      </div>
    </div>
  )
}
