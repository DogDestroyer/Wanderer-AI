'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DollarSign } from 'lucide-react'
import type { Day } from '@/lib/types'
import { cn, formatDayLabel, formatCurrency, getWeatherEmoji, isBadWeather } from '@/lib/utils'
import { calculateDayBudget, detectTimingConflicts } from '@/lib/recalculate'
import { SortableActivityCard } from './SortableActivityCard'

interface DayCardProps {
  day: Day
  index: number
  tripCurrency: string
  isDraggingAny: boolean
}

export function DayCard({ day, index, tripCurrency, isDraggingAny }: DayCardProps) {
  const { activities, weather, dayNotes } = day

  const dayTotal = calculateDayBudget(activities)
  const conflictIds = new Set(detectTimingConflicts(activities))
  const label = formatDayLabel(day.date, index)
  const activityIds = activities.map((a) => a.id)

  // Count weather-sensitive activities for the rain warning banner
  const outdoorCount = activities.filter((a) => a.weatherSensitive).length
  const showRainWarning = !!weather && isBadWeather(weather.condition) && outdoorCount > 0

  // Make the day card itself a drop target so items can be dragged into empty days
  const { setNodeRef, isOver } = useDroppable({ id: day.id })

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border shadow-sm overflow-hidden transition-colors duration-150',
        isOver && isDraggingAny
          ? 'border-indigo-300 shadow-md shadow-indigo-100'
          : 'border-gray-100'
      )}
    >
      {/* ── Day header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-white">{index + 1}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800 leading-tight">{label}</p>
            {activities.length > 0 && (
              <p className="text-[11px] text-gray-400 leading-tight">
                {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* ── Weather chip ─────────────────────────────────────────────────── */}
          {weather ? (
            <div
              className="flex items-center gap-1 text-xs text-gray-600"
              title={weather.description}
            >
              <span className="text-base leading-none">{getWeatherEmoji(weather.condition)}</span>
              <span className="font-medium">{weather.tempHighC}°</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-400">{weather.tempLowC}°</span>
              {weather.precipitationProbability >= 40 && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-0.5',
                    weather.precipitationProbability >= 70
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {weather.precipitationProbability}%
                </span>
              )}
            </div>
          ) : null}

          {dayTotal > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <DollarSign size={11} />
              {formatCurrency(dayTotal, tripCurrency).replace(/[^\d,.]/g, '')}
            </span>
          )}
        </div>
      </div>

      {/* ── Activities ───────────────────────────────────────────────────────── */}
      <div ref={setNodeRef}>
        {activities.length === 0 ? (
          <div
            className={cn(
              'px-4 py-8 text-center transition-colors',
              isOver && isDraggingAny ? 'bg-indigo-50' : ''
            )}
          >
            <p className="text-sm text-gray-400">
              {isOver && isDraggingAny
                ? 'Drop here to add to this day'
                : 'No activities planned for this day yet.'}
            </p>
          </div>
        ) : (
          <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-gray-50">
              {activities.map((activity, actIdx) => (
                <SortableActivityCard
                  key={activity.id}
                  activity={activity}
                  isFirst={actIdx === 0}
                  hasConflict={conflictIds.has(activity.id)}
                  prevTravelMins={actIdx > 0 ? activities[actIdx - 1].travelTimeToNextMinutes : 0}
                  isDraggingAny={isDraggingAny}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </div>

      {/* ── Rain warning banner ──────────────────────────────────────────────── */}
      {showRainWarning && (
        <div className="px-4 py-2.5 border-t border-amber-100 bg-amber-50/70 flex items-center justify-between gap-3">
          <p className="text-xs text-amber-700 leading-tight min-w-0">
            <span className="font-semibold">{weather!.description}</span> forecast ·{' '}
            {outdoorCount} weather-sensitive{' '}
            {outdoorCount === 1 ? 'activity' : 'activities'} may be affected
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
            className="shrink-0 text-[11px] font-semibold text-amber-600 hover:text-amber-700 transition-colors whitespace-nowrap"
          >
            Get alternatives →
          </button>
        </div>
      )}

      {/* ── Day notes ────────────────────────────────────────────────────────── */}
      {dayNotes && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-amber-50/40">
          <p className="text-xs text-amber-700 italic">{dayNotes}</p>
        </div>
      )}
    </div>
  )
}
