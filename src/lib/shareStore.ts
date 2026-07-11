// ─── Share snapshot store (server-side) ───────────────────────────────────────
// Immutable trip snapshots under unguessable ids, powering /t/{id}.
//
// Store pick: VERCEL BLOB. Justification vs the alternatives:
//  - Immutable JSON snapshots map 1:1 onto write-once objects — no schema, no
//    TTL bookkeeping, no migrations (KV/Redis would model objects in a KV shape
//    for no benefit).
//  - One auto-provisioned env var (BLOB_READ_WRITE_TOKEN) when Blob is enabled
//    on the Vercel project; the free tier comfortably covers share volumes.
//  - Reads are plain HTTPS fetches of the stored object — fast and cacheable.
// Fallback: without the token (local dev/CI) an in-memory Map serves the same
// interface, so the full share flow is testable on a local production build.

import { randomBytes } from 'crypto'
import type { TripPlan } from './types'

export const SHARE_MAX_BYTES = 300 * 1024 // snapshot size cap (a 16-day trip is ~50KB)

// 12-char base64url id (72 bits) — unguessable, URL-safe.
export function newShareId(): string {
  return randomBytes(9).toString('base64url')
}

// The fallback Map lives on globalThis: Next bundles the API route and the
// /t/[id] page separately, so plain module scope would give each its OWN Map
// within the same Node process — writes would be invisible to reads.
const memoryStore: Map<string, string> =
  ((globalThis as Record<string, unknown>).__hodoShareStore as Map<string, string>) ??
  ((globalThis as Record<string, unknown>).__hodoShareStore = new Map<string, string>()) as Map<string, string>

function blobToken(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN
}

/** True when a durable store is available (Vercel Blob token present). */
export function shareStoreIsDurable(): boolean {
  return !!blobToken()
}

export async function putSnapshot(id: string, json: string): Promise<void> {
  if (blobToken()) {
    const { put } = await import('@vercel/blob')
    await put(`shares/${id}.json`, json, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'application/json',
    })
    return
  }
  // In-memory fallback (single-instance local/dev only).
  memoryStore.set(id, json)
}

export async function getSnapshot(id: string): Promise<TripPlan | null> {
  // Reject anything that isn't our id shape before touching the store.
  if (!/^[A-Za-z0-9_-]{12,24}$/.test(id)) return null
  try {
    let json: string | undefined
    if (blobToken()) {
      const { head } = await import('@vercel/blob')
      const meta = await head(`shares/${id}.json`).catch(() => null)
      if (!meta) return null
      const res = await fetch(meta.url, { cache: 'no-store' })
      if (!res.ok) return null
      json = await res.text()
    } else {
      json = memoryStore.get(id)
    }
    if (!json) return null
    return JSON.parse(json) as TripPlan
  } catch {
    return null
  }
}
