'use client'

import { DollarSign, TrendingUp, Calendar, Sparkles } from 'lucide-react'
import type { TripPlan, ActivityCategory } from '@/lib/types'
import {
  cn,
  formatCurrency,
  formatDayLabel,
  getCategoryEmoji,
} from '@/lib/utils'
import { calculateDayBudget, calculateTripBudget } from '@/lib/recalculate'

// ─── Category colours (matches ActivityCard badges) ───────────────────────────

const CATEGORY_BAR: Record<ActivityCategory, string> = {
  attraction:    'bg-violet-500',
  food:          'bg-amber-500',
  transport:     'bg-sky-500',
  accommodation: 'bg-emerald-500',
  experience:    'bg-rose-500',
  leisure:       'bg-teal-500',
}

const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  attraction:    'Attractions',
  food:          'Food & Drink',
  transport:     'Transport',
  accommodation: 'Accommodation',
  experience:    'Experiences',
  leisure:       'Leisure',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryBreakdown(trip: TripPlan): Array<{
  category: ActivityCategory
  amount: number
  count: number
}> {
  const totals: Partial<Record<ActivityCategory, { amount: number; count: number }>> = {}

  for (const day of trip.days) {
    for (const act of day.activities) {
      const cat = act.category
      if (!totals[cat]) totals[cat] = { amount: 0, count: 0 }
      totals[cat]!.amount += act.cost.amount
      totals[cat]!.count += 1
    }
  }

  return (Object.entries(totals) as [ActivityCategory, { amount: number; count: number }][])
    .map(([category, { amount, count }]) => ({ category, amount, count }))
    .sort((a, b) => b.amount - a.amount)
}

function countFreeActivities(trip: TripPlan): number {
  return trip.days.flatMap((d) => d.activities).filter((a) => a.cost.amount === 0).length
}

// ─── BudgetPanel ──────────────────────────────────────────────────────────────

export function BudgetPanel({ trip }: { trip: TripPlan }) {
  const { days, budget } = trip
  const currency = budget.currency

  const totalSpend = calculateTripBudget(days)
  const cap = budget.cap
  const capSet = cap > 0
  const overBudget = capSet && totalSpend > cap
  const remaining = capSet ? cap - totalSpend : null
  const spentPct = capSet ? Math.min((totalSpend / cap) * 100, 100) : 0

  const totalActivities = days.flatMap((d) => d.activities).length
  const freeCount = countFreeActivities(trip)
  const dailyAvg = days.length > 0 ? totalSpend / days.length : 0

  const categoryBreakdown = getCategoryBreakdown(trip)
  const maxCatAmount = Math.max(...categoryBreakdown.map((c) => c.amount), 1)

  const dayTotals = days.map((day, idx) => ({
    id: day.id,
    label: formatDayLabel(day.date, idx),
    total: calculateDayBudget(day.activities),
    count: day.activities.length,
  }))
  const maxDayAmount = Math.max(...dayTotals.map((d) => d.total), 1)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-10 space-y-5">

        {/* ── Summary stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<DollarSign size={15} className="text-indigo-500" />}
            label="Total spend"
            value={formatCurrency(totalSpend, currency)}
            sub={capSet ? `of ${formatCurrency(cap, currency)}` : undefined}
            highlight={overBudget ? 'red' : undefined}
          />
          <StatCard
            icon={<TrendingUp size={15} className="text-emerald-500" />}
            label={capSet ? 'Remaining' : 'Daily avg'}
            value={
              capSet
                ? formatCurrency(Math.abs(remaining ?? 0), currency)
                : formatCurrency(dailyAvg, currency)
            }
            sub={capSet && overBudget ? 'over budget' : capSet ? 'left to spend' : 'per day'}
            highlight={capSet && overBudget ? 'red' : capSet ? 'green' : undefined}
          />
          <StatCard
            icon={<Calendar size={15} className="text-sky-500" />}
            label="Daily avg"
            value={formatCurrency(dailyAvg, currency)}
            sub={`${days.length} ${days.length === 1 ? 'day' : 'days'}`}
          />
          <StatCard
            icon={<Sparkles size={15} className="text-amber-500" />}
            label="Free activities"
            value={`${freeCount}`}
            sub={`of ${totalActivities} total`}
          />
        </div>

        {/* ── Overall progress bar ────────────────────────────────────────────── */}
        {capSet && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-800">Budget overview</p>
              <span
                className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full',
                  overBudget
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-600'
                )}
              >
                {overBudget ? `${Math.round(spentPct)}% — over limit` : `${Math.round(spentPct)}% used`}
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-700',
                  overBudget ? 'bg-red-500' : 'bg-indigo-500'
                )}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-gray-500">
                {formatCurrency(totalSpend, currency)} spent
              </span>
              <span className="text-[11px] text-gray-400">
                {formatCurrency(cap, currency)} cap
              </span>
            </div>
          </div>
        )}

        {/* ── Category breakdown ──────────────────────────────────────────────── */}
        {categoryBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-4">Spend by category</p>
            <div className="space-y-3">
              {categoryBreakdown.map(({ category, amount, count }) => {
                const pct = (amount / maxCatAmount) * 100
                const ofTotal = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{getCategoryEmoji(category)}</span>
                        <span className="text-xs font-medium text-gray-700">
                          {CATEGORY_LABEL[category]}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          {count} {count === 1 ? 'item' : 'items'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">{ofTotal}%</span>
                        <span className="text-xs font-semibold text-gray-700 w-16 text-right">
                          {formatCurrency(amount, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', CATEGORY_BAR[category])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Per-day breakdown ──────────────────────────────────────────────── */}
        {dayTotals.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-semibold text-gray-800 mb-4">Spend by day</p>
            <div className="space-y-3">
              {dayTotals.map(({ id, label, total, count }) => {
                const pct = (total / maxDayAmount) * 100
                const isExpensive = total === maxDayAmount && total > 0
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[160px]">
                          {label}
                        </span>
                        {isExpensive && (
                          <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            MOST EXPENSIVE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">
                          {count} {count === 1 ? 'activity' : 'activities'}
                        </span>
                        <span className="text-xs font-semibold text-gray-700 w-16 text-right">
                          {total > 0 ? formatCurrency(total, currency) : 'Free'}
                        </span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                        style={{ width: total > 0 ? `${pct}%` : '0%' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────────── */}
        {totalActivities === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-sm">No activities yet — nothing to budget.</p>
            <p className="text-gray-300 text-xs mt-1">Ask the AI to plan your trip first.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  highlight?: 'red' | 'green'
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <div className="flex items-center gap-1.5 mb-2">{icon}
        <span className="text-[11px] text-gray-500 font-medium">{label}</span>
      </div>
      <p
        className={cn(
          'text-lg font-bold leading-tight',
          highlight === 'red' ? 'text-red-600' :
          highlight === 'green' ? 'text-emerald-600' :
          'text-gray-900'
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
