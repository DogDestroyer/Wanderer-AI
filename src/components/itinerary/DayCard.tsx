'use client'

import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { DollarSign, Pencil, Check, X, RotateCw, AlertTriangle } from 'lucide-react'
import { Typewriter, CountUp } from './BuildStatus'
import type { Day } from '@/lib/types'
import { cn, formatCurrency, getWeatherEmoji, isBadWeather } from '@/lib/utils'
import { calculateDayBudgetConverted, detectTimingConflicts } from '@/lib/recalculate'
import { deriveDayTitle } from '@/lib/dayTitle'
import { useStore } from '@/lib/store'
import { type RatesMap, FALLBACK_RATES } from '@/lib/currency'
import { SortableActivityCard } from './SortableActivityCard'

interface DayCardProps {
  day: Day
  index: number
  tripId: string
  tripCurrency: string
  isDraggingAny: boolean
  rates?: RatesMap
  showLocalPrices?: boolean
  planning?: boolean
  incomplete?: boolean
  building?: boolean   // live-build in progress (shimmer empty days, typewriter titles)
  failed?: boolean     // this day's batch failed — show a retry card in place
}

export function DayCard({ day, index, tripId, tripCurrency, isDraggingAny, rates = FALLBACK_RATES, showLocalPrices, planning, incomplete, building, failed }: DayCardProps) {
  const { activities, weather, dayNotes } = day

  const setDayTitle = useStore((s) => s.setDayTitle)
  const dayTotal = calculateDayBudgetConverted(activities, tripCurrency, rates)
  const conflictIds = new Set(detectTimingConflicts(activities))
  const title = deriveDayTitle(day)  // stored dayTitle, else locally derived (no AI)
  const dateStr = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const activityIds = activities.map((a) => a.id)

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  function startEditTitle() {
    setTitleDraft(title)
    setEditingTitle(true)
  }
  function saveTitle() {
    setDayTitle(tripId, day.id, titleDraft.trim())
    setEditingTitle(false)
  }

  const outdoorCount = activities.filter((a) => a.weatherSensitive).length
  const showRainWarning = !!weather && isBadWeather(weather.condition) && outdoorCount > 0

  const { setNodeRef, isOver } = useDroppable({ id: day.id })

  return (
    <div
      data-testid="day-card"
      data-day-id={day.id}
      data-populated={activities.length > 0 ? 'true' : 'false'}
      className={cn(
        'bg-[#111111] rounded-xl border overflow-hidden transition-colors duration-150',
        isOver && isDraggingAny
          ? 'border-[#444]'
          : 'border-[#1f1f1f]'
      )}
    >
      {/* ── Day header ─────────────────────────────────────────────────────── */}
      <div className="group flex items-center justify-between px-4 py-3 border-b border-[#1f1f1f]">
        <div className="flex items-center gap-3 min-w-0">
          {/* Day number pill */}
          <div className="w-7 h-7 rounded-lg bg-[#1f1f1f] flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-[#888]">{index + 1}</span>
          </div>
          <div className="min-w-0">
            {editingTitle ? (
              <div className="flex items-center gap-1.5">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveTitle() }
                    else if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false) }
                  }}
                  placeholder="Day title"
                  className="w-[180px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-2 py-0.5 text-[12px] text-[#f0f0f0] focus:outline-none focus:border-[#555]"
                />
                <button onClick={saveTitle} aria-label="Save title" className="text-[#3eb87a] hover:text-[#4dd88f]"><Check size={13} /></button>
                <button onClick={() => setEditingTitle(false)} aria-label="Cancel" className="text-[#666] hover:text-[#f0f0f0]"><X size={13} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-[13px] font-semibold text-[#f0f0f0] leading-tight truncate">
                  Day {index + 1}{title && <span className="text-[#888] font-medium"> · {building ? <Typewriter text={title} cps={38} /> : title}</span>}
                </p>
                <button
                  onClick={startEditTitle}
                  aria-label="Edit day title"
                  className="shrink-0 text-[#555] hover:text-[#aaa] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                >
                  <Pencil size={11} />
                </button>
              </div>
            )}
            <p className="text-[11px] text-[#777] leading-tight mt-0.5">
              {dateStr}
              {activities.length > 0 && ` · ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
            </p>
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
            <span className="flex items-center gap-0.5 text-[11px] font-medium text-[#555] bg-[#161616] border border-[#2a2a2a] rounded-lg px-2 py-1 tabular-nums">
              <DollarSign size={10} />
              {building
                ? <CountUp value={dayTotal} format={(n) => formatCurrency(n, tripCurrency).replace(/[^\d,.]/g, '')} />
                : formatCurrency(dayTotal, tripCurrency).replace(/[^\d,.]/g, '')}
            </span>
          )}
        </div>
      </div>

      {/* ── Activities ─────────────────────────────────────────────────────── */}
      <div ref={setNodeRef}>
        {activities.length === 0 ? (
          <div
            className={cn(
              'px-4 transition-colors',
              failed || building ? 'py-5' : 'py-8 text-center',
              isOver && isDraggingAny && !building ? 'bg-[#161616]' : ''
            )}
          >
            {failed ? (
              <div className="flex flex-col items-center gap-2.5 text-center" data-testid="day-failed">
                <p className="text-[12px] text-[#f59e0b] flex items-center gap-1.5">
                  <AlertTriangle size={13} /> This day couldn&apos;t be built.
                </p>
                <button
                  onClick={() => document.dispatchEvent(new CustomEvent('wandr:resume-fill'))}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-black bg-white px-2.5 py-1 rounded-md hover:bg-[#e8e8e8] transition-colors"
                >
                  <RotateCw size={11} /> Retry
                </button>
              </div>
            ) : building ? (
              <div className="space-y-2.5" data-testid="day-shimmer-rows" aria-label="Planning activities">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="build-shimmer h-8 w-14 rounded-md shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="build-shimmer h-2.5 rounded" style={{ width: `${70 - i * 12}%` }} />
                      <div className="build-shimmer h-2 rounded w-1/4" />
                    </div>
                  </div>
                ))}
              </div>
            ) : planning ? (
              <p className="text-[12px] text-[#555] flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-[#333] border-t-[#777] rounded-full animate-spin" />
                Planning this day…
              </p>
            ) : incomplete && !(isOver && isDraggingAny) ? (
              <p className="text-[12px] text-[#f59e0b] flex items-center justify-center gap-1.5">
                <span>⚠</span> This day didn&apos;t finish building — tap “Resume” above to retry.
              </p>
            ) : (
              <p className="text-[12px] text-[#333]">
                {isOver && isDraggingAny
                  ? 'Drop here to add to this day'
                  : 'No activities planned for this day yet.'}
              </p>
            )}
          </div>
        ) : (
          <SortableContext items={activityIds} strategy={verticalListSortingStrategy}>
            <div className={cn('divide-y divide-[#161616]', building && 'animate-in')}>
              {activities.map((activity, actIdx) => (
                <SortableActivityCard
                  key={activity.id}
                  activity={activity}
                  isFirst={actIdx === 0}
                  hasConflict={conflictIds.has(activity.id)}
                  prevTravelMins={actIdx > 0 ? activities[actIdx - 1].travelTimeToNextMinutes : 0}
                  isDraggingAny={isDraggingAny}
                  tripId={tripId}
                  dayId={day.id}
                  dayDate={day.date}
                  budgetCurrency={tripCurrency}
                  rates={rates}
                  showLocalPrices={showLocalPrices}
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
                `Day ${index + 1} (${dateStr}) has ${weather!.description.toLowerCase()} in the forecast ` +
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
