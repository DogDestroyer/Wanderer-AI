'use client'

// ─── DayQuickMenu ─────────────────────────────────────────────────────────────
// The ⋯ menu on each day card: four canned instructions dispatched through the
// EXISTING chat/partial-regeneration pipeline (wandr:send-message → ChatBridge →
// sendMessage, 'quick' tier) — exactly as if the user typed them, including the
// message appearing in chat history. No new agent pathways: locked cards, undo
// capture ("AI updated Day N"), toasts, validation and retry all apply for free.

import { useState } from 'react'
import {
  useFloating, autoUpdate, offset, flip, shift,
  useClick, useDismiss, useRole, useInteractions, FloatingPortal,
} from '@floating-ui/react'
import { MoreHorizontal, RefreshCw, PiggyBank, Armchair, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { showToast } from '@/components/ui/Toast'

interface Props {
  tripId: string
  dayId: string
  dayNumber: number  // 1-based, for human-readable instructions
  disabled?: boolean // during a full build or while this day is processing
}

// The canned instructions. Explicit day id + replace_day_activities keeps the
// agent scoped; locked-card rules are already in the system prompt + backstop.
function instructions(n: number, dayId: string) {
  const scope = `Only modify day ${n} (id ${dayId}) using replace_day_activities — never touch any other day, and keep locked activities exactly as they are.`
  return [
    { icon: RefreshCw, label: 'Regenerate this day', message: `Regenerate day ${n} with different activities — same style and budget. ${scope}` },
    { icon: PiggyBank, label: 'Make it cheaper', message: `Make day ${n} cheaper — swap pricey activities for budget-friendly alternatives with similar appeal. ${scope}` },
    { icon: Armchair, label: 'Make it more relaxed', message: `Make day ${n} more relaxed — fewer activities, longer gaps, more downtime. ${scope}` },
    { icon: Sparkles, label: 'Add a suggestion', message: `Add exactly ONE extra activity to day ${n} that fits its free gaps and my interests — keep every existing activity unchanged. ${scope}` },
  ]
}

export function DayQuickMenu({ tripId, dayId, dayNumber, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const setQuickActionDayId = useStore((s) => s.setQuickActionDayId)

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(context)
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true })
  const role = useRole(context, { role: 'menu' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  function run(message: string, label: string) {
    setOpen(false)
    setQuickActionDayId(dayId)
    void tripId // scoping lives in the message; the pipeline resolves the active trip
    document.dispatchEvent(new CustomEvent('wandr:send-message', { detail: { message, intent: 'quick' } }))
    showToast({ message: `${label} — Day ${dayNumber}…`, type: 'info' })
  }

  return (
    <>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        disabled={disabled}
        aria-label={`Day ${dayNumber} actions`}
        data-testid="day-quick-menu"
        className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center transition-colors',
          disabled
            ? 'text-[#2a2a2a] cursor-not-allowed'
            : open
              ? 'bg-white text-black'
              : 'text-[#555] hover:text-[#f0f0f0] hover:bg-[#1f1f1f]',
        )}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && !disabled && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[100] w-[210px] rounded-xl border border-[#2a2a2a] bg-[#111111] p-1 shadow-2xl shadow-black/60"
          >
            {instructions(dayNumber, dayId).map(({ icon: Icon, label, message }) => (
              <button
                key={label}
                role="menuitem"
                onClick={() => run(message, label)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[12px] text-[#ccc] hover:bg-[#1a1a1a] hover:text-white transition-colors"
              >
                <Icon size={13} className="text-[#555] shrink-0" />
                {label}
              </button>
            ))}
          </div>
        </FloatingPortal>
      )}
    </>
  )
}
