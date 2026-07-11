'use client'

// ─── Minimal monochrome month calendar ────────────────────────────────────────
// Single-date picker matching Hodo's black/white language: generous spacing,
// subtle hover, solid-white selected day, today softly ringed, past dates
// disabled, smooth month navigation.

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

export function Calendar({ value, onSelect }: { value: string | null; onSelect: (iso: string) => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate())

  const initial = value ? new Date(value + 'T00:00:00') : today
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() })

  const firstDow = new Date(view.y, view.m, 1).getDay()
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const canGoPrev = view.y > today.getFullYear() || (view.y === today.getFullYear() && view.m > today.getMonth())

  function shift(delta: number) {
    const total = view.m + delta
    setView({ y: view.y + Math.floor(total / 12), m: ((total % 12) + 12) % 12 })
  }

  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]

  return (
    <div className="w-full max-w-[320px] rounded-2xl border border-[#1f1f1f] bg-[#0d0d0d] p-4 select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => shift(-1)}
          disabled={!canGoPrev}
          aria-label="Previous month"
          className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            canGoPrev ? 'text-[#888] hover:text-white hover:bg-[#1a1a1a]' : 'text-[#2a2a2a] cursor-not-allowed')}
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-[14px] font-semibold text-[#f0f0f0]">{monthLabel}</span>
        <button
          onClick={() => shift(1)}
          aria-label="Next month"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-1.5">
        {WEEKDAYS.map((w) => (
          <span key={w} className="text-center text-[10px] font-medium text-[#777] py-1">{w}</span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />
          const iso = toISO(view.y, view.m, d)
          const isPast = iso < todayISO
          const isSelected = iso === value
          const isToday = iso === todayISO
          return (
            <button
              key={iso}
              disabled={isPast}
              onClick={() => onSelect(iso)}
              className={cn(
                'aspect-square rounded-lg text-[13px] flex items-center justify-center transition-colors',
                isSelected
                  ? 'bg-white text-black font-semibold'
                  : isPast
                    ? 'text-[#2a2a2a] cursor-not-allowed'
                    : 'text-[#ccc] hover:bg-[#1a1a1a]',
                !isSelected && isToday && 'ring-1 ring-[#3a3a3a]',
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}
