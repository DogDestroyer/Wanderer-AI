// ─── Trip-text parsing helpers (pure, unit-tested) ────────────────────────────

// Parse the requested trip length (in days) from a user message, for skeleton
// validation. Returns null when it can't tell. Handles "10 days", "10-day",
// "N nights" (≈ N+1 days is ambiguous, so we treat nights as days), and weeks.
export function parseRequestedDays(text: string): number | null {
  const t = text.toLowerCase()
  const weekWord: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 }
  const wk = t.match(/\b(\d{1,2}|a|one|two|three|four)\s*[-\s]?\s*weeks?\b/)
  if (wk) {
    const n = /\d/.test(wk[1]) ? parseInt(wk[1], 10) : (weekWord[wk[1]] ?? 1)
    if (n > 0 && n <= 8) return n * 7
  }
  const d = t.match(/\b(\d{1,2})\s*[-\s]?\s*days?\b/)
  if (d) { const n = parseInt(d[1], 10); if (n > 0 && n <= 40) return n }
  return null
}
