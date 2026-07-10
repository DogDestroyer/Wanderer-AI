'use client'

import type { StepProps } from '../stepTypes'
import { NumberStepper } from '../WizardKit'
import { daysBetween, addDays } from '@/lib/wizard'

// STEP 3 · "How many days?"
// Large centred number with −/+ steppers (disabled until a value exists).
// Two-way sync with dates: changing days shifts the end date if a start is set.

export function StepDays({ draft, update }: StepProps) {
  function setDays(n: number) {
    const patch: Partial<typeof draft> = { days: n }
    // Keep the date range consistent if a start date already exists.
    if (draft.startDate) patch.endDate = addDays(draft.startDate, n - 1)
    update(patch)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <NumberStepper value={draft.days} onChange={setDays} min={1} max={30} seed={7} unit={draft.days === 1 ? 'day' : 'days'} />
      {draft.startDate && draft.endDate && (
        <p className="text-[12px] text-[#555]">
          {daysBetween(draft.startDate, draft.endDate)} days from your selected dates
        </p>
      )}
    </div>
  )
}
