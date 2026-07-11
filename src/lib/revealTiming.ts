// ─── Reveal choreography tokens (single source of truth) ──────────────────────
// Every build-reveal animation derives its timing and easing from here so the
// whole sequence shares one rhythm. transform/opacity only, 60fps.
//
// Per-day budget (4 activities): FRAME 300 + TITLE 220 + 4×ACT 180 + SETTLE 160
// ≈ 1.4s — inside the 1.5–2.5s/day target. Real batches arrive ~20–30s apart,
// so the queue drains between batches and the reveal finishes ~1.5s/day after
// the FINAL batch (measured: see tests/generation.spec.ts perf run).

export const REVEAL_EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export interface RevealTiming {
  frameMs: number    // day block frame slide+fade
  badgeDelayMs: number // day-number badge pops slightly after the frame
  titleMs: number    // title/date type+fade beat before activities start
  actStaggerMs: number // per-activity reveal interval
  settleMs: number   // pause after the last activity before the next day
}

export const REVEAL_TIMING: RevealTiming = {
  frameMs: 300,
  badgeDelayMs: 100,
  titleMs: 220,
  actStaggerMs: 180,
  settleMs: 160,
}

// prefers-reduced-motion: the sequencer still runs in strict order, but every
// entrance collapses to a fast fade and the rhythm compresses.
export const REVEAL_TIMING_REDUCED: RevealTiming = {
  frameMs: 80,
  badgeDelayMs: 0,
  titleMs: 40,
  actStaggerMs: 45,
  settleMs: 40,
}
