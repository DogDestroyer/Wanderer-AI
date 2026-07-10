'use client'

import type { StepProps } from '../stepTypes'
import { addDays } from '@/lib/wizard'
import { Calendar } from '../Calendar'

// STEP 4 · "When are you travelling?"
// Start-date-only. The end date is computed from the day count (start + days − 1)
// and shown but not editable. No default date; the step stays skippable (weather
// and live prices activate once dates exist).

const fmt = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function StepDates({ draft, update }: StepProps) {
  const days = draft.days ?? 7

  function pickStart(iso: string) {
    update({ startDate: iso, endDate: addDays(iso, days - 1) })
  }

  return (
    <div className="w-full flex flex-col items-center gap-5">
      <Calendar value={draft.startDate} onSelect={pickStart} />

      {draft.startDate && draft.endDate ? (
        <div className="text-center">
          <p className="text-[16px] font-semibold text-white">
            {fmt(draft.startDate)} <span className="text-[#555]">→</span> {fmt(draft.endDate)}
            <span className="text-[#555]"> · {days} days</span>
          </p>
          <p className="text-[12px] text-[#555] mt-1">End date set automatically by your trip length</p>
        </div>
      ) : (
        <p className="text-[13px] text-[#555] text-center max-w-xs">
          Pick a start date — Hodo sets the end from your {days}-day length.
        </p>
      )}
    </div>
  )
}
