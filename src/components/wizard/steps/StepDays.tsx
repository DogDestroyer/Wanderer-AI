'use client'

import type { StepProps } from '../stepTypes'
import { NumberStepper } from '../WizardKit'
import { daysBetween, addDays } from '@/lib/wizard'

// STEP 3 · "How many days?"
// Defaults to 7 on arrival. Stepper-only (no manual text entry); buttons disable
// at the 1–30 bounds. Two-way sync with dates: changing days shifts the end date
// if a start is set.

export function StepDays({ draft, update }: StepProps) {
  const days = draft.days ?? 7

  function setDays(n: number) {
    const patch: Partial<typeof draft> = { days: n }
    if (draft.startDate) patch.endDate = addDays(draft.startDate, n - 1)
    update(patch)
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <NumberStepper value={days} onChange={setDays} min={1} max={30} unit={days === 1 ? 'day' : 'days'} />
      {draft.startDate && draft.endDate && (
        <p className="text-[12px] text-[#555]">
          {daysBetween(draft.startDate, draft.endDate)} days from your selected dates
        </p>
      )}
    </div>
  )
}
