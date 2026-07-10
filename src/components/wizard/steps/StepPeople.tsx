'use client'

import type { StepProps } from '../stepTypes'
import type { PartyType } from '@/lib/types'
import { NumberStepper, PillButton } from '../WizardKit'
import { suggestedPartyType } from '@/lib/wizard'

// STEP 5 · "How many people?"
// Number stepper (disabled until entered) + party-type chips that auto-highlight
// sensibly from the size but remain overridable.

const TYPES: PartyType[] = ['solo', 'couple', 'family', 'friends']

export function StepPeople({ draft, update }: StepProps) {
  // The highlighted type: explicit choice wins, else the suggestion from size.
  const effectiveType = draft.partyType ?? (draft.partySize ? suggestedPartyType(draft.partySize) : null)

  function setSize(n: number) {
    update({ partySize: n })
  }

  return (
    <div className="flex flex-col items-center gap-9">
      <NumberStepper value={draft.partySize} onChange={setSize} min={1} max={12} seed={2} unit={draft.partySize === 1 ? 'traveller' : 'travellers'} />

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
