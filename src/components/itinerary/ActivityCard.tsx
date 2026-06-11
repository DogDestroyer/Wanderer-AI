'use client'

import { MapPin, Clock, Lock, CloudRain } from 'lucide-react'
import type { Activity } from '@/lib/types'
import {
  cn,
  formatTime,
  formatDurationMins,
  formatCurrency,
  getCategoryEmoji,
} from '@/lib/utils'

// ─── Category badge colours (dark-theme) ──────────────────────────────────────

function getCategoryDark(category: string): string {
  const map: Record<string, string> = {
    attraction:    'bg-[#1a1530] text-[#9d7ff0]',
    food:          'bg-[#1a1608] text-[#d4a017]',
    transport:     'bg-[#0d1624] text-[#5a9fd4]',
    accommodation: 'bg-[#0d1a14] text-[#3eb87a]',
    experience:    'bg-[#1a0e14] text-[#e07a8f]',
    leisure:       'bg-[#0d1a1a] text-[#3dbfbf]',
  }
  return map[category] ?? 'bg-[#1a1a1a] text-[#888]'
}

// ─── Travel-time connector ────────────────────────────────────────────────────

export function TravelConnector({ minutes }: { minutes: number }) {
  if (!minutes || minutes <= 0) return null
  return (
    <div className="flex items-center gap-2 py-1 pl-[72px]">
      <div className="w-px h-4 bg-[#2a2a2a] ml-[7px]" />
      <span className="text-[10px] text-[#444] font-medium tracking-wide">
        {formatDurationMins(minutes)} travel
      </span>
    </div>
  )
}

// ─── ActivityCard ─────────────────────────────────────────────────────────────

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

  const categoryBadge = getCategoryDark(category)
  const categoryEmoji = getCategoryEmoji(category)

  return (
    <div
      className={cn(
        'relative flex gap-4 px-4 py-3.5 group transition-colors',
        'hover:bg-[#161616]',
        hasConflict && 'bg-[#1a0d0d] hover:bg-[#1e1010]',
        isFirst ? 'rounded-t-none' : ''
      )}
    >
      {/* Vertical timeline line */}
      <div className="absolute left-[calc(1rem+15px)] top-0 bottom-0 w-px bg-[#1f1f1f] group-last:hidden" />

      {/* Time column */}
      <div className="flex flex-col items-end shrink-0 w-16 pt-0.5">
        <span className="text-[11px] font-semibold text-[#aaa] leading-tight tabular-nums">
          {formatTime(startTime)}
        </span>
        <span className="text-[10px] text-[#444] leading-tight tabular-nums">
          {formatTime(endTime)}
        </span>
      </div>

      {/* Timeline dot */}
      <div className="relative flex-shrink-0 mt-1">
        <div
          className={cn(
            'w-4 h-4 rounded-full border-2 flex items-center justify-center text-[8px] z-10',
            hasConflict
              ? 'border-[#ef4444] bg-[#1a0d0d]'
              : 'border-[#2a2a2a] bg-[#111111]'
          )}
        >
          <span>{categoryEmoji}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Category + badges row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium capitalize shrink-0',
                categoryBadge
              )}
            >
              {category}
            </span>
            {locked && (
              <Lock size={10} className="text-[#555] shrink-0" />
            )}
            {weatherSensitive && (
              <CloudRain size={10} className="text-[#5a9fd4] shrink-0" />
            )}
          </div>
          {/* Cost */}
          {cost.amount > 0 && (
            <span className="text-[11px] font-semibold text-[#888] shrink-0 tabular-nums">
              {formatCurrency(cost.amount, cost.currency)}
              {cost.isEstimate && (
                <span className="text-[#444] font-normal">~</span>
              )}
            </span>
          )}
        </div>

        {/* Activity title */}
        <p className="text-[13px] font-semibold text-[#f0f0f0] mt-0.5 leading-snug">
          {title}
        </p>

        {/* Description */}
        {description && (
          <p className="text-[11px] text-[#666] mt-0.5 leading-relaxed line-clamp-2">
            {description}
          </p>
        )}

        {/* Footer chips */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[10px] text-[#444]">
            <Clock size={9} />
            {formatDurationMins(durationMinutes)}
          </span>
          {location?.name && (
            <span className="flex items-center gap-1 text-[10px] text-[#444] truncate">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{location.name}</span>
            </span>
          )}
          {cost.note && (
            <span className="text-[10px] text-[#444] italic truncate">
              {cost.note}
            </span>
          )}
        </div>

        {/* Conflict warning */}
        {hasConflict && (
          <p className="text-[11px] text-[#ef4444] mt-1 font-medium">
            ⚠ Timing conflict with previous activity
          </p>
        )}
      </div>
    </div>
  )
}
