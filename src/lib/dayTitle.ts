import type { Day, Activity, ActivityCategory } from './types'

// ─── Local day-title derivation (NO AI) ───────────────────────────────────────
// For legacy trips (or any day missing a dayTitle), build a short title purely
// from the day's activity data — dominant locations, then category. Never calls
// the model.

const CATEGORY_WORD: Record<ActivityCategory, string> = {
  attraction:    'Sights',
  food:          'Food & Markets',
  transport:     'Transit',
  accommodation: 'Stay',
  experience:    'Experiences',
  leisure:       'Leisure',
}

function dominantCategory(activities: Activity[]): ActivityCategory | null {
  const counts = new Map<ActivityCategory, number>()
  for (const a of activities) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
  let best: ActivityCategory | null = null
  let max = 0
  for (const [cat, n] of counts) {
    if (n > max) { max = n; best = cat }
  }
  return best
}

/**
 * The day's display title: the stored dayTitle if present, otherwise one derived
 * from its activities. Returns '' for an empty day (caller shows just "Day N").
 */
export function deriveDayTitle(day: Day): string {
  if (day.dayTitle?.trim()) return day.dayTitle.trim()
  const acts = day.activities ?? []
  if (acts.length === 0) return ''

  // Distinct, meaningful location names in order of appearance (skip transit-y ones).
  const locs: string[] = []
  for (const a of acts) {
    const n = a.location?.name?.trim()
    if (n && !locs.includes(n)) locs.push(n)
  }

  if (locs.length >= 2) return `${locs[0]} & ${locs[1]}`

  const cat = dominantCategory(acts)
  const word = cat ? CATEGORY_WORD[cat] : ''
  if (locs.length === 1) return word ? `${locs[0]} · ${word}` : locs[0]
  return word
}
