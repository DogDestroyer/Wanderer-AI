'use client'

// ─── CoachMarks ───────────────────────────────────────────────────────────────
// One-time, three-beat post-build guidance. Fires exactly once per user
// (persisted `guidanceSeen` flag), right after their FIRST trip finishes
// constructing. Three sequential floating hints — never a modal, no dimming,
// interaction is never blocked. Each mark advances on: any click, Escape,
// doing the action, or a 6s auto-advance. "Skip tips" on the first mark ends
// the whole sequence.

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { REVEAL_EASE } from '@/lib/revealTiming'

interface Mark {
  /** CSS selector for the anchor element. */
  target: string
  text: string
}

const MARKS: Mark[] = [
  { target: '[data-testid="day-card"] [data-coach="drag"]', text: 'Drag to reorder — everything recalculates.' },
  { target: '[data-testid="day-card"] [data-coach="lock"]', text: 'Lock anything the AI must not change.' },
  { target: '[data-coach="chat"]', text: 'Or just tell Hodo what to change.' },
]

const AUTO_ADVANCE_MS = 6000

export function CoachMarks({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const advance = () => setStep((s) => s + 1)
  const done = step >= MARKS.length

  useEffect(() => { if (done) onDone() }, [done, onDone])

  // Anchor to the current target: bring it into view, then measure. Re-measure
  // on resize/scroll so the hint tracks its element.
  useEffect(() => {
    if (done) return
    const el = document.querySelector(MARKS[step].target)
    if (!el) { advance(); return } // target missing (e.g. empty trip) → skip the beat
    el.scrollIntoView({ behavior: 'auto', block: 'center' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [step, done])

  // Dismissal: any click (doing the action counts), Escape ends everything,
  // 6s auto-advance. Clicks inside the bubble are handled by its own buttons.
  useEffect(() => {
    if (done) return
    const timer = setTimeout(advance, AUTO_ADVANCE_MS)
    function onPointer(e: PointerEvent) {
      if (bubbleRef.current?.contains(e.target as Node)) return
      advance()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); setStep(MARKS.length) }
    }
    // Capture phase so the same click still reaches the app (never blocks).
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', onPointer, true); document.removeEventListener('keydown', onKey) }
  }, [step, done])

  if (done || !rect) return null

  // Bubble beside the target, clamped to the viewport.
  const bubbleW = 250
  const left = Math.max(12, Math.min(window.innerWidth - bubbleW - 12, rect.left + rect.width / 2 - bubbleW / 2))
  const below = rect.bottom + 14 + 90 < window.innerHeight
  const top = below ? rect.bottom + 14 : Math.max(12, rect.top - 14 - 78)

  return (
    <div className="fixed inset-0 z-[105] pointer-events-none" data-testid="coach-mark" data-step={step}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.1 : 0.18 }}
        >
        {/* Gentle pulse ring on the target — pure indication, no dimming */}
        <span
          aria-hidden
          className="coach-pulse absolute rounded-xl border-2 border-white/70"
          style={{ left: rect.left - 5, top: rect.top - 5, width: rect.width + 10, height: rect.height + 10 }}
        />
        {/* Hint bubble */}
        <motion.div
          ref={bubbleRef}
          role="status"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.12 : 0.28, ease: REVEAL_EASE }}
          className="absolute pointer-events-auto bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-2xl shadow-black/70 px-3.5 py-3"
          style={{ left, top, width: bubbleW }}
        >
          <p className="text-[12px] text-[#e0e0e0] leading-snug">{MARKS[step].text}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-[#444] tabular-nums">{step + 1} / {MARKS.length}</span>
            {step === 0 ? (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setStep(MARKS.length)}
                className="text-[11px] text-[#666] hover:text-[#f0f0f0] underline underline-offset-2 transition-colors"
              >
                Skip tips
              </button>
            ) : (
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={advance}
                className="text-[11px] text-[#666] hover:text-[#f0f0f0] transition-colors"
              >
                {step === MARKS.length - 1 ? 'Done' : 'Next →'}
              </button>
            )}
          </div>
        </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
