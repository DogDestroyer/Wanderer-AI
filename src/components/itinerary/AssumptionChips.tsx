'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import {
  useFloating, autoUpdate, offset, flip, shift, size,
  useClick, useDismiss, useRole, useInteractions, FloatingPortal,
} from '@floating-ui/react'
import { useStore } from '@/lib/store'
import type { TripPlan, TripAssumption, PartyType, ExactBudget } from '@/lib/types'
import { cn, getBudgetLabel, getPaceLabel, getTripStyleLabel } from '@/lib/utils'
import { showToast } from '@/components/ui/Toast'

interface Props {
  trip: TripPlan
}

// ─── AssumptionChips ──────────────────────────────────────────────────────────
// A scrollable row of chips showing the key parameters used when the plan was
// generated.  Chips with source === 'inferred' get a dotted underline so users
// can immediately spot the AI's guesses.  Tapping a chip opens a small inline
// editor; confirming triggers a partial re-plan.

export function AssumptionChips({ trip }: Props) {
  const assumptions = trip.assumptions
  // Track which chip's editor is open — enforces "only one open at a time".
  const [openField, setOpenField] = useState<string | null>(null)
  if (!assumptions?.length) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-[#333] font-medium shrink-0 mr-0.5">Planned for:</span>
      {assumptions.map((a) => (
        <AssumptionChip
          key={a.field}
          assumption={a}
          trip={trip}
          open={openField === a.field}
          onOpenChange={(o) => setOpenField(o ? a.field : null)}
        />
      ))}
    </div>
  )
}

// ─── AssumptionChip ───────────────────────────────────────────────────────────

function AssumptionChip({
  assumption, trip, open, onOpenChange,
}: {
  assumption: TripAssumption
  trip: TripPlan
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Floating UI handles anchoring + collision (flip above when no room below,
  // shift to stay in the viewport) and portals the popover to the document root.
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange,
    placement: 'bottom-start',
    middleware: [
      offset(8),
      flip({ padding: 8, fallbackAxisSideDirection: 'end' }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          // Cap height on short viewports; the popover scrolls internally.
          elements.floating.style.maxHeight = `${Math.max(220, availableHeight)}px`
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  const isInferred = assumption.source === 'inferred'

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        title={assumption.value}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] transition-colors max-w-[360px]',
          open
            ? 'bg-white text-black border-white'
            : 'bg-[#111111] border-[#1f1f1f] text-[#888] hover:border-[#333] hover:text-[#f0f0f0]',
        )}
      >
        <span className={cn('mr-0.5 shrink-0', open ? 'text-[#666]' : 'text-[#444]')}>{assumption.label}:</span>
        {/* min-w-0 lets the value truncate with an ellipsis inside the flex row */}
        <span
          className={cn(
            'truncate min-w-0',
            isInferred && 'underline decoration-dotted decoration-[#444] underline-offset-2',
          )}
        >
          {assumption.value}
        </span>
      </button>

      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[100] w-[300px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-[#2a2a2a] bg-[#111111] p-3 shadow-2xl shadow-black/60"
          >
            <ChipEditor assumption={assumption} trip={trip} onClose={() => onOpenChange(false)} />
          </div>
        </FloatingPortal>
      )}
    </>
  )
}

// ─── ChipEditor ───────────────────────────────────────────────────────────────

function ChipEditor({
  assumption,
  trip,
  onClose,
}: {
  assumption: TripAssumption
  trip: TripPlan
  onClose: () => void
}) {
  const updateTrip = useStore((s) => s.updateTrip)

  function applyChange(newValue: string, prefsPatch: Partial<TripPlan['preferences']>, tripPatch?: Partial<TripPlan>) {
    // Update the assumption source and value
    const newAssumptions = trip.assumptions?.map((a) =>
      a.field === assumption.field
        ? { ...a, value: newValue, source: 'message' as const }
        : a
    )

    // Apply preferences update + assumption update atomically
    updateTrip(trip.id, {
      ...(tripPatch ?? {}),
      ...(prefsPatch && Object.keys(prefsPatch).length > 0
        ? { preferences: { ...trip.preferences, ...prefsPatch } }
        : {}),
      assumptions: newAssumptions,
    })

    // Trigger partial re-plan via the chat channel
    const correctionMsg = `The user corrected ${assumption.label} from "${assumption.value}" to "${newValue}". Please update the plan using replace_day_activities — keep locked activities and everything unaffected exactly as they are, and only adjust what's relevant to this change.`
    // 'quick' tier — a localized assumption correction, not a full re-plan.
    document.dispatchEvent(new CustomEvent('wandr:send-message', { detail: { message: correctionMsg, intent: 'quick' } }))
    showToast({ message: `Updating plan for new ${assumption.label.toLowerCase()}…`, type: 'info' })
    onClose()
  }

  const commonProps = { assumption, trip, onApply: applyChange, onCancel: onClose }

  const editorContent = (() => {
    switch (assumption.field) {
      case 'partyType': return <PartyTypeEditor {...commonProps} />
      case 'pace':      return <SliderEditor {...commonProps} field="paceLevel" min={0} max={100} step={5} labelFn={getPaceLabel} leftHint="Relaxed" rightHint="Packed" />
      case 'budget':    return <BudgetEditor {...commonProps} />
      case 'tripStyle': return <SliderEditor {...commonProps} field="tripStyle" min={0} max={100} step={5} labelFn={getTripStyleLabel} leftHint="Nature" rightHint="City" />
      case 'dates':     return <DatesEditor {...commonProps} />
      default:          return <TextEditor {...commonProps} />
    }
  })()

  return (
    <div>
      {/* Full current value (chips truncate; the editor shows it in full) */}
      <div className="mb-2.5 pb-2.5 border-b border-[#1f1f1f]">
        <p className="text-[9px] font-semibold text-[#444] uppercase tracking-wide">{assumption.label}</p>
        <p className="text-[11px] text-[#aaa] leading-snug mt-0.5">{assumption.value}</p>
      </div>
      {editorContent}
    </div>
  )
}

