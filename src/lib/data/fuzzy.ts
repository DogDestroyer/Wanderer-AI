// ─── Shared fuzzy-search primitives ───────────────────────────────────────────
// Used by the countries and cities search (was duplicated in both).

export const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
export const normalizeText = (s: string) => s.normalize('NFD').replace(DIACRITICS, '').toLowerCase().trim()
export const compactText = (s: string) => normalizeText(s).replace(/[^a-z0-9]/g, '')

/** Bounded Levenshtein distance (early-exits past `max`, returning max+1). */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}
