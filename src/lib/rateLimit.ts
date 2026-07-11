// ─── Minimal per-key sliding-window rate limiter ──────────────────────────────
// In-memory, per-instance. On Vercel Fluid Compute instances are reused across
// requests, so this meaningfully caps abuse without external infrastructure.
// It is a first line of defence (REVIEW.md R1), not a distributed guarantee —
// a determined attacker hitting many cold instances gets `limit` per instance.

const buckets = new Map<string, number[]>()

// Cap total tracked keys so a spray of unique IPs can't grow memory unbounded.
const MAX_KEYS = 5_000

export interface RateLimitResult {
  ok: boolean
  remaining: number
  retryAfterMs: number
}

/** Record a hit for `key`; allow up to `limit` hits per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const cutoff = now - windowMs
  const prev = buckets.get(key)
  const hits = prev ? prev.filter((t) => t > cutoff) : []

  if (hits.length >= limit) {
    buckets.set(key, hits)
    return { ok: false, remaining: 0, retryAfterMs: hits[0] + windowMs - now }
  }

  hits.push(now)
  if (!buckets.has(key) && buckets.size >= MAX_KEYS) {
    // Evict the oldest-inserted key (Map preserves insertion order).
    const oldest = buckets.keys().next().value
    if (oldest !== undefined) buckets.delete(oldest)
  }
  buckets.set(key, hits)
  return { ok: true, remaining: limit - hits.length, retryAfterMs: 0 }
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

/** Standard 429 response shared by the API routes. */
export function tooManyRequests(retryAfterMs: number): Response {
  return Response.json(
    { error: 'Too many requests — please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
  )
}

/** Test-only: reset all buckets. */
export function _resetRateLimiter(): void {
  buckets.clear()
}
