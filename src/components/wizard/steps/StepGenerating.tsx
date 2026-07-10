'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

// STEP 9 · GENERATION PAGE
// Full-screen loading built on the EXISTING chunked generation: day-block
// skeletons appear as the skeleton lands, then each block populates as its batch
// completes. On completion we hand off to the standard trip view (closeWizard);
// incomplete/interrupted states stay explicit (completion contract).

export function StepGenerating({ onRetry, onEditBack }: { onRetry: () => void; onEditBack: () => void }) {
  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const isGenerating = useStore((s) => s.isGenerating)
  const closeWizard  = useStore((s) => s.closeWizard)
  const trip = activeTripId ? trips[activeTripId] : null

  const [elapsed, setElapsed] = useState(0)
  const [interrupted, setInterrupted] = useState(false)

  // Elapsed timer (drives a calm heartbeat indicator).
  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])

  // Completion handoff. We do NOT rely on catching the isGenerating true→false
  // transition (a fast-failing generation can finish before this mounts). While
  // generating → show progress. Once idle: a trip with days → hand off to the
  // trip view; no trip after a short grace → explicit interrupted-retry.
  useEffect(() => {
    if (isGenerating) { setInterrupted(false); return }
    const t = activeTripId ? useStore.getState().trips[activeTripId] : null
    if (t && t.days.length > 0) {
      const id = setTimeout(() => closeWizard(), 650) // brief beat so the last block visibly fills
      return () => clearTimeout(id)
    }
    // Idle with no trip: generation either failed instantly or hasn't kicked off.
    // Give it a grace window, then surface the explicit interrupted state.
    const id = setTimeout(() => {
      const s = useStore.getState()
      const t2 = s.activeTripId ? s.trips[s.activeTripId] : null
      if (!s.isGenerating && (!t2 || t2.days.length === 0)) setInterrupted(true)
    }, 2500)
    return () => clearTimeout(id)
  }, [isGenerating, activeTripId, closeWizard])

  const total = trip?.days.length ?? 0
  const filled = trip ? trip.days.filter((d) => d.activities && d.activities.length > 0).length : 0

  if (interrupted) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 text-center">
        <div className="w-12 h-12 rounded-2xl bg-[#1a0e00] border border-[#5a3a00] flex items-center justify-center">
          <AlertTriangle size={20} className="text-[#f59e0b]" />
        </div>
        <div>
          <p className="text-[16px] font-semibold text-[#f0f0f0]">That didn&apos;t finish</p>
          <p className="text-[13px] text-[#666] mt-1.5 max-w-[320px] leading-relaxed">
            The plan was interrupted before it could build. Your answers are saved — try again.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={onRetry} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-black text-[13px] font-semibold hover:bg-[#e8e8e8] transition-colors">
            <RotateCw size={13} /> Try again
          </button>
          <button onClick={onEditBack} className="px-4 py-2.5 rounded-xl border border-[#2a2a2a] text-[#888] text-[13px] font-medium hover:text-[#f0f0f0] hover:border-[#444] transition-colors">
            Edit answers
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-6">
      <div className="flex items-center gap-2.5 text-[#888]">
        <span className="w-2 h-2 rounded-full bg-[#3eb87a] animate-pulse" />
        <p className="text-[14px] font-medium">
          {total === 0 ? 'Setting up your trip…' : filled >= total ? 'Finishing up…' : `Building your itinerary — ${filled} of ${total} days`}
        </p>
      </div>

      {/* Day blocks: shimmer until the skeleton lands, then fill as batches land */}
      <div className="w-full flex flex-col gap-2">
        {(total === 0 ? Array.from({ length: 5 }) : trip!.days).map((d, i) => {
          const day = total === 0 ? null : trip!.days[i]
          const isFilled = !!day && day.activities && day.activities.length > 0
          return (
            <div
              key={day?.id ?? i}
              className={cn(
                'rounded-xl border px-4 py-3 transition-all duration-500',
                isFilled ? 'border-[#2a2a2a] bg-[#111111]' : 'border-[#1a1a1a] bg-[#0d0d0d]',
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0', isFilled ? 'bg-white text-black' : 'bg-[#1a1a1a] text-[#444]')}>
                  {i + 1}
                </div>
                {isFilled ? (
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[#f0f0f0] truncate">{day!.dayTitle || `Day ${i + 1}`}</p>
                    <p className="text-[11px] text-[#555]">{day!.activities.length} activities planned</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-1.5">
                    <div className="h-2 rounded bg-[#1a1a1a] animate-pulse" style={{ width: `${60 + (i % 3) * 12}%` }} />
                    <div className="h-2 rounded bg-[#161616] animate-pulse w-1/3" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-[#444] tabular-nums">{elapsed}s · this can take a minute for longer trips</p>
    </div>
  )
}
