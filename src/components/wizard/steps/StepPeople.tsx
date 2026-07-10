'use client'

import type { StepProps } from '../stepTypes'
import type { PartyType } from '@/lib/types'
import { NumberStepper, PillButton } from '../WizardKit'
import { suggestedPartyType } from '@/lib/wizard'

// STEP 5 · "How many people?"
// Defaults to 3. Stepper-only (no manual entry), bounds 1–16. Party-type chips
// auto-highlight from the size but stay overridable; "Work" flags a business
// trip that shifts planning (see the agent prompt).

const TYPES: PartyType[] = ['solo', 'couple', 'family', 'friends', 'work']

export function StepPeople({ draft, update }: StepProps) {
  const size = draft.partySize ?? 3
  const effectiveType = draft.partyType ?? suggestedPartyType(size)

  return (
    <div className="flex flex-col items-center gap-9">
      <NumberStepper value={size} onChange={(n) => update({ partySize: n })} min={1} max={16} unit={size === 1 ? 'traveller' : 'travellers'} />

      <div className="flex flex-wrap justify-center gap-2.5">
        {TYPES.map((t) => (
          <PillButton
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={effectiveType === t}
            onClick={() => update({ partyType: t })}
          />
        ))}
      </div>
    </div>
  )
}