// ─── Editor types ─────────────────────────────────────────────────────────────

type EditorProps = {
  assumption: TripAssumption
  trip: TripPlan
  onApply: (newValue: string, prefsPatch: Partial<TripPlan['preferences']>, tripPatch?: Partial<TripPlan>) => void
  onCancel: () => void
}

function PartyTypeEditor({ assumption, onApply, onCancel }: EditorProps) {
  const OPTIONS: { value: PartyType; label: string }[] = [
    { value: 'solo',    label: 'Solo'    },
    { value: 'couple',  label: 'Couple'  },
    { value: 'family',  label: 'Family'  },
    { value: 'friends', label: 'Friends' },
  ]
  const [selected, setSelected] = useState<PartyType>(
    (assumption.value.toLowerCase() as PartyType) in { solo:1, couple:1, family:1, friends:1 }
      ? assumption.value.toLowerCase() as PartyType
      : 'couple'
  )
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-2">Party type</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={cn(
              'px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors',
              selected === value
                ? 'bg-white text-black border-white'
                : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:border-[#444] hover:text-[#f0f0f0]'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <EditorActions
        onApply={() => onApply(
          selected.charAt(0).toUpperCase() + selected.slice(1),
          { partyType: selected },
        )}
        onCancel={onCancel}
      />
    </div>
  )
}

