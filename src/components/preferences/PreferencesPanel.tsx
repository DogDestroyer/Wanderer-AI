'use client'

import { useState, useEffect, useRef } from 'react'
import { X, RotateCcw, ChevronDown } from 'lucide-react'
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
import { COMMON_CURRENCIES } from '@/lib/currency'

// ─── Constants ────────────────────────────────────────────────────────────────
// Use the shared list so every code has a known conversion rate.
const CURRENCIES = COMMON_CURRENCIES

// Format a raw input string into a locale-style number with commas.
// Strips all non-digit chars, parses, and re-formats. Returns "" for empty/zero.
function formatAmount(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  return isNaN(n) ? '' : n.toLocaleString('en')
}

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
  const setTripDisplayCurrency = useStore((s) => s.setTripDisplayCurrency)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // ── Local state for exact budget input ──────────────────────────────────────
  // These are kept in local state so formatting doesn't fight with the cursor.
  // They sync from the store whenever the panel opens.
  const [amountStr, setAmountStr]   = useState('')
  const [currency, setCurrency]     = useState('SGD')
  const [perPerson, setPerPerson]   = useState(false)

  // ── Local state for custom interest inline input ─────────────────────────────
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [customInput, setCustomInput]       = useState('')

  // ── Resolve current prefs from store ────────────────────────────────────────
  const prefs: TripPreferences = activeTripId
    ? { ...DEFAULT_PREFERENCES, ...trips[activeTripId]?.preferences }
    : { ...DEFAULT_PREFERENCES, ...draft }

  const hasExactBudget = !!(prefs.exactBudget?.amount && prefs.exactBudget.amount > 0)

  // ── Sync local budget state when the panel opens ─────────────────────────────
  // Intentionally omitting `prefs` from deps — re-init only on open so we don't
  // interrupt the user while they are typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return
    setAmountStr(prefs.exactBudget?.amount ? prefs.exactBudget.amount.toLocaleString('en') : '')
    setCurrency(prefs.exactBudget?.currency ?? 'SGD')
    setPerPerson(prefs.exactBudget?.perPerson ?? false)
    setIsAddingCustom(false)
    setCustomInput('')
  }, [open])

  // Auto-focus the custom interest input when it appears
  useEffect(() => {
    if (isAddingCustom) customInputRef.current?.focus()
  }, [isAddingCustom])

  // ── Store write helpers ──────────────────────────────────────────────────────

  function update(patch: Partial<TripPreferences>) {
    if (activeTripId) {
      updateTrip(activeTripId, { preferences: { ...prefs, ...patch } })
    } else {
      updateDraft(patch)
    }
  }

  function reset() {
    // Clear local form state first
    setAmountStr('')
    setCurrency('SGD')
    setPerPerson(false)
    setIsAddingCustom(false)
    setCustomInput('')
    // Reset store — DEFAULT_PREFERENCES includes exactBudget: null, customInterests: []
    if (activeTripId) {
      updateTrip(activeTripId, { preferences: { ...DEFAULT_PREFERENCES } })
    } else {
      updateDraft({ ...DEFAULT_PREFERENCES })
    }
  }

  // ── Exact budget helpers ─────────────────────────────────────────────────────

  function commitExactBudget(str: string, curr: string, pp: boolean) {
    const raw = parseInt(str.replace(/,/g, ''), 10)
    update({
      exactBudget: (isNaN(raw) || raw <= 0) ? null : { amount: raw, currency: curr, perPerson: pp },
    })
  }

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatAmount(e.target.value)
    setAmountStr(formatted)
    commitExactBudget(formatted, currency, perPerson)
  }

  // ── Custom interest helpers ──────────────────────────────────────────────────

  function submitCustomInterest() {
    const val = customInput.trim().toLowerCase()
    if (!val) { cancelCustomInterest(); return }

    // Dedup against built-ins and existing custom interests (case-insensitive)
    const existing = [
      ...INTEREST_OPTIONS.map((s) => s.toLowerCase()),
      ...(prefs.customInterests ?? []).map((s) => s.toLowerCase()),
    ]
    if (existing.includes(val)) { cancelCustomInterest(); return }
    if ((prefs.customInterests ?? []).length >= 8) { cancelCustomInterest(); return }

    update({ customInterests: [...(prefs.customInterests ?? []), val] })
    setCustomInput('')
    setIsAddingCustom(false)
  }

  function cancelCustomInterest() {
    setCustomInput('')
    setIsAddingCustom(false)
  }

  function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCustomInterest()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation() // prevent the panel-level Escape from also closing the panel
      cancelCustomInterest()
    }
  }

  // ── Overlay & keyboard handlers ─────────────────────────────────────────────

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── Render ──────────────────────────────────────────────────────────────────

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
                  aria-label="Close preferences"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto max-h-[70vh] p-5 space-y-6">

              {/* ── Planning style ─────────────────────────────────────────────── */}
              <Section title="Planning style">

                {/* Budget slider + exact budget override */}
                <div className="mb-4">
                  {/* Slider — de-emphasised when an exact budget is active */}
                  <div className={cn(
                    'transition-opacity duration-200',
                    hasExactBudget && 'opacity-40 pointer-events-none select-none',
                  )}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-[#888]">Budget</span>
                      <span className="text-[12px] font-semibold text-[#f0f0f0]">
                        {getBudgetLabel(prefs.budgetLevel)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0} max={100} step={5}
                      value={prefs.budgetLevel}
                      onChange={(e) => update({ budgetLevel: Number(e.target.value) })}
                      className="w-full cursor-pointer"
                      style={{ accentColor: '#ffffff', height: '3px' }}
                    />
                    <div className="flex justify-between mt-0.5">
                      <span className="text-[10px] text-[#333]">Shoestring</span>
                      <span className="text-[10px] text-[#333]">Luxury</span>
                    </div>
                  </div>

                  {/* Exact budget row */}
                  <div className="mt-3">
                    <p className="text-[10px] text-[#444] mb-1.5">Exact budget (optional)</p>
                    <div className="flex items-center gap-2 flex-wrap">

                      {/* Amount input */}
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amountStr}
                        onChange={handleAmountChange}
                        placeholder="e.g. 4,500"
                        className={cn(
                          'w-[100px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg',
                          'px-2.5 py-1.5 text-[12px] text-[#f0f0f0] placeholder:text-[#333]',
                          'focus:outline-none focus:border-[#444] transition-colors',
                        )}
                      />

                      {/* Currency selector */}
                      <div className="relative">
                        <select
                          value={currency}
                          onChange={(e) => {
                            const next = e.target.value
                            setCurrency(next)
                            if (activeTripId) {
                              // One source of truth: this currency IS the trip's
                              // display currency. Convert cap + exact amount via store.
                              setTripDisplayCurrency(activeTripId, next)
                              const fresh = useStore.getState().trips[activeTripId]?.preferences.exactBudget
                              if (fresh?.amount) setAmountStr(fresh.amount.toLocaleString('en'))
                            } else {
                              commitExactBudget(amountStr, next, perPerson)
                            }
                          }}
                          className={cn(
                            'appearance-none bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg',
                            'pl-2.5 pr-7 py-1.5 text-[12px] text-[#f0f0f0]',
                            'focus:outline-none focus:border-[#444] cursor-pointer transition-colors',
                          )}
                        >
                          {CURRENCIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <ChevronDown
                          size={10}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none"
                        />
                      </div>

                      {/* Total / Per person toggle */}
                      <div className="flex rounded-lg border border-[#2a2a2a] overflow-hidden">
                        <button
                          type="button"
                          onClick={() => { setPerPerson(false); commitExactBudget(amountStr, currency, false) }}
                          className={cn(
                            'px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                            !perPerson ? 'bg-[#2a2a2a] text-[#f0f0f0]' : 'text-[#555] hover:text-[#888]',
                          )}
                        >
                          Total
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPerPerson(true); commitExactBudget(amountStr, currency, true) }}
                          className={cn(
                            'px-2.5 py-1.5 text-[11px] font-medium transition-colors border-l border-[#2a2a2a]',
                            perPerson ? 'bg-[#2a2a2a] text-[#f0f0f0]' : 'text-[#555] hover:text-[#888]',
                          )}
                        >
                          Per person
                        </button>
                      </div>
                    </div>

                    {/* Mode caption */}
                    {hasExactBudget ? (
                      <p className="text-[10px] text-[#555] mt-1.5">
                        Using exact budget — slider is for reference only
                      </p>
                    ) : (
                      <p className="text-[10px] text-[#333] mt-1.5">
                        Leave blank to use the slider above
                      </p>
                    )}
                  </div>

                  {/* Show local prices toggle */}
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#888]">Show local prices</p>
                      <p className="text-[10px] text-[#444] leading-snug">
                        Display each item&apos;s original currency under the converted price
                      </p>
                    </div>
                    <Toggle
                      checked={prefs.showLocalPrices !== false}
                      onChange={(v) => update({ showLocalPrices: v })}
                    />
                  </div>
                </div>

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

                {/* Flying from — origin city/airport for live flight prices */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] font-medium text-[#888]">Flying from</span>
                    <span className="text-[10px] text-[#444]">for live flight prices</span>
                  </div>
                  <input
                    type="text"
                    value={prefs.flyingFrom ?? ''}
                    onChange={(e) => update({ flyingFrom: e.target.value })}
                    placeholder="e.g. Singapore or SIN"
                    className={cn(
                      'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-lg px-3 py-2',
                      'text-[12px] text-[#f0f0f0] placeholder:text-[#333]',
                      'focus:outline-none focus:border-[#444] transition-colors',
                    )}
                  />
                </div>
              </Section>

              {/* ── Interests ──────────────────────────────────────────────────── */}
              <Section title="Interests">
                <div className="flex flex-wrap gap-2">

                  {/* Built-in interest chips */}
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
                            : 'bg-transparent text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]',
                        )}
                      >
                        {interest}
                      </button>
                    )
                  })}

                  {/* Custom interest chips — always selected; click × to remove */}
                  {(prefs.customInterests ?? []).map((interest) => (
                    <button
                      key={`custom-${interest}`}
                      onClick={() =>
                        update({
                          customInterests: (prefs.customInterests ?? []).filter((i) => i !== interest),
                        })
                      }
                      title={`Remove "${interest}"`}
                      aria-label={`Remove interest ${interest}`}
                      className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border bg-white text-black border-white transition-all"
                    >
                      <span>{interest}</span>
                      <X
                        size={10}
                        className="opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
                      />
                    </button>
                  ))}

                  {/* Inline "Add custom interest" input or trigger chip */}
                  {isAddingCustom ? (
                    <input
                      ref={customInputRef}
                      type="text"
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value.slice(0, 20))}
                      onKeyDown={handleCustomKeyDown}
                      onBlur={cancelCustomInterest}
                      placeholder="e.g. onsen"
                      className={cn(
                        'px-3 py-1.5 rounded-full text-[12px] text-[#f0f0f0]',
                        'border border-[#444] bg-[#1a1a1a] focus:outline-none',
                        'w-[120px] placeholder:text-[#444]',
                      )}
                    />
                  ) : (
                    // Only show the "+ Add" chip if we're under the 8-custom limit
                    (prefs.customInterests ?? []).length < 8 && (
                      <button
                        onClick={() => setIsAddingCustom(true)}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all',
                          'border-dashed border-[#2a2a2a] text-[#444] hover:border-[#555] hover:text-[#666]',
                        )}
                      >
                        + Add
                      </button>
                    )
                  )}
                </div>
              </Section>

              {/* ── Party ────────────────────────────────────────────────────────── */}
              <Section title="Party">
                <div className="flex items-center gap-4">
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
                  {(['solo', 'couple', 'family', 'friends'] as PartyType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => update({ partyType: t })}
                      className={cn(
                        'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all capitalize',
                        (prefs.partyType ?? 'couple') === t
                          ? 'bg-white text-black border-white'
                          : 'text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]',
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Section>

              {/* ── Dining & Accommodation ───────────────────────────────────────── */}
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
                            : 'text-[#666] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]',
                        )}
                      >
                        {a === 'mid-range' ? 'Mid-range hotel' : a}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              {/* ── Mobility ─────────────────────────────────────────────────────── */}
              <Section title="Mobility">
                {(['full', 'limited'] as MobilityType[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => update({ mobility: m })}
                    className={cn(
                      'w-full flex items-start gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left mb-2 last:mb-0',
                      (prefs.mobility ?? 'full') === m
                        ? 'bg-white/5 border-white/30 text-[#f0f0f0]'
                        : 'border-[#2a2a2a] text-[#666] hover:border-[#444] hover:text-[#888]',
                    )}
                  >
                    <span className="text-[13px] font-medium capitalize leading-tight">
                      {m === 'full' ? 'Lots of walking OK' : 'Minimise walking'}
                    </span>
                  </button>
                ))}
              </Section>

              {/* ── Must avoid ───────────────────────────────────────────────────── */}
              <Section title="Must avoid">
                <textarea
                  value={prefs.mustAvoid ?? ''}
                  onChange={(e) => update({ mustAvoid: e.target.value })}
                  placeholder="e.g. theme parks, very touristy restaurants, stairs…"
                  rows={2}
                  className={cn(
                    'w-full bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-3.5 py-2.5',
                    'text-[12px] text-[#f0f0f0] placeholder:text-[#333] leading-relaxed resize-none',
                    'focus:outline-none focus:border-[#444] transition-colors',
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

// ─── Toggle ──────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-white' : 'bg-[#2a2a2a]',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full transition-transform',
          checked ? 'translate-x-[18px] bg-black' : 'translate-x-[3px] bg-[#666]',
        )}
      />
    </button>
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
