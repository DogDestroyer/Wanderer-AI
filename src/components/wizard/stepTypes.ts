import type { WizardDraft } from '@/lib/wizard'

// Shared props every wizard step receives. `update` merges into the persisted
// draft; `advance` triggers the shell's "next" (used by steps with their own
// primary button, e.g. the notes/generate step).
export interface StepProps {
  draft: WizardDraft
  update: (patch: Partial<WizardDraft>) => void
  advance: () => void
}