function SliderEditor({
  assumption, onApply, onCancel, field, min, max, step, labelFn, leftHint, rightHint,
}: EditorProps & {
  field: string
  min: number
  max: number
  step: number
  labelFn: (v: number) => string
  leftHint: string
  rightHint: string
}) {
  const currentNumeric = (() => {
    // Reverse-map the current label to a numeric value by scanning
    for (let v = min; v <= max; v += step) {
      if (labelFn(v) === assumption.value) return v
    }
    return 50
  })()
  const [value, setValue] = useState(currentNumeric)
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wide">{assumption.label}</span>
        <span className="text-[11px] font-semibold text-[#f0f0f0] tabular-nums">{labelFn(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-full cursor-pointer mb-0.5"
        style={{ accentColor: '#ffffff', height: '2px' }}
      />
      <div className="flex justify-between mb-3">
        <span className="text-[10px] text-[#333]">{leftHint}</span>
        <span className="text-[10px] text-[#333]">{rightHint}</span>
      </div>
      <EditorActions
        onApply={() => onApply(labelFn(value), { [field]: value } as Partial<TripPlan['preferences']>)}
        onCancel={onCancel}
      />
    </div>
  )
}

function BudgetEditor({ assumption, trip, onApply, onCancel }: EditorProps) {
  const CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'THB', 'INR', 'CAD', 'NZD']

  // Reverse-map current label to a numeric budget level
  const currentLevel = (() => {
    for (let v = 0; v <= 100; v += 5) {
      if (getBudgetLabel(v) === assumption.value) return v
    }
    return trip.preferences.budgetLevel ?? 50
  })()

  const [budgetLevel, setBudgetLevel] = useState(currentLevel)

  // Exact budget — pre-fill from trip.preferences.exactBudget if present
  const existing = trip.preferences.exactBudget
  const [amount, setAmount] = useState<string>(existing?.amount ? String(existing.amount) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? 'SGD')
  const [perPerson, setPerPerson] = useState(existing?.perPerson ?? false)

  function handleApply() {
    const num = Number(amount.replace(/[^0-9.]/g, ''))
    const hasExact = amount.trim() !== '' && num > 0

    if (hasExact) {
      const exactBudget: ExactBudget = { amount: num, currency, perPerson }
      const displayVal = `${currency} ${num.toLocaleString()} ${perPerson ? 'p/p' : 'total'}`
      onApply(displayVal, { budgetLevel, exactBudget })
    } else {
      // No exact amount — update level and clear any existing exact cap
      onApply(getBudgetLabel(budgetLevel), { budgetLevel, exactBudget: null })
    }
  }

  return (
    <div>
      {/* Budget style slider */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold text-[#555] uppercase tracking-wide">Budget style</span>
        <span className="text-[11px] font-semibold text-[#f0f0f0] tabular-nums">{getBudgetLabel(budgetLevel)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={budgetLevel}
        onChange={(e) => setBudgetLevel(Number(e.target.value))}
        className="w-full cursor-pointer mb-0.5"
        style={{ accentColor: '#ffffff', height: '2px' }}
      />
      <div className="flex justify-between mb-3">
        <span className="text-[10px] text-[#333]">Shoestring</span>
        <span className="text-[10px] text-[#333]">Luxury</span>
      </div>

      {/* Exact amount — optional hard cap */}
      <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-1.5">Exact cap (optional)</p>
      <div className="flex gap-1.5 mb-2">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className={cn(
            'bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-1.5 py-1.5',
            'text-[11px] text-[#f0f0f0] focus:outline-none focus:border-[#444]',
            '[color-scheme:dark]',
          )}
        >
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="text"
          inputMode="numeric"
          placeholder="e.g. 4500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={cn(
            'flex-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5',
            'text-[11px] text-[#f0f0f0] focus:outline-none focus:border-[#444]',
          )}
        />
      </div>

      {/* Total / Per person toggle */}
      <div className="flex gap-1 mb-3">
        {([false, true] as const).map((pp) => (
          <button
            key={String(pp)}
            onClick={() => setPerPerson(pp)}
            className={cn(
              'flex-1 py-1 rounded-lg text-[11px] font-medium border transition-colors',
              perPerson === pp
                ? 'bg-white text-black border-white'
                : 'bg-[#1a1a1a] border-[#2a2a2a] text-[#888] hover:border-[#444] hover:text-[#f0f0f0]',
            )}
          >
            {pp ? 'Per person' : 'Total'}
          </button>
        ))}
      </div>

      <EditorActions onApply={handleApply} onCancel={onCancel} />
    </div>
  )
}

function DatesEditor({ assumption, trip, onApply, onCancel }: EditorProps) {
  const [startDate, setStartDate] = useState(trip.startDate)
  const [endDate,   setEndDate]   = useState(trip.endDate)
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-2">Dates</p>
      <div className="space-y-1.5 mb-3">
        <div>
          <label className="text-[10px] text-[#444] block mb-0.5">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={cn(
              'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5',
              'text-[11px] text-[#f0f0f0] focus:outline-none focus:border-[#444]',
              '[color-scheme:dark]',
            )}
          />
        </div>
        <div>
          <label className="text-[10px] text-[#444] block mb-0.5">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={cn(
              'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5',
              'text-[11px] text-[#f0f0f0] focus:outline-none focus:border-[#444]',
              '[color-scheme:dark]',
            )}
          />
        </div>
      </div>
      <EditorActions
        onApply={() => {
          const displayVal = `${startDate} – ${endDate}`
          onApply(displayVal, {}, { startDate, endDate })
        }}
        onCancel={onCancel}
      />
    </div>
  )
}

function TextEditor({ assumption, onApply, onCancel }: EditorProps) {
  const [value, setValue] = useState(assumption.value)
  return (
    <div>
      <p className="text-[10px] font-semibold text-[#555] uppercase tracking-wide mb-2">{assumption.label}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        className={cn(
          'w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg px-2 py-1.5 mb-3',
          'text-[11px] text-[#f0f0f0] focus:outline-none focus:border-[#444]',
        )}
      />
      <EditorActions onApply={() => onApply(value, {})} onCancel={onCancel} />
    </div>
  )
}

// ─── EditorActions ────────────────────────────────────────────────────────────

function EditorActions({ onApply, onCancel }: { onApply: () => void; onCancel: () => void }) {
  return (
    <div className="flex gap-1.5">
      <button
        onClick={onApply}
        className={cn(
          'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold',
          'bg-white text-black hover:bg-[#e8e8e8] active:bg-[#d0d0d0] transition-colors',
        )}
      >
        <Check size={11} />
        Apply
      </button>
      <button
        onClick={onCancel}
        className={cn(
          'flex items-center justify-center w-8 rounded-lg border border-[#2a2a2a]',
          'text-[#555] hover:text-[#f0f0f0] hover:border-[#444] transition-colors',
        )}
      >
        <X size={11} />
      </button>
    </div>
  )
}
