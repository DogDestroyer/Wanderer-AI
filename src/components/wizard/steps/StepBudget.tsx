'use client'

import { ChevronDown } from 'lucide-react'
import type { StepProps } from '../stepTypes'
import { cn, getBudgetLabel } from '@/lib/utils'
import { COMMON_CURRENCIES } from '@/lib/currency'

// STEP 6 · "What's your budget?"
// The Shoestring→Luxury slider AND an exact amount with currency + Total/Per-
// person toggle — the same precedence rule as the preferences panel (an exact
// amount overrides the slider). Writes to the wizard draft.

function formatAmount(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return ''
  const n = parseInt(digits, 10)
  return Number.isNaN(n) ? '' : n.toLocaleString('en')
}

export function StepBudget({ draft, update }: StepProps) {
  const hasExact = !!(draft.exactAmount && draft.exactAmount > 0)

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-7">
      {/* Slider — de-emphasised when an exact amount is set */}
      <div className={cn('transition-opacity', hasExact && 'opacity-40 pointer-events-none select-none')}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-[#888]">Budget style</span>
          <span className="text-[15px] font-semibold text-[#f0f0f0]">{getBudgetLabel(draft.budgetLevel)}</span>
        </div>
        <input
          type="range"
          min={0} max={100} step={5}
          value={draft.budgetLevel}
          onChange={(e) => update({ budgetLevel: Number(e.target.value) })}
          className="w-full cursor-pointer"
          style={{ accentColor: '#ffffff', height: '3px' }}
        />
        <div className="flex justify-between mt-1">
          <span className="text-[11px] text-[#444]">Shoestring</span>
          <span className="text-[11px] text-[#444]">Luxury</span>
        </div>
      </div>

      {/* Exact amount (optional) */}
      <div>
        <p className="text-[12px] text-[#666] mb-2">Exact budget (optional)</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            inputMode="numeric"
            value={draft.exactAmount ? draft.exactAmount.toLocaleString('en') : ''}
            onChange={(e) => {
              const formatted = formatAmount(e.target.value)
              const n = parseInt(formatted.replace(/,/g, ''), 10)
              update({ exactAmount: Number.isNaN(n) || n <= 0 ? null : n })
            }}
            placeholder="e.g. 4,500"
            className={cn(
              'w-[120px] bg-[#111111] border border-[#2a2a2a] rounded-xl px-3 py-2.5',
              'text-[15px] text-[#f0f0f0] placeholder:text-[#444]',
              'focus:outline-none focus:border-[#555] transition-colors',
            )}
          />

          <div className="relative">
            <select
              value={draft.currency}
              onChange={(e) => update({ currency: e.target.value })}
              className={cn(
                'appearance-none bg-[#111111] border border-[#2a2a2a] rounded-xl pl-3 pr-8 py-2.5',
                'text-[15px] text-[#f0f0f0] focus:outline-none focus:border-[#555] cursor-pointer',
                '[color-scheme:dark]',
              )}
            >
              {COMMON_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#555] pointer-events-none" />
          </div>

          <div className="flex rounded-xl border border-[#2a2a2a] overflow-hidden">
            <button
              type="button"
              onClick={() => update({ perPerson: false })}
              className={cn('px-3 py-2.5 text-[13px] font-medium transition-colors', !draft.perPerson ? 'bg-[#2a2a2a] text-[#f0f0f0]' : 'text-[#666] hover:text-[#999]')}
            >
              Total
            </button>
            <button
              type="button"
              onClick={() => update({ perPerson: true })}
              className={cn('px-3 py-2.5 text-[13px] font-medium border-l border-[#2a2a2a] transition-colors', draft.perPerson ? 'bg-[#2a2a2a] text-[#f0f0f0]' : 'text-[#666] hover:text-[#999]')}
            >
              Per person
            </button>
          </div>
        </div>
        <p className="text-[11px] text-[#444] mt-2">
          {hasExact ? 'Using your exact budget — the slider is for reference only.' : 'Leave blank to use the slider above.'}
        </p>
      </div>
    </div>
  )
}
