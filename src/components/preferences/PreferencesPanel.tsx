'use client'

import { useEffect, useRef } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import {
  DEFAULT_PREFERENCES,
  INTEREST_OPTIONS,
  type TripPreferences,
  type PartyType,
  type AccommodationType,
  type MobilityType,
} from '@/lib/types'
import {
  cn,
  getPaceLabel,
  getBudgetLabel,
  getTripStyleLabel,
  getDiningLabel,
} from '@/lib/utils'

// ─── PreferencesPanel ─────────────────────────────────────────────────────────
// Full preferences modal. Reads/writes draftPreferences (no active trip) or
// trips[activeTripId].preferences (active trip) — one source of truth.

interface PreferencesPanelProps {
  open: boolean
  onClose: () => void
}

export function PreferencesPanel({ open, onClose }: PreferencesPanelProps) {
  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const draft        = useStore((s) => s.draftPreferences)
  const updateDraft  = useStore((s) => s.updateDraftPreferences)
  const updateTrip   = useStore((s) => s.updateTrip)
  const overlayRef   = useRef<HTMLDivElement>(null)

  // Resolve current prefs and update handler
  const prefs: TripPreferences = activeTripId
    ? { ...DEFAULT_PREFERENCES, ...trips[activeTripId]?.preferences }
    : { ...DEFAULT_PREFERENCES, ...draft }

  function update(patch: Partial<TripPreferences>) {
    if (activeTripId) {
      updateTrip(activeTripId, { preferences: { ...prefs, ...patch } })
    } else {
      updateDraft(patch)
    }
  }

  function reset() {
    if (activeTripId) {
      updateTrip(activeTripId, { preferences: { ...DEFAULT_PREFERENCES } })
    } else {
      updateDraft({ ...DEFAULT_PREFERENCES })
    }
  }

  // Close on overlay click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleOverlayClick}
        >
          <motion.div
            className="w-full max-w-lg bg-[#111111] border border-[#2a2a2a] rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#1f1f1f]">
              <h2 className="text-[14px] font-semibold text-[#f0f0f0]">Trip Preferences</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={reset}
                  className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1.5 transition-colors"
                >
                  <RotateCcw size={10} />
                  Reset all
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto max-h-[70vh] p-5 space-y-6">

              {/* ── Core 3 sliders ─────────────────────────────────────────── */}
              <Section title="Planning style">
                <PanelSlider
                  label="Budget"
                  valueLabel={getBudgetLabel(prefs.budgetLevel)}
                  value={prefs.budgetLevel}
                  leftHint="Shoestring"
                  rightHint="Luxury"
                  onChange={(v) => update({ budgetLevel: v })}
                />
                <PanelSlider
                  label="Pace"
                  valueLabel={getPaceLabel(prefs.paceLevel)}
                  value={prefs.paceLevel}
                  leftHint="Relaxed"
                  rightHint="Packed"
                  onChange={(v) => update({ paceLevel: v })}
                />
                <PanelSlider
                  label="Style"
                  valueLabel={getTripStyleLabel(prefs.tripStyle ?? 50)}
                  value={prefs.tripStyle ?? 50}
                  leftHint="Nature"
                  rightHint="City"
                  onChange={(v) => update({ tripStyle: v })}
                />
              </Section>

              {/* ── Interests ─────────────────────────────────────────────── */}
              <Section title="Interests">
                <div className="flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((interest) => {
                    const active = prefs.interests.includes(interest)
                    return (
                      <button
                        key={interest}
                        onClick={() =>
                          update({
                            interests: active
                              ? prefs.interests.filter((i) => i !== interest)
                              : [...prefs.interests, interest],
                          })
                        }
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all',
                          active
                            ? 'bg-white text-black border-white'
                            : 'bg-transparent text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]'
                        )}
                      >
                        {interest}
                      </button>
                    )
                  })}
                </div>
              </Section>

              {/* ── Party ──────────────────────────────────────────────────── */}
              <Section title="Party">
                <div className="flex items-center gap-4">
                  {/* Size */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => update({ partySize: Math.max(1, (prefs.partySize ?? 2) - 1) })}
                      className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white flex items-center justify-center text-sm transition-colors"
                    >−</button>
                    <span className="text-[13px] font-semibold text-[#f0f0f0] w-4 text-center tabular-nums">
                      {prefs.partySize ?? 2}
                    </span>
                    <button
                      onClick={() => update({ partySize: Math.min(10, (prefs.partySize ?? 2) + 1) })}
                      className="w-7 h-7 rounded-lg bg-[#1a1a1a] border border-[#2a2a2a] text-[#888] hover:text-white flex items-center justify-center text-sm transition-colors"
                    >+</button>
                    <span className="text-[11px] text-[#555] ml-1">people</span>
                  </div>
                  <div className="h-3 w-px bg-[#2a2a2a]" />
                  {/* Type chips */}
                  {(['solo', 'couple', 'family', 'friends'] as PartyType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => update({ partyType: t })}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all capitalize',
                        (prefs.partyType ?? 'couple') === t
                          ? 'bg-white text-black border-white'
                          : 'text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]'
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Section>

              {/* ── Dining & Accommodation ─────────────────────────────────── */}
              <Section title="Dining & accommodation">
                <PanelSlider
                  label="Dining style"
                  valueLabel={getDiningLabel(prefs.diningStyle ?? 50)}
                  value={prefs.diningStyle ?? 50}
                  leftHint="Street food"
                  rightHint="Fine dining"
                  onChange={(v) => update({ diningStyle: v })}
                />
                <div className="mt-3">
                  <p className="text-[11px] font-medium text-[#555] mb-2">Accommodation</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['hostel', 'mid-range', 'boutique', 'luxury'] as AccommodationType[]).map((a) => (
                      <button
                        key={a}
                        onClick={() => update({ accommodation: a })}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all capitalize',
                          (prefs.accommodation ?? 'mid-range') === a
                            ? 'bg-white text-black border-white'
                            : 'text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]'
                        )}
                      >
                        {a === 'mid-range' ? 'Mid-range hotel' : a}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              {/* ── Mobility ───────────────────────────────────────────────── */}
              <Section title="Mobility">
                {(['full', 'limited'] as MobilityType[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => update({ mobility: m })}
                    className={cn(
                      'w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left mb-2 last:mb-0',
                      (prefs.mobility ?? 'full') === m
                        ? 'bg-white/5 border-white/30 text-[#f0f0f0]'
                        : 'border-[#2a2a2a] text-[#666] hover:border-[#444] hover:text-[#888]'
                    )}
                  >
                    <span className="text-[13px] font-medium capitalize leading-tight">
                      {m === 'full' ? 'Lots of walking OK' : 'Minimise walking'}
                    </span>
                  </button>
                ))}
              </Section>

              {/* ── Must avoid ─────────────────────────────────────────────── */}
              <Section title="Must avoid">
                <textarea
                  value={prefs.mustAvoid ?? ''}
                  onChange={(e) => update({ mustAvoid: e.target.value })}
                  placeholder="e.g. theme parks, very touristy restaurants, stairs…"
                  rows={2}
                  className={cn(
                    'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3.5 py-2.5',
                    'text-[12px] text-[#f0f0f0] placeholder:text-[#333] leading-relaxed resize-none',
                    'focus:outline-none focus:border-[#444] transition-colors'
                  )}
                />
              </Section>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#1f1f1f] flex items-center justify-between">
              <p className="text-[10px] text-[#444] leading-relaxed max-w-xs">
                These preferences shape every new plan. Your chat message overrides them if there&apos;s a conflict.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white text-black text-[12px] font-semibold rounded-lg hover:bg-[#e8e8e8] transition-colors"
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Section ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#444] uppercase tracking-widest mb-3">{title}</p>
      {children}
    </div>
  )
}

// ─── PanelSlider ─────────────────────────────────────────────────────────────

function PanelSlider({
  label, valueLabel, value, leftHint, rightHint, onChange,
}: {
  label: string
  valueLabel: string
  value: number
  leftHint: string
  rightHint: string
  onChange: (v: number) => void
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-medium text-[#888]">{label}</span>
        <span className="text-[12px] font-semibold text-[#f0f0f0]">{valueLabel}</span>
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
