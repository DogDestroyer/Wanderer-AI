'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'
import type { StepProps } from '../stepTypes'
import { INTEREST_OPTIONS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { FloatingPills } from '../FloatingPills'

// STEP 7 · "What are your interests?"
// Drifting interest pills (same motion language as step 1) + a "+ Add" custom
// interest input, mirroring the preferences panel's behaviour (max 8 custom).

export function StepInterests({ draft, update }: StepProps) {
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (adding) inputRef.current?.focus() }, [adding])

  function toggle(interest: string) {
    update({
      interests: draft.interests.includes(interest)
        ? draft.interests.filter((i) => i !== interest)
        : [...draft.interests, interest],
    })
  }

  function submitCustom() {
    const val = value.trim().toLowerCase()
    setValue('')
    setAdding(false)
    if (!val) return
    const existing = [...INTEREST_OPTIONS.map((s) => s.toLowerCase()), ...draft.customInterests.map((s) => s.toLowerCase())]
    if (existing.includes(val)) return
    if (draft.customInterests.length >= 8) return
    update({ customInterests: [...draft.customInterests, val] })
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-8">
      <FloatingPills
        items={INTEREST_OPTIONS.map((i) => ({ key: i, label: i }))}
        selected={new Set(draft.interests)}
        onToggle={toggle}
      />

      {/* Custom interests */}
      <div className="flex flex-wrap justify-center gap-2.5">
        {draft.customInterests.map((interest) => (
          <button
            key={interest}
            onClick={() => update({ customInterests: draft.customInterests.filter((i) => i !== interest) })}
            title={`Remove "${interest}"`}
            className="group flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium border bg-white text-black border-white"
          >
            {interest}
            <X size={11} className="opacity-40 group-hover:opacity-80 transition-opacity" />
          </button>
        ))}

        {adding ? (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 20))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submitCustom() }
              else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAdding(false); setValue('') }
            }}
            onBlur={submitCustom}
            placeholder="e.g. onsen"
            className="px-4 py-2 rounded-full text-[13px] text-[#f0f0f0] border border-[#555] bg-[#1a1a1a] focus:outline-none w-[140px] placeholder:text-[#444]"
          />
        ) : (
          draft.customInterests.length < 8 && (
            <button
              onClick={() => setAdding(true)}
              className={cn(
                'px-4 py-2 rounded-full text-[13px] font-medium border border-dashed transition-colors',
                'border-[#2a2a2a] text-[#555] hover:border-[#555] hover:text-[#888]',
              )}
            >
              + Add your own
            </button>
          )
        )}
      </div>
    </div>
  )
}
