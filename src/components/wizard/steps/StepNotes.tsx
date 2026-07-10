'use client'

import { ArrowRight } from 'lucide-react'
import type { StepProps } from '../stepTypes'
import { cn } from '@/lib/utils'

// STEP 8 · "Anything else?"
// A prominent Build button + a free-text box passed verbatim to the agent. This
// step owns its primary controls (the shell hides its default footer here).

export function StepNotes({ draft, update, advance }: StepProps) {
  const hasNotes = draft.notes.trim().length > 0

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col items-center gap-6">
      <button
        onClick={advance}
        className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-black text-[16px] font-semibold hover:bg-[#e8e8e8] active:bg-[#d0d0d0] transition-colors"
      >
        Build my trip
        <ArrowRight size={18} />
      </button>

      <p className="text-[12px] text-[#555]">— or add anything Hodo should know —</p>

      <textarea
        value={draft.notes}
        onChange={(e) => update({ notes: e.target.value })}
        placeholder="Dietary needs? Travelling with kids? Must-see places? Tell Hodo anything."
        rows={4}
        className={cn(
          'w-full bg-[#111111] border border-[#2a2a2a] rounded-2xl px-4 py-3.5',
          'text-[15px] text-[#f0f0f0] placeholder:text-[#444] leading-relaxed resize-none',
          'focus:outline-none focus:border-[#555] transition-colors',
        )}
      />

      {hasNotes && (
        <button
          onClick={advance}
          className="text-[13px] text-[#888] hover:text-[#f0f0f0] transition-colors"
        >
          Build with this note →
        </button>
      )}
    </div>
  )
}
