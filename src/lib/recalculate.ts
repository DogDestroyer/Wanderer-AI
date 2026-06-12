import { Activity, Day } from './types'
import { convertCost, type RatesMap } from './currency'

const DEFAULT_TRAVEL_MINS = 15

function parseTimeMins(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function minsToTimeStr(totalMins: number): string {
  // Clamp to a sane range — activities past midnight wrap to next-day display
  const clamped = Math.max(0, totalMins)
  const h = Math.floor(clamped / 60) % 24
  const m = clamped % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Takes an ordered list of activities and recomputes startTimes and endTimes by
 * chaining them: each activity starts after (prevEnd + travelTime).
 *
 * `anchorIndex` is the activity whose stored startTime is treated as fixed; every
 * activity AFTER it reflows from it, while activities at/ before it keep their
 * stored startTimes (endTimes are still recomputed from duration). The default of
 * 0 reproduces the original behaviour (anchor the day on the first activity) and
 * is what drag-and-drop, delete, and duration changes use. A manual start-time
 * edit on a later card passes that card's index so the edit sticks and only the
 * downstream timings reflow.
 */
export function recalculateDay(activities: Activity[], anchorIndex = 0): Activity[] {
  if (activities.length === 0) return []

  const result: Activity[] = []

  for (let i = 0; i < activities.length; i++) {
    const activity = { ...activities[i] }

    if (i <= anchorIndex) {
      // Keep the stored startTime; just recompute the endTime from duration.
      const startMins = parseTimeMins(activity.startTime)
      const endMins = startMins + activity.durationMinutes
      result.push({ ...activity, endTime: minsToTimeStr(endMins) })
    } else {
      const prev = result[i - 1]
      const prevEndMins = parseTimeMins(prev.endTime)
      const travel = prev.travelTimeToNextMinutes ?? DEFAULT_TRAVEL_MINS
      const startMins = prevEndMins + travel
      const endMins = startMins + activity.durationMinutes
      result.push({
        ...activity,
        startTime: minsToTimeStr(startMins),
        endTime: minsToTimeStr(endMins),
      })
    }
  }

  return result
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

// Raw sum — kept for legacy callers; do NOT use for display.
// This ignores currency and sums raw amounts, which produces nonsense for
// mixed-currency trips (e.g. ¥163,000 + $40 = 163,040 treated as one currency).
export function calculateDayBudget(activities: Activity[]): number {
  return activities.reduce((sum, a) => sum + (a.cost?.amount ?? 0), 0)
}

export function calculateTripBudget(days: Day[]): number {
  return days.reduce((sum, d) => sum + calculateDayBudget(d.activities), 0)
}

// ─── Currency-aware equivalents (use these everywhere for display) ────────────

/**
 * Sum activity costs, converting each to toCurrency first.
 * This is the correct aggregation function for mixed-currency trips.
 */
export function calculateDayBudgetConverted(
  activities: Activity[],
  toCurrency: string,
  rates: RatesMap,
): number {
  return activities.reduce((sum, a) => sum + convertCost(a.cost, toCurrency, rates), 0)
}

export function calculateTripBudgetConverted(
  days: Day[],
  toCurrency: string,
  rates: RatesMap,
): number {
  return days.reduce((sum, d) => sum + calculateDayBudgetConverted(d.activities, toCurrency, rates), 0)
}

// ─── Locked-activity preservation (defense in depth) ──────────────────────────

/**
 * Guarantees the AI can never alter or drop a locked activity, regardless of what
 * it returns. For every activity that was locked in the PREVIOUS state, restore
 * its exact data in the new days (matched by id), and re-insert it at roughly its
 * original position if the agent dropped it entirely. The system prompt also
 * instructs the model to preserve locked cards — this is the hard backstop.
 *
 * `oldDays` are the days before the agent edit; `newDays` are what the agent
 * returned (the full trip for replace_trip, or just the affected days for
 * replace_day_activities). Days are matched by id, so unaffected days are safe.
 */
export function preserveLockedActivities(oldDays: Day[], newDays: Day[]): Day[] {
  const lockedById = new Map<string, { act: Activity; dayId: string; index: number }>()
  oldDays.forEach((d) =>
    d.activities.forEach((a, i) => {
      if (a.locked) lockedById.set(a.id, { act: a, dayId: d.id, index: i })
    }),
  )
  if (lockedById.size === 0) return newDays

  const restored = new Set<string>()
  const merged = newDays.map((day) => ({
    ...day,
    activities: day.activities.map((a) => {
      const locked = lockedById.get(a.id)
      if (locked && locked.dayId === day.id) {
        restored.add(a.id)
        return locked.act // exact original — the agent's version is discarded
      }
      return a
    }),
  }))

  // Re-insert locked activities the agent dropped, into their original day.
  for (const [id, { act, dayId, index }] of lockedById) {
    if (restored.has(id)) continue
    const day = merged.find((d) => d.id === dayId)
    if (!day || day.activities.some((a) => a.id === id)) continue
    const acts = [...day.activities]
    acts.splice(Math.min(index, acts.length), 0, act)
    day.activities = acts
  }

  return merged
}

// ─── Conflict detection ───────────────────────────────────────────────────────

/** Returns IDs of activities that overlap with the one after them */
export function detectTimingConflicts(activities: Activity[]): string[] {
  const conflicts: string[] = []
  for (let i = 0; i < activities.length - 1; i++) {
    const curr = activities[i]
    const next = activities[i + 1]
    if (parseTimeMins(curr.endTime) > parseTimeMins(next.startTime)) {
      conflicts.push(curr.id)
    }
  }
  return conflicts
}

/** True if any activity in the day ends past 23:00 */
export function dayRunsLate(activities: Activity[]): boolean {
  return activities.some((a) => parseTimeMins(a.endTime) > 23 * 60)
}
