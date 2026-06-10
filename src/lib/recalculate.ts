import { Activity, Day } from './types'

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
 * Takes an ordered list of activities and recomputes every activity's startTime
 * and endTime by chaining them: each activity starts after (prevEnd + travelTime).
 *
 * The first activity's startTime is kept as the anchor. This is called after
 * every drag-and-drop, activity edit, or duration change so the whole day
 * automatically reflowed without touching locked activities' durations.
 */
export function recalculateDay(activities: Activity[]): Activity[] {
  if (activities.length === 0) return []

  const result: Activity[] = []

  for (let i = 0; i < activities.length; i++) {
    const activity = { ...activities[i] }

    if (i === 0) {
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

export function calculateDayBudget(activities: Activity[]): number {
  return activities.reduce((sum, a) => sum + (a.cost?.amount ?? 0), 0)
}

export function calculateTripBudget(days: Day[]): number {
  return days.reduce((sum, d) => sum + calculateDayBudget(d.activities), 0)
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
