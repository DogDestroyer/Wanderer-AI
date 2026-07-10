'use client'

// ─── Shared wizard atoms ──────────────────────────────────────────────────────
// Small building blocks reused across steps, matching Hodo's black/white minimal
// language (white = selected, #111 surfaces, #2a2a2a borders).

import { useState, useRef, useEffect } from 'react'
import { X, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── NumberStepper ────────────────────────────────────────────────────────────
// Large centred number adjusted ONLY via − / + steppers (no manual text entry).
// The value always exists (steps that use it seed a sensible default), and the
// steppers disable at the bounds.

export function NumberStepper({
  value, onChange, min, max, unit,
}: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  unit?: string
}) {
  const atMin = value <= min
  const atMax = value >= max
  const dec = () => { if (!atMin) onChange(value - 1) }
  const inc = () => { if (!atMax) onChange(value + 1) }

  return (
    <div className="flex items-center justify-center gap-6">
      <StepperButton ariaLabel="Decrease" disabled={atMin} onClick={dec}><Minus size={18} /></StepperButton>

      <div className="flex flex-col items-center min-w-[120px]">
        <span
          key={value}
          data-testid="stepper-value"
          className="wizard-pop text-[68px] leading-none font-semibold text-white tabular-nums select-none"
          aria-live="polite"
        >
          {value}
        </span>
        {unit && <span className="text-[13px] text-[#555] mt-2">{unit}</span>}
      </div>

      <StepperButton ariaLabel="Increase" disabled={atMax} onClick={inc}><Plus size={18} /></StepperButton>
    </div>
  )
}

function StepperButton({ children, onClick, disabled, ariaLabel }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; ariaLabel: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'w-12 h-12 rounded-full border flex items-center justify-center transition-colors',
        disabled
          ? 'border-[#1f1f1f] text-[#2a2a2a] cursor-not-allowed'
          : 'border-[#2a2a2a] text-[#888] hover:text-white hover:border-[#555]',
      )}
    >
      {children}
    </button>
  )
}

// ─── PillButton ───────────────────────────────────────────────────────────────

export function PillButton({
  label, selected, onClick, prefix,
}: { label: string; selected: boolean; onClick: () => void; prefix?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'px-4 py-2 rounded-full text-[13px] font-medium border transition-all',
        selected
          ? 'bg-white text-black border-white'
          : 'bg-[#111111] text-[#888] border-[#2a2a2a] hover:border-[#444] hover:text-[#f0f0f0]',
      )}
    >
      {prefix && <span className="mr-1.5">{prefix}</span>}
      {label}
    </button>
  )
}

// ─── SelectableCard (grid, e.g. cities) ───────────────────────────────────────

export function SelectableCard({
  title, subtitle, selected, onClick,
}: { title: string; subtitle?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start text-left px-3.5 py-3 rounded-xl border transition-all min-w-0',
        selected
          ? 'bg-white text-black border-white'
          : 'bg-[#111111] text-[#f0f0f0] border-[#2a2a2a] hover:border-[#444]',
      )}
    >
      <span className="text-[13px] font-semibold truncate w-full">{title}</span>
      {subtitle && (
        <span className={cn('text-[11px] truncate w-full mt-0.5', selected ? 'text-[#444]' : 'text-[#555]')}>{subtitle}</span>
      )}
    </button>
  )
}

// ─── TokenSearch ──────────────────────────────────────────────────────────────
// A search box with selected items as chips + a live suggestion dropdown.
// Generic over an item shape via key/label accessors.

export interface TokenItem { key: string; label: string; prefix?: string }

export function TokenSearch({
  placeholder, selected, suggestions, onQuery, onAdd, onRemove,
}: {
  placeholder: string
  selected: TokenItem[]
  suggestions: TokenItem[]
  onQuery: (q: string) => void
  onAdd: (item: TokenItem) => void
  onRemove: (key: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedKeys = new Set(selected.map((s) => s.key))
  const visible = suggestions.filter((s) => !selectedKeys.has(s.key))

  useEffect(() => { onQuery(query) }, [query, onQuery])

  function add(item: TokenItem) {
    onAdd(item)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative w-full">
      <div
        className="flex flex-wrap items-center gap-1.5 w-full min-h-[56px] rounded-2xl border border-[#2a2a2a] bg-[#111111] px-3 py-2.5 focus-within:border-[#555] transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white text-black text-[13px] font-medium">
            {s.prefix && <span>{s.prefix}</span>}
            {s.label}
            <button onClick={(e) => { e.stopPropagation(); onRemove(s.key) }} aria-label={`Remove ${s.label}`} className="opacity-60 hover:opacity-100">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && query === '' && selected.length) {
              onRemove(selected[selected.length - 1].key)
            } else if (e.key === 'Enter' && visible.length) {
              e.preventDefault()
              e.stopPropagation()
              add(visible[0])
            }
          }}
          placeholder={selected.length ? '' : placeholder}
          className="flex-1 min-w-[120px] bg-transparent text-[15px] text-[#f0f0f0] placeholder:text-[#444] focus:outline-none py-1"
        />
      </div>

      {open && query.trim() !== '' && visible.length > 0 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-[240px] overflow-y-auto rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] shadow-2xl shadow-black/60 py-1">
          {visible.map((item) => (
            <button
              key={item.key}
              onClick={() => add(item)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-[#ccc] hover:bg-[#1a1a1a] hover:text-white transition-colors"
            >
              {item.prefix && <span className="text-[15px]">{item.prefix}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
