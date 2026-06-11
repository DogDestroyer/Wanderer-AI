'use client'

import { useState } from 'react'
import { Gauge, Star, RefreshCw } from 'lucide-react'
import { cn, getPaceLabel, getBudgetLabel } from '@/lib/utils'

interface PreferenceSlidersProps {
  /** Current saved values from the trip */
  savedPace: number
  savedBudget: number
  isGenerating: boolean
  onApply: (pace: number, budget: number) => void
}

export function PreferenceSliders({
  savedPace,
  savedBudget,
  isGenerating,
  onApply,
}: PreferenceSlidersProps) {
  const [pace, setPace] = useState(savedPace)
  const [budget, setBudget] = useState(savedBudget)

  const isDirty = pace !== savedPace || budget !== savedBudget

  return (
    <div className="space-y-4">
      {/* Pace slider */}
      <SliderRow
        icon={<Gauge size={12} className="text-indigo-400" />}
        label="Pace"
        valueLabel={getPaceLabel(pace)}
        value={pace}
        onChange={setPace}
        leftHint="Relaxed"
        rightHint="Packed"
      />

      {/* Budget slider */}
      <SliderRow
        icon={<Star size={12} className="text-indigo-400" />}
        label="Budget style"
        valueLabel={getBudgetLabel(budget)}
        value={budget}
        onChange={setBudget}
        leftHint="Shoestring"
        rightHint="Luxury"
      />

      {/* Apply button — only visible when values have changed */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isDirty ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <button
          onClick={() => onApply(pace, budget)}
          disabled={isGenerating}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold',
            'bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700',
            'disabled:bg-indigo-300 disabled:cursor-not-allowed',
            'transition-colors shadow-sm shadow-indigo-200',
          )}
        >
          <RefreshCw size={13} className={cn(isGenerating && 'animate-spin')} />
          {isGenerating ? 'Re-planning…' : 'Apply & Re-plan trip'}
        </button>
      </div>
    </div>
  )
}

// ─── SliderRow ────────────────────────────────────────────────────────────────

function SliderRow({
  icon,
  label,
  valueLabel,
  value,
  onChange,
  leftHint,
  rightHint,
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
      {/* Label row */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] font-medium text-gray-500">{label}</span>
        </div>
        <span className="text-[11px] font-semibold text-indigo-600 tabular-nums">
          {valueLabel}
        </span>
      </div>

      {/* Range input */}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: '#4f46e5', height: '4px' }}
      />

      {/* End hints */}
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-gray-300">{leftHint}</span>
        <span className="text-[10px] text-gray-300">{rightHint}</span>
      </div>
    </div>
  )
}
