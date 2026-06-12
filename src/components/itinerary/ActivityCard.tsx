'use client'

import { useState } from 'react'
import { MapPin, Clock, Lock, Unlock, Pencil, CloudRain, Check, X } from 'lucide-react'
import type { Activity, ActivityCategory } from '@/lib/types'
import {
  cn,
  formatTime,
  formatDurationMins,
  formatCurrency,
  getCategoryEmoji,
} from '@/lib/utils'
import { convertCost, COMMON_CURRENCIES, type RatesMap } from '@/lib/currency'

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

const CATEGORIES: ActivityCategory[] = [
  'attraction', 'food', 'transport', 'accommodation', 'experience', 'leisure',
]

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
  /** The trip's budget/display currency. When set, the cost is shown PRIMARILY in
   *  this currency, with the original local price as a muted secondary value. */
  budgetCurrency?: string
  rates?: RatesMap
  /** Show the muted original local price under the converted primary (default true). */
  showLocalPrices?: boolean
  /** When provided, the card is interactive: lock toggle + edit pencil are shown. */
  onToggleLock?: () => void
  onSaveEdit?: (patch: Partial<Activity>) => void
}

export function ActivityCard({
  activity,
  isFirst,
  hasConflict,
  budgetCurrency,
  rates,
  showLocalPrices = true,
  onToggleLock,
  onSaveEdit,
}: ActivityCardProps) {
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

  const [editing, setEditing] = useState(false)
  const interactive = !!(onToggleLock || onSaveEdit)

  const categoryBadge = getCategoryDark(category)
  const categoryEmoji = getCategoryEmoji(category)

  // ── Currency display: selected/budget currency PRIMARY, local muted secondary ──
  const hasConversion =
    cost.amount > 0 &&
    !!budgetCurrency &&
    !!rates &&
    cost.currency.toUpperCase() !== budgetCurrency.toUpperCase()
  const primaryAmount = hasConversion ? convertCost(cost, budgetCurrency!, rates!) : cost.amount
  const primaryCurrency = hasConversion ? budgetCurrency! : cost.currency
  const showSecondaryLocal = hasConversion && showLocalPrices

  // ── Edit mode ────────────────────────────────────────────────────────────────
  if (editing && onSaveEdit) {
    return (
      <div className={cn('relative px-4 py-3.5', isFirst ? 'rounded-t-none' : '')}>
        <ActivityEditForm
          activity={activity}
          onSave={(patch) => {
            onSaveEdit(patch)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'relative flex gap-4 px-4 py-3.5 group transition-colors',
        hasConflict
          ? 'bg-[#1a0d0d] hover:bg-[#1e1010]'
          : locked
            ? 'bg-[#100f0a] hover:bg-[#15130c]'
            : 'hover:bg-[#161616]',
        isFirst ? 'rounded-t-none' : ''
      )}
    >
      {/* Locked accent bar */}
      {locked && !hasConflict && (
        <span className="absolute left-0 inset-y-0 w-[2px] bg-[#8a6d3b]" aria-hidden />
      )}

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
        {/* Category + controls row */}
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

            {/* Lock toggle (interactive) or static lock indicator (read-only overlay) */}
            {interactive && onToggleLock ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleLock()
                }}
                title={locked
                  ? 'Locked — protected from AI changes. Click to unlock.'
                  : 'Lock to protect this card from AI changes'}
                aria-label={locked ? 'Unlock activity' : 'Lock activity'}
                className={cn(
                  'inline-flex items-center justify-center w-5 h-5 rounded-md transition-all shrink-0',
                  locked
                    ? 'text-[#d4a017] bg-[#1a1608]'
                    : 'text-[#555] hover:text-[#aaa] opacity-100 md:opacity-0 md:group-hover:opacity-100',
                )}
              >
                {locked
                  ? <Lock size={11} fill="currentColor" />
                  : <Unlock size={11} />}
              </button>
            ) : (
              locked && <Lock size={10} className="text-[#8a6d3b] shrink-0" fill="currentColor" />
            )}

            {/* Edit pencil (interactive only) */}
            {interactive && onSaveEdit && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(true)
                }}
                title="Edit this activity"
                aria-label="Edit activity"
                className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[#555] hover:text-[#aaa] transition-all shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100"
              >
                <Pencil size={11} />
              </button>
            )}

            {weatherSensitive && (
              <CloudRain size={10} className="text-[#5a9fd4] shrink-0" />
            )}
          </div>

          {/* Cost — selected currency primary, original local price muted below */}
          {cost.amount > 0 && (
            <div className="flex flex-col items-end shrink-0">
              <span className="text-[11px] font-semibold text-[#888] tabular-nums">
                {formatCurrency(primaryAmount, primaryCurrency)}
                {cost.isEstimate && <span className="text-[#444] font-normal"> ~</span>}
              </span>
              {showSecondaryLocal && (
                <span className="text-[10px] text-[#444] tabular-nums leading-tight">
                  {formatCurrency(cost.amount, cost.currency)}
                </span>
              )}
            </div>
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

// ─── ActivityEditForm ─────────────────────────────────────────────────────────
// In-place editor for a single activity. No AI involved — edits go straight to
// the store via onSave, which auto-locks the card and reflows timings.

function ActivityEditForm({
  activity,
  onSave,
  onCancel,
}: {
  activity: Activity
  onSave: (patch: Partial<Activity>) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(activity.title)
  const [description, setDescription] = useState(activity.description)
  const [category, setCategory] = useState<ActivityCategory>(activity.category)
  const [startTime, setStartTime] = useState(activity.startTime)
  const [duration, setDuration] = useState(String(activity.durationMinutes))
  const [amount, setAmount] = useState(String(activity.cost.amount))
  const [currency, setCurrency] = useState(activity.cost.currency)
  const [locName, setLocName] = useState(activity.location?.name ?? '')

  function handleSave() {
    const durNum = Math.max(0, Math.round(Number(duration) || 0))
    const amtNum = Math.max(0, Number(amount) || 0)
    onSave({
      title: title.trim() || activity.title,
      description: description.trim(),
      category,
      startTime: startTime || activity.startTime,
      durationMinutes: durNum,
      cost: { ...activity.cost, amount: amtNum, currency },
      // Keep existing lat/lng; only the display name changes. (Geocoding a freshly
      // typed location name is a future improvement.)
      location: { ...activity.location, name: locName.trim() },
    })
  }

  // Enter saves, Esc cancels (textarea is exempt so it can hold newlines).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault()
      handleSave()
    }
  }

  const inputCls =
    'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-md px-2 py-1 text-[12px] text-[#f0f0f0] ' +
    'focus:outline-none focus:border-[#555] placeholder:text-[#444]'
  const labelCls = 'text-[9px] font-medium uppercase tracking-wide text-[#555] mb-0.5 block'

  return (
    <div
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      className="space-y-2.5"
    >
      {/* Title */}
      <div>
        <label className={labelCls}>Title</label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* Description */}
      <div>
        <label className={labelCls}>Description</label>
        <textarea
          className={cn(inputCls, 'resize-none h-12')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Category + Location */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Category</label>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ActivityCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Location</label>
          <input className={inputCls} value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Place name" />
        </div>
      </div>

      {/* Start time + Duration */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Start time</label>
          <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Duration (min)</label>
          <input type="number" min={0} step={5} className={inputCls} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>

      {/* Cost amount + currency */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Cost</label>
          <input type="number" min={0} step={1} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Currency</label>
          <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {/* Ensure the activity's current currency is selectable even if exotic */}
            {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[#888] hover:text-[#f0f0f0] border border-[#2a2a2a] hover:border-[#444] transition-colors"
        >
          <X size={11} /> Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-black hover:bg-[#e8e8e8] transition-colors"
        >
          <Check size={11} /> Save
        </button>
      </div>
      <p className="text-[9px] text-[#444] text-right">Enter to save · Esc to cancel · saving locks the card</p>
    </div>
  )
}
