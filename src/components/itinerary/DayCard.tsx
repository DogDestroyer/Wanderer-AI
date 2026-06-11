'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DollarSign } from 'lucide-react'
import type { Day } from '@/lib/types'
import { cn, formatDayLabel, formatCurrency, getWeatherEmoji, isBadWeather } from '@/lib/utils'
import { calculateDayBudgetConverted, detectTimingConflicts } from '@/lib/recalculate'
import { type RatesMap, FALLBACK_RATES } from '@/lib/currency'
import { SortableActivityCard } from './SortableActivityCard'

interface DayCardProps {
  day: Day
  index: number
  tripCurrency: string
  isDraggingAny: boolean
  rates?: RatesMap
}

export function DayCard({ day, index, tripCurrency, isDraggingAny, rates = FALLBACK_RATES }: DayCardProps) {
  const { activities, weather, dayNotes } = day

  const dayTotal = calculateDayBudgetConverted(activities, tripCurrency, rates)
  const conflictIds = new Set(detectTimingConflicts(activities))
  const label = formatDayLabel(day.date, index)
  const activityIds = activities.map((a) => a.id)

  const outdoorCount = activities.filter((a) => a.weatherSensitive).length
  const showRainWarning = !!weather && isBadWeather(weather.condition) && outdoorCount > 0

  const { setNodeRef, isOver } = useDroppable({ id: day.id })

  return (
    <div
      className={cn(
        'bg-[#111111] rounded-xl border overflow-hidden transition-colors duration-150',
        isOver && isDraggingAny
          ? 'border-[#444]'
          : 'border-[#1f1f1f]'
      )}
    >
      {/* ── Day header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3">
          {/* Day number pill */}
          <div className="w-7 h-7 rounded-lg bg-[#1f1f1f] flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-[#888]">{index + 1}</span>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#f0f0f0] leading-tight">{label}</p>
            {activities.length > 0 && (
              <p className="text-[11px] text-[#444] leading-tight">
                {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Weather chip */}
          {weather ? (
            <div
              className="flex items-center gap-1 text-[12px] text-[#888]"
              title={weather.description}
            >
              <span className="text-sm leading-none">{getWeatherEmoji(weather.condition)}</span>
              <span className="font-medium text-[#aaa]">{weather.tempHighC}°</span>
              <span className="text-[#333]">/</span>
              <span className="text-[#555]">{weather.tempLowC}°</span>
              {weather.precipitationProbability >= 40 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#1a1a1a] text-[#666] ml-0.5">
                  {weather.precipitationProbability}%
                </span>
              )}
            </div>
          ) : null}

          {/* Day spend */}
          {dayTotal > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] font-medium text-[#555] bg-[#161616] border border-[#2a2a2a] rounded-lg px-2 py-1">
              <DollarSign size={10} />
              {formatCurrency(dayTotal, tripCurrency).replace(/[^\d,.]/g, '')}
            </span>
          )}
        </div>
      </div>

      {/* ── Activities ─────────────────────────────────────────────────────── */}
      <div ref={setNodeRef}>
        {activities.length === 0 ? (
          <div
            className={cn(
              'px-4 py-8 text-center transition-colors',
              isOver && isDraggingAny ? 'bg-[#161616]' : ''
            )}
          >
            <p className="text-[12px] text-[#333]">
              {isOver && isDraggingAny
                ? 'Drop here to add to this day'
                : 'No activities planned for this day yet.'}
            </p>
          </div>
        ) : (
          <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-[#161616]">
              {activities.map((activity, actIdx) => (
                <SortableActivityCard
                  key={activity.id}
                  activity={activity}
                  isFirst={actIdx === 0}
                  hasConflict={conflictIds.has(activity.id)}
                  prevTravelMins={actIdx > 0 ? activities[actIdx - 1].travelTimeToNextMinutes : 0}
                  isDraggingAny={isDraggingAny}
                  budgetCurrency={tripCurrency}
                  rates={rates}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {/* ── Rain warning ────────────────────────────────────────────────────── */}
      {showRainWarning && (
        <div className="px-4 py-2.5 border-t border-[#1f1f1f] bg-[#0f0e0a] flex items-center justify-between gap-3">
          <p className="text-[11px] text-[#888] leading-tight min-w-0">
            <span className="font-medium text-[#aaa]">{weather!.description}</span> forecast ·{' '}
            {outdoorCount} weather-sensitive{' '}
            {outdoorCount === 1 ? 'activity' : 'activities'}
          </p>
          <button
            onClick={() => {
              const msg =
                `${label} has ${weather!.description.toLowerCase()} in the forecast ` +
                `and I have ${outdoorCount} weather-sensitive ` +
                `${outdoorCount === 1 ? 'activity' : 'activities'}. ` +
                `Can you suggest indoor alternatives?`
              document.dispatchEvent(
                new CustomEvent('wandr:chat-prompt', { detail: { message: msg } })
              )
            }}
            className="shrink-0 text-[11px] font-medium text-[#888] hover:text-[#f0f0f0] transition-colors whitespace-nowrap"
          >
            Get alternatives →
          </button>
        </div>
      )}

      {/* ── Day notes ──────────────────────────────────────────────────────── */}
      {dayNotes && (
        <div className="px-4 py-2.5 border-t border-[#1f1f1f]">
          <p className="text-[11px] text-[#666] italic">{dayNotes}</p>
        </div>
      )}
    </div>
  )
}
