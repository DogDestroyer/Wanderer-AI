import { describe, it, expect, beforeEach } from 'vitest'
import { rateLimit, _resetRateLimiter } from '@/lib/rateLimit'

describe('rateLimit', () => {
  beforeEach(() => _resetRateLimiter())

  it('allows exactly `limit` hits then rejects', () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('k', 5, 60_000, t + i).ok).toBe(true)
    }
    const denied = rateLimit('k', 5, 60_000, t + 5)
    expect(denied.ok).toBe(false)
    expect(denied.retryAfterMs).toBeGreaterThan(0)
  })

  it('frees slots once hits fall out of the window', () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) rateLimit('k', 5, 60_000, t)
    expect(rateLimit('k', 5, 60_000, t + 1).ok).toBe(false)
    expect(rateLimit('k', 5, 60_000, t + 60_001).ok).toBe(true) // window elapsed
  })

  it('tracks keys independently', () => {
    const t = 1_000_000
    for (let i = 0; i < 5; i++) rateLimit('a', 5, 60_000, t)
    expect(rateLimit('a', 5, 60_000, t).ok).toBe(false)
    expect(rateLimit('b', 5, 60_000, t).ok).toBe(true)
  })

  it('reports remaining correctly', () => {
    const t = 1_000_000
    expect(rateLimit('k', 3, 60_000, t).remaining).toBe(2)
    expect(rateLimit('k', 3, 60_000, t).remaining).toBe(1)
    expect(rateLimit('k', 3, 60_000, t).remaining).toBe(0)
  })
})
