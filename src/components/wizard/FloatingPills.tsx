'use client'

// ─── FloatingPills ────────────────────────────────────────────────────────────
// A gently drifting cloud of selectable pills (steps 1 & 7). The drift is a
// slow, tasteful CSS animation (see `wander-drift` in globals.css) with a
// per-pill duration/delay so the motion never syncs into chaos. Selected pills
// lock to solid white and stop drifting. Honours prefers-reduced-motion.

import { cn } from '@/lib/utils'

export interface FloatingItem { key: string; label: string; prefix?: string }

export function FloatingPills({
  items, selected, onToggle, speed = 1,
}: {
  items: FloatingItem[]
  selected: Set<string>
  onToggle: (key: string) => void
  /** Drift speed multiplier — higher = livelier (interests step uses ~1.7). */
  speed?: number
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2.5 max-w-2xl mx-auto">
      {items.map((item, i) => {
        const isSel = selected.has(item.key)
        // Deterministic per-pill variation (no Math.random — stable across renders).
        const dur = (6 + (i % 5) * 1.3) / speed
        const delay = (i % 7) * 0.4 / speed
        return (
          <button
            key={item.key}
            onClick={() => onToggle(item.key)}
            aria-pressed={isSel}
            className={cn(
              'wander-pill px-4 py-2 rounded-full text-[13px] font-medium border transition-colors duration-150 select-none',
              isSel
                ? 'bg-white text-black border-white'
                : 'bg-[#111111] text-[#999] border-[#2a2a2a] hover:border-[#555] hover:text-[#f0f0f0]',
            )}
            style={isSel ? undefined : { animationDuration: `${dur}s`, animationDelay: `${delay}s` }}
          >
            {item.prefix && <span className="mr-1.5">{item.prefix}</span>}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
