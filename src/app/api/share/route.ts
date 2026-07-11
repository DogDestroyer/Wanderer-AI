import type { TripPlan } from '@/lib/types'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'
import { newShareId, putSnapshot, SHARE_MAX_BYTES } from '@/lib/shareStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/share — store an IMMUTABLE snapshot of the trip under an
// unguessable id; returns { id }. Sharing again after edits creates a NEW
// snapshot (no live sync by design). Gated by the demo-password cookie like
// every API route (proxy.ts) and rate-limited per visitor.
export async function POST(request: Request): Promise<Response> {
  const rl = rateLimit(`share:${clientIp(request)}`, 5, 10 * 60_000)
  if (!rl.ok) return tooManyRequests(rl.retryAfterMs)

  const raw = await request.text()
  if (raw.length > SHARE_MAX_BYTES) {
    return Response.json({ error: 'Trip too large to share.' }, { status: 413 })
  }

  let trip: TripPlan
  try {
    trip = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  // Minimal shape check — this must be a real trip snapshot.
  if (!trip || typeof trip.name !== 'string' || !Array.isArray(trip.days) || trip.days.length === 0) {
    return Response.json({ error: 'Not a valid trip.' }, { status: 400 })
  }

  const id = newShareId()
  try {
    await putSnapshot(id, raw)
  } catch (err) {
    console.error('[/api/share] store failed:', err instanceof Error ? err.message : String(err))
    return Response.json({ error: 'Sharing is not available right now.' }, { status: 503 })
  }
  return Response.json({ id })
}
