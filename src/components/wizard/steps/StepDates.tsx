'use client'

import type { StepProps } from '../stepTypes'
import { cn } from '@/lib/utils'
import { daysBetween, addDays } from '@/lib/wizard'

// STEP 4 · "When are you travelling?"
// Two-way sync with step 3: picking a full range sets the day count; if days
// were already chosen, picking a start auto-suggests the end. Skippable — day
// count alone then drives planning (weather/flights activate once dates exist).

export function StepDates({ draft, update }: StepProps) {
  function setStart(start: string) {
    if (!start) { update({ startDate: null }); return }
    const patch: Partial<typeof draft> = { startDate: start }
    if (draft.days && draft.days > 0) {
      // Auto-suggest the end from the existing day count.
      patch.endDate = addDays(start, draft.days - 1)
    } else if (draft.endDate && new Date(draft.endDate) < new Date(start)) {
      patch.endDate = start
    }
    update(patch)
  }

  function setEnd(end: string) {
    if (!end) { update({ endDate: null }); return }
    const patch: Partial<typeof draft> = { endDate: end }
    // Picking a full range drives the day count.
    if (draft.startDate) patch.days = daysBetween(draft.startDate, end)
    update(patch)
  }

  const inputCls = cn(
    'w-full bg-[#111111] border border-[#2a2a2a] rounded-xl px-4 py-3.5',
    'text-[15px] text-[#f0f0f0] focus:outline-none focus:border-[#555] transition-colors',
    '[color-scheme:dark]',
  )

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
      <label className="block">
        <span className="text-[12px] font-medium text-[#888] mb-1.5 block">Start date</span>
        <input type="date" value={draft.startDate ?? ''} onChange={(e) => setStart(e.target.value)} className={inputCls} />
      </label>
      <label className="block">
        <span className="text-[12px] font-medium text-[#888] mb-1.5 block">End date</span>
        <input type="date" value={draft.endDate ?? ''} min={draft.startDate ?? undefined} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
      </label>

      {draft.startDate && draft.endDate && (
        <p className="text-center text-[13px] text-[#888] mt-1">
          {daysBetween(draft.startDate, draft.endDate)} days
        </p>
      )}
    </div>
  )
}
