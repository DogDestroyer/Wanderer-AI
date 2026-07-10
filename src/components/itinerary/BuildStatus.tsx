'use client'

// ─── Shared live-build UI ─────────────────────────────────────────────────────
// A status line driven by REAL pipeline state (statusLine + heartbeat-updated
// timestamps) and a shimmer day-block. Used by both the Phase-1 scaffold and the
// in-progress trip view so the construction reads consistently.

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { BuildState } from '@/lib/store'
import { cn } from '@/lib/utils'

// ── Typewriter ── types `text` in; renders the remainder invisibly so there's
// no reflow (transform/opacity only). Collapses to full text under reduced motion.
export function Typewriter({ text, cps = 33 }: { text: string; cps?: number }) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (reduce || !text) { setN(text.length); return }
    setN(0)
    let i = 0
    const id = setInterval(() => { i++; setN(i); if (i >= text.length) clearInterval(id) }, Math.max(12, 1000 / cps))
    return () => clearInterval(id)
  }, [text, cps, reduce])
  return <>{text.slice(0, n)}{n < text.length && <span aria-hidden className="opacity-0">{text.slice(n)}</span>}</>
}

// ── CountUp ── eases the displayed number toward `value` when it changes.
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion()
  const [disp, setDisp] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (reduce || from === to) { fromRef.current = to; setDisp(to); return }
    const start = performance.now()
    const dur = 500
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setDisp(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, reduce])
  return <>{format(disp)}</>
}

export function BuildStatusLine({ build }: { build: BuildState }) {
  const [elapsed, setElapsed] = useState(0)
  const complete = build.phase === 'complete'

  useEffect(() => {
    if (complete || !build.startedAt) return
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - build.startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [complete, build.startedAt])

  // Honest waiting: if no heartbeat/batch for a while, say so rather than fake progress.
  const stalled = !complete && build.lastEventAt > 0 && Date.now() - build.lastEventAt > 14_000

  return (
    <div
      data-testid="build-status"
      data-phase={build.phase}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12px]',
        complete ? 'bg-[#0c1a12] border-[#1f4030] text-[#5fd39a]' : 'bg-[#0d0d0d] border-[#1f1f1f] text-[#888]',
      )}
    >
      {complete ? (
        <Check size={13} className="text-[#3eb87a] shrink-0" />
      ) : (
        <span className="build-pulse w-1.5 h-1.5 rounded-full bg-[#3eb87a] shrink-0" />
      )}
      <span className="font-medium truncate">{stalled ? 'Still working — waiting on the model…' : build.statusLine}</span>
      {!complete && <span className="ml-auto text-[11px] text-[#444] tabular-nums shrink-0">{elapsed}s</span>}
    </div>
  )
}

// A day block placeholder shown before its activities land.
export function DayShimmer({ index, date }: { index: number; date?: string }) {
  const dateStr = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''
  return (
    <div className="bg-[#111111] rounded-xl border border-[#1f1f1f] overflow-hidden" data-testid="day-shimmer">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1f1f1f]">
        <div className="w-7 h-7 rounded-lg bg-[#1f1f1f] flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-[#888]">{index + 1}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="build-shimmer h-3 rounded w-1/2 mb-1.5" />
          <p className="text-[11px] text-[#444]">{dateStr}</p>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="build-shimmer h-8 w-14 rounded-md shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="build-shimmer h-2.5 rounded" style={{ width: `${70 - i * 12}%` }} />
              <div className="build-shimmer h-2 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
