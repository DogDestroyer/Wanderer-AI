'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DollarSign } from 'lucide-react'
import type { Day } from '@/lib/types'
import { cn, formatDayLabel, formatCurrency, getWeatherEmoji } from '@/lib/utils'
import { calculateDayBudget, detectTimingConflicts } from '@/lib/recalculate'
import { SortableActivityCard } from './SortableActivityCard'

interface DayCardProps {
  day: Day
  index: number
  tripCurrency: string
  isDraggingAny: boolean // passed from ItineraryView
}

export function DayCard({ day, index, tripCurrency, isDraggingAny }: DayCardProps) {
  const { activities, weather, dayNotes } = day

  const dayTotal = calculateDayBudget(activities)
  const conflictIds = new Set(detectTimingConflicts(activities))
  const label = formatDayLabel(day.date, index)
  const activityIds = activities.map((a) => a.id)

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
      {/* Day header */}
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
          {weather && (
            <span className="text-base" title={weather.description}>
              {getWeatherEmoji(weather.condition)}
            </span>
          )}
          {dayTotal > 0 && (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg px-2 py-1">
              <DollarSign size={11} />
              {formatCurrency(dayTotal, tripCurrency).replace(/[^\d,.]/g, '')}
            </span>
          )}
        </div>
      </div>

      {/* Activities */}
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

      {/* Day notes */}
      {dayNotes && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-amber-50/40">
          <p className="text-xs text-amber-700 italic">{dayNotes}</p>
        </div>
      )}
    </div>
  )
}
