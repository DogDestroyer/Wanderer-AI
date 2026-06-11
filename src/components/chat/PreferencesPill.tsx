'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, getBudgetLabel, getPaceLabel, getTripStyleLabel } from '@/lib/utils'
import { PreferencesPanel } from '@/components/preferences/PreferencesPanel'

// ─── PreferencesPill ──────────────────────────────────────────────────────────
// A quiet pill that summarises the 3 core preferences.
// Click the pill → inline popover with the 3 sliders.
// Click ⚙ inside the popover → full PreferencesPanel.

export function PreferencesPill() {
  const prefs       = useStore((s) => s.draftPreferences)
  const updateDraft = useStore((s) => s.updateDraftPreferences)

  const [open, setOpen]         = useState(false)
  const [showFullPanel, setShowFullPanel] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close popover on Escape
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const budgetLabel = getBudgetLabel(prefs.budgetLevel)
  const paceLabel   = getPaceLabel(prefs.paceLevel)
  const styleLabel  = getTripStyleLabel(prefs.tripStyle ?? 50)

  return (
    <>
      <div ref={containerRef} className="relative inline-flex">

        {/* ── Pill button ──────────────────────────────────────────────────── */}
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] transition-colors',
            open
              ? 'bg-[#1a1a1a] border-[#333] text-[#888]'
              : 'bg-transparent border-[#222] text-[#444] hover:border-[#333] hover:text-[#666]',
          )}
        >
          <span>{budgetLabel}</span>
          <span className="text-[#2a2a2a]">·</span>
          <span>{paceLabel}</span>
          <span className="text-[#2a2a2a]">·</span>
          <span>{styleLabel}</span>
          <Settings2 size={11} className="ml-0.5 opacity-60" />
        </button>

        {/* ── Inline popover ───────────────────────────────────────────────── */}
        {open && (
          <div className={cn(
            'absolute bottom-full mb-2 left-1/2 -translate-x-1/2',
            'w-[280px] rounded-2xl border border-[#2a2a2a] bg-[#111111]',
            'p-4 shadow-2xl shadow-black/60',
            'z-50',
          )}>
            {/* Sliders */}
            <div className="space-y-4">
              <PillSlider
                label="Budget"
                value={prefs.budgetLevel}
                valueLabel={budgetLabel}
                leftHint="Shoestring"
                rightHint="Luxury"
                onChange={(v) => updateDraft({ budgetLevel: v })}
              />
              <PillSlider
                label="Pace"
                value={prefs.paceLevel}
                valueLabel={paceLabel}
                leftHint="Relaxed"
                rightHint="Packed"
                onChange={(v) => updateDraft({ paceLevel: v })}
              />
              <PillSlider
                label="Style"
                value={prefs.tripStyle ?? 50}
                valueLabel={styleLabel}
                leftHint="Nature"
                rightHint="City"
                onChange={(v) => updateDraft({ tripStyle: v })}
              />
            </div>

            {/* All options link */}
            <button
              onClick={() => { setOpen(false); setShowFullPanel(true) }}
              className="mt-4 w-full text-center text-[11px] text-[#444] hover:text-[#888] transition-colors"
            >
              All preferences →
            </button>
          </div>
        )}
      </div>

      {/* Full preferences panel */}
      <PreferencesPanel open={showFullPanel} onClose={() => setShowFullPanel(false)} />
    </>
  )
}

// ─── PillSlider ───────────────────────────────────────────────────────────────

function PillSlider({
  label, value, valueLabel, leftHint, rightHint, onChange,
}: {
  label: string
  value: number
  valueLabel: string
  leftHint: string
  rightHint: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-[#555]">{label}</span>
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
        style={{ accentColor: '#ffffff', height: '2px' }}
      />
      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#333]">{leftHint}</span>
        <span className="text-[10px] text-[#333]">{rightHint}</span>
      </div>
    </div>
  )
}
