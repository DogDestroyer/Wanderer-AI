'use client'

import { useState, useEffect } from 'react'
import { Gauge, Star, RefreshCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, getPaceLabel, getBudgetLabel } from '@/lib/utils'

// ─── PreferenceSliders ────────────────────────────────────────────────────────
// Reads directly from the active trip's preferences in the store.
// Local slider state tracks the "pending" edit; Apply commits to store + re-plans.

interface PreferenceSlidersProps {
  tripId: string
  onApply: (pace: number, budget: number) => void
}

export function PreferenceSliders({ tripId, onApply }: PreferenceSlidersProps) {
  const trips       = useStore((s) => s.trips)
  const isGenerating = useStore((s) => s.isGenerating)
  const preferences  = trips[tripId]?.preferences

  const savedPace   = preferences?.paceLevel   ?? 50
  const savedBudget = preferences?.budgetLevel ?? 50

  // Local state mirrors saved values; diverges only while dragging
  const [pace,   setPace]   = useState(savedPace)
  const [budget, setBudget] = useState(savedBudget)

  // Keep local state in sync if the trip is externally updated (e.g. by the AI)
  useEffect(() => { setPace(savedPace)   }, [savedPace])
  useEffect(() => { setBudget(savedBudget) }, [savedBudget])

  const isDirty = pace !== savedPace || budget !== savedBudget

  return (
    <div className="space-y-4">
      <SliderRow
        icon={<Gauge size={11} className="text-[#555]" />}
        label="Pace"
        valueLabel={getPaceLabel(pace)}
        value={pace}
        onChange={setPace}
        leftHint="Relaxed"
        rightHint="Packed"
      />
      <SliderRow
        icon={<Star size={11} className="text-[#555]" />}
        label="Budget style"
        valueLabel={getBudgetLabel(budget)}
        value={budget}
        onChange={setBudget}
        leftHint="Shoestring"
        rightHint="Luxury"
      />

      {/* Apply button — visible only when dirty */}
      <div className={cn('overflow-hidden transition-all duration-200', isDirty ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0')}>
        <button
          onClick={() => onApply(pace, budget)}
          disabled={isGenerating}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold',
            'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0]',
            'disabled:bg-[#1a1a1a] disabled:text-[#444] disabled:cursor-not-allowed',
            'transition-colors',
          )}
        >
          <RefreshCw size={12} className={cn(isGenerating && 'animate-spin')} />
          {isGenerating ? 'Re-planning…' : 'Apply & Re-plan trip'}
        </button>
      </div>
    </div>
  )
}

// ─── SliderRow ────────────────────────────────────────────────────────────────

function SliderRow({
  icon, label, valueLabel, value, onChange, leftHint, rightHint,
}: {
  icon: React.ReactNode
  label: string
  valueLabel: string
  value: number
  onChange: (v: number) => void
  leftHint: string
  rightHint: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] font-medium text-[#555]">{label}</span>
        </div>
        <span className="text-[11px] font-semibold text-[#f0f0f0] tabular-nums">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: '#ffffff', height: '3px' }}
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#333]">{leftHint}</span>
        <span className="text-[10px] text-[#333]">{rightHint}</span>
      </div>
    </div>
  )
}
