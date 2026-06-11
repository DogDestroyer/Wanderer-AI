'use client'

import { MapPin, Clock, Lock, CloudRain, ChevronRight } from 'lucide-react'
import type { Activity } from '@/lib/types'
import {
  cn,
  formatTime,
  formatDurationMins,
  formatCurrency,
  getCategoryColor,
  getCategoryEmoji,
} from '@/lib/utils'

// ─── Travel-time connector ─────────────────────────────────────────────────────

export function TravelConnector({ minutes }: { minutes: number }) {
  if (!minutes || minutes <= 0) return null
  return (
    <div className="flex items-center gap-2 py-1 pl-[72px]">
      <div className="w-px h-4 bg-gray-200 ml-[7px]" />
      <span className="text-[11px] text-gray-400 font-medium tracking-wide">
        {formatDurationMins(minutes)} travel
      </span>
    </div>
  )
}

// ─── ActivityCard ──────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: Activity
  isFirst: boolean
  hasConflict?: boolean
}

export function ActivityCard({ activity, isFirst, hasConflict }: ActivityCardProps) {
  const {
    title,
    description,
    category,
    startTime,
    endTime,
    durationMinutes,
    location,
    cost,
    locked,
    weatherSensitive,
  } = activity

  const categoryBadge = getCategoryColor(category)
  const categoryEmoji = getCategoryEmoji(category)

  return (
    <div
      className={cn(
        'relative flex gap-4 px-4 py-3.5 group transition-colors',
        'hover:bg-gray-50/60',
        hasConflict && 'bg-red-50/40 hover:bg-red-50/60',
        isFirst ? 'rounded-t-none' : ''
      )}
    >
      {/* Vertical timeline line */}
      <div className="absolute left-[calc(1rem+15px)] top-0 bottom-0 w-px bg-gray-100 group-last:hidden" />

      {/* Time column */}
      <div className="flex flex-col items-end shrink-0 w-16 pt-0.5">
        <span className="text-[11px] font-semibold text-gray-700 leading-tight">
          {formatTime(startTime)}
        </span>
        <span className="text-[10px] text-gray-400 leading-tight">
          {formatTime(endTime)}
        </span>
      </div>

      {/* Timeline dot */}
      <div className="relative flex-shrink-0 mt-1">
        <div
          className={cn(
            'w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] z-10',
            hasConflict
              ? 'border-red-400 bg-red-50'
              : 'border-indigo-300 bg-white'
          )}
        >
          <span>{categoryEmoji}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium capitalize shrink-0',
                categoryBadge
              )}
            >
              {category}
            </span>
            {locked && (
              <Lock size={10} className="text-gray-400 shrink-0" />
            )}
            {weatherSensitive && (
              <CloudRain size={10} className="text-sky-400 shrink-0" />
            )}
          </div>
          {/* Cost */}
          {cost.amount > 0 && (
            <span className="text-xs font-semibold text-gray-700 shrink-0">
              {formatCurrency(cost.amount, cost.currency)}
              {cost.isEstimate && (
                <span className="text-gray-400 font-normal">~</span>
              )}
            </span>
          )}
        </div>

        {/* Activity title */}
        <p className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">
          {title}
        </p>

        {/* Description */}
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed line-clamp-2">
            {description}
          </p>
        )}

        {/* Footer chips */}
        <div className="flex items-center gap-3 mt-1.5">
          {/* Duration */}
          <span className="flex items-center gap-1 text-[11px] text-gray-400">
            <Clock size={10} />
            {formatDurationMins(durationMinutes)}
          </span>
          {/* Location */}
          {location?.name && (
            <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate">
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{location.name}</span>
            </span>
          )}
          {/* Cost note */}
          {cost.note && (
            <span className="text-[11px] text-gray-400 italic truncate">
              {cost.note}
            </span>
          )}
        </div>

        {/* Conflict warning */}
        {hasConflict && (
          <p className="text-[11px] text-red-500 mt-1 font-medium">
            ⚠ Timing conflict with previous activity
          </p>
        )}
      </div>
    </div>
  )
}
