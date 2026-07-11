'use client'

// ─── useRevealSequencer ───────────────────────────────────────────────────────
// The presentation queue behind the build reveal. Decouples DATA ARRIVAL (store
// updates as batches merge) from VISUAL REVEAL (strictly sequential, one day at
// a time, at a controlled rhythm).
//
// Two governing rules:
//  1. Nothing appears without an animated entrance — enforced by only mounting
//     day N+1 after day N has fully played (the DOM literally lacks later days).
//  2. Strict order — day N populates completely before day N+1's frame draws,
//     regardless of how batches arrive.
//
// Honesty rule: the UI never shows content that hasn't arrived. If the queue
// drains (network slower than the animation), the current day's frame sits in
// shimmer and visibly waits; activities play only once its batch lands. Failed
// days (batch failed twice) reveal their retry card through the same entrance
// and the queue continues.
//
// This is presentation-only: it reads trip/build state and owns endBuild() —
// the generation pipeline is untouched.

import { useEffect, useReducer, useRef } from 'react'
import { useReducedMotion } from 'framer-motion'
import { useStore } from '@/lib/store'
import type { TripPlan } from '@/lib/types'
import { REVEAL_TIMING, REVEAL_TIMING_REDUCED } from '@/lib/revealTiming'

export interface RevealState {
  /** Days fully revealed (interactive). Day at this index is the one playing. */
  revealed: number
  /** Current day's frame has drawn (title/date beat included). */
  frameShown: boolean
  /** Activities revealed so far in the current day. */
  visibleActs: number
  /** Every day has settled (the whole reveal is finished). */
  settledAll: boolean
}

type Action =
  | { type: 'frame' }
  | { type: 'act' }
  | { type: 'complete-day' }
  | { type: 'settled' }
  | { type: 'reset' }

function reducer(s: RevealState, a: Action): RevealState {
  switch (a.type) {
    case 'frame':        return { ...s, frameShown: true }
    case 'act':          return { ...s, visibleActs: s.visibleActs + 1 }
    case 'complete-day': return { revealed: s.revealed + 1, frameShown: false, visibleActs: 0, settledAll: false }
    case 'settled':      return { ...s, settledAll: true }
    case 'reset':        return { revealed: 0, frameShown: false, visibleActs: 0, settledAll: false }
  }
}

const INITIAL: RevealState = { revealed: 0, frameShown: false, visibleActs: 0, settledAll: false }

export function useRevealSequencer(trip: TripPlan, active: boolean): RevealState {
  const reduce = useReducedMotion()
  const T = reduce ? REVEAL_TIMING_REDUCED : REVEAL_TIMING
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const buildPhase = useStore((s) => s.build.phase)
  const failedDayIds = useStore((s) => s.build.failedDayIds)

  // Inputs that should wake the state machine when data arrives mid-wait.
  const dayCount = trip.days.length
  const current = trip.days[state.revealed]
  const currentArrived = current ? current.activities.length : 0
  const currentFailed = current ? failedDayIds.includes(current.id) : false

  // Reset if a new build session starts (or the trip identity changes).
  const tripIdRef = useRef(trip.id)
  useEffect(() => {
    if (tripIdRef.current !== trip.id) {
      tripIdRef.current = trip.id
      dispatch({ type: 'reset' })
    }
  }, [trip.id])

  useEffect(() => {
    if (!active || state.settledAll) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = (ms: number, a: Action) => { timer = setTimeout(() => dispatch(a), ms) }

    if (state.revealed >= dayCount) {
      // All days revealed. Settle once the pipeline has finished; a brief beat
      // lets the summary status line land before the build UI dissolves.
      if (dayCount > 0 && buildPhase === 'complete') {
        later(900, { type: 'settled' })
      }
      // else: generation still running with nothing queued — wait for data.
    } else if (!state.frameShown) {
      // 1–2: frame slides in, badge pops, title/date type — one combined beat.
      later(T.frameMs + T.titleMs, { type: 'frame' })
    } else if (currentFailed) {
      // Failed day: its retry card entered with the frame — settle and move on.
      later(T.settleMs + 200, { type: 'complete-day' })
    } else if (currentArrived === 0) {
      // Queue drained: sit in shimmer and visibly wait for the batch. The
      // effect re-runs when currentArrived changes — no timer needed.
    } else if (state.visibleActs < currentArrived) {
      // 3–5: activities populate one at a time; cost badges count up alongside.
      later(T.actStaggerMs, { type: 'act' })
    } else {
      // 6: brief settle, then the next day begins.
      later(T.settleMs, { type: 'complete-day' })
    }

    return () => clearTimeout(timer)
  }, [active, state, dayCount, currentArrived, currentFailed, buildPhase, T.frameMs, T.titleMs, T.actStaggerMs, T.settleMs])

  // The sequencer owns the end of the build session: dissolve the construction
  // chrome only after the final day has settled (never mid-reveal).
  useEffect(() => {
    if (active && state.settledAll) {
      const id = setTimeout(() => useStore.getState().endBuild(), 700)
      return () => clearTimeout(id)
    }
  }, [active, state.settledAll])

  return state
}
