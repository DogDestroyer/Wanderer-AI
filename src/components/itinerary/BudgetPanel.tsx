'use client'

import { DollarSign, TrendingUp, Calendar, Sparkles } from 'lucide-react'
import type { TripPlan, ActivityCategory } from '@/lib/types'
import {
  cn,
  formatCurrency,
  formatDayLabel,
  getCategoryEmoji,
} from '@/lib/utils'
import { calculateDayBudgetConverted, calculateTripBudgetConverted } from '@/lib/recalculate'
import { convertCost, FALLBACK_RATES, type RatesMap } from '@/lib/currency'

// ─── Category bar colours (muted for dark theme) ──────────────────────────────

const CATEGORY_BAR: Record<ActivityCategory, string> = {
  attraction:    'bg-[#9d7ff0]',
  food:          'bg-[#d4a017]',
  transport:     'bg-[#5a9fd4]',
  accommodation: 'bg-[#3eb87a]',
  experience:    'bg-[#e07a8f]',
  leisure:       'bg-[#3dbfbf]',
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

function getCategoryBreakdown(
  trip: TripPlan,
  toCurrency: string,
  rates: RatesMap,
): Array<{ category: ActivityCategory; amount: number; count: number }> {
  const totals: Partial<Record<ActivityCategory, { amount: number; count: number }>> = {}
  for (const day of trip.days) {
    for (const act of day.activities) {
      const cat = act.category
      if (!totals[cat]) totals[cat] = { amount: 0, count: 0 }
      totals[cat]!.amount += convertCost(act.cost, toCurrency, rates)
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

export function BudgetPanel({ trip, rates = FALLBACK_RATES }: { trip: TripPlan; rates?: RatesMap }) {
  const { days, budget } = trip
  const currency = budget.currency

  const totalSpend = calculateTripBudgetConverted(days, currency, rates)
  const cap = budget.cap
  const capSet = cap > 0
  const overBudget = capSet && totalSpend > cap
  const remaining = capSet ? cap - totalSpend : null
  const spentPct = capSet ? Math.min((totalSpend / cap) * 100, 100) : 0

  const totalActivities = days.flatMap((d) => d.activities).length
  const freeCount = countFreeActivities(trip)
  const dailyAvg = days.length > 0 ? totalSpend / days.length : 0

  const categoryBreakdown = getCategoryBreakdown(trip, currency, rates)
  const maxCatAmount = Math.max(...categoryBreakdown.map((c) => c.amount), 1)

  const dayTotals = days.map((day, idx) => ({
    id: day.id,
    label: formatDayLabel(day.date, idx),
    total: calculateDayBudgetConverted(day.activities, currency, rates),
    count: day.activities.length,
  }))
  const maxDayAmount = Math.max(...dayTotals.map((d) => d.total), 1)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 md:p-6 max-w-2xl mx-auto w-full pb-10 space-y-4">

        {/* ── Summary stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatCard
            icon={<DollarSign size={14} className="text-[#888]" />}
            label="Total spend"
            value={formatCurrency(totalSpend, currency)}
            sub={capSet ? `of ${formatCurrency(cap, currency)}` : undefined}
            highlight={overBudget ? 'red' : undefined}
          />
          <StatCard
            icon={<TrendingUp size={14} className="text-[#888]" />}
            label={capSet ? 'Remaining' : 'Daily avg'}
            value={capSet ? formatCurrency(Math.abs(remaining ?? 0), currency) : formatCurrency(dailyAvg, currency)}
            sub={capSet && overBudget ? 'over budget' : capSet ? 'left to spend' : 'per day'}
            highlight={capSet && overBudget ? 'red' : capSet ? 'green' : undefined}
          />
          <StatCard
            icon={<Calendar size={14} className="text-[#888]" />}
            label="Daily avg"
            value={formatCurrency(dailyAvg, currency)}
            sub={`${days.length} ${days.length === 1 ? 'day' : 'days'}`}
          />
          <StatCard
            icon={<Sparkles size={14} className="text-[#888]" />}
            label="Free activities"
            value={`${freeCount}`}
            sub={`of ${totalActivities} total`}
          />
        </div>

        {/* ── Overall progress bar ─────────────────────────────────────────── */}
        {capSet && (
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-[#f0f0f0]">Budget overview</p>
              <span
                className={cn(
                  'text-[11px] font-semibold px-2 py-0.5 rounded-full',
                  overBudget ? 'bg-[#1a0d0d] text-[#ef4444]' : 'bg-[#0d1a0d] text-[#22c55e]'
                )}
              >
                {overBudget ? `${Math.round(spentPct)}% — over limit` : `${Math.round(spentPct)}% used`}
              </span>
            </div>
            <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-700', overBudget ? 'bg-[#ef4444]' : 'bg-white')}
                style={{ width: `${spentPct}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <span className="text-[11px] text-[#555]">{formatCurrency(totalSpend, currency)} spent</span>
              <span className="text-[11px] text-[#444]">{formatCurrency(cap, currency)} cap</span>
            </div>
          </div>
        )}

        {/* ── Category breakdown ─────────────────────────────────────────────── */}
        {categoryBreakdown.length > 0 && (
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4">
            <p className="text-[13px] font-semibold text-[#f0f0f0] mb-4">Spend by category</p>
            <div className="space-y-3">
              {categoryBreakdown.map(({ category, amount, count }) => {
                const pct = (amount / maxCatAmount) * 100
                const ofTotal = totalSpend > 0 ? Math.round((amount / totalSpend) * 100) : 0
                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm leading-none">{getCategoryEmoji(category)}</span>
                        <span className="text-[12px] font-medium text-[#888]">{CATEGORY_LABEL[category]}</span>
                        <span className="text-[10px] text-[#444]">{count} {count === 1 ? 'item' : 'items'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#444]">{ofTotal}%</span>
                        <span className="text-[11px] font-semibold text-[#888] w-16 text-right tabular-nums">
                          {formatCurrency(amount, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500 opacity-70', CATEGORY_BAR[category])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Per-day breakdown ─────────────────────────────────────────────── */}
        {dayTotals.length > 0 && (
          <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-4">
            <p className="text-[13px] font-semibold text-[#f0f0f0] mb-4">Spend by day</p>
            <div className="space-y-3">
              {dayTotals.map(({ id, label, total, count }) => {
                const pct = (total / maxDayAmount) * 100
                const isExpensive = total === maxDayAmount && total > 0
                return (
                  <div key={id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-medium text-[#888] truncate max-w-[160px]">{label}</span>
                        {isExpensive && (
                          <span className="text-[9px] font-bold text-[#555] bg-[#1a1a1a] border border-[#2a2a2a] px-1.5 py-0.5 rounded-full tracking-wide">
                            HIGHEST
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#444]">{count} {count === 1 ? 'activity' : 'activities'}</span>
                        <span className="text-[11px] font-semibold text-[#888] w-16 text-right tabular-nums">
                          {total > 0 ? formatCurrency(total, currency) : 'Free'}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-white/20 transition-all duration-500"
                        style={{ width: total > 0 ? `${pct}%` : '0%' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Empty state ────────────────────────────────────────────────────── */}
        {totalActivities === 0 && (
          <div className="text-center py-16">
            <p className="text-[#444] text-sm">No activities yet — nothing to budget.</p>
            <p className="text-[#333] text-xs mt-1">Ask the AI to plan your trip first.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, highlight }: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  highlight?: 'red' | 'green'
}) {
  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[10px] text-[#555] font-medium">{label}</span>
      </div>
      <p className={cn(
        'text-base font-bold leading-tight tabular-nums',
        highlight === 'red' ? 'text-[#ef4444]' :
        highlight === 'green' ? 'text-[#22c55e]' :
        'text-[#f0f0f0]'
      )}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-[#444] mt-0.5">{sub}</p>}
    </div>
  )
}
