import { describe, it, expect } from 'vitest'
import { extractJsonObject } from '@/lib/agentJson'

describe('extractJsonObject', () => {
  it('extracts a clean object', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}')
  })
  it('ignores trailing prose after the object (the Haiku stray-sentence case)', () => {
    const out = extractJsonObject('{"action":"chat-only"} Hope that helps!')
    expect(out).toBe('{"action":"chat-only"}')
  })
  it('ignores leading text before the first brace', () => {
    expect(extractJsonObject('here you go: {"a":{"b":2}}')).toBe('{"a":{"b":2}}')
  })
  it('does not miscount braces inside string literals', () => {
    const src = '{"title":"Dinner at {famous} place","n":1}'
    expect(extractJsonObject(src)).toBe(src)
  })
  it('respects escaped quotes inside strings', () => {
    const src = '{"msg":"she said \\"go {now}\\""}'
    expect(extractJsonObject(src)).toBe(src)
  })
  it('returns null for truncated JSON (unbalanced braces)', () => {
    expect(extractJsonObject('{"days":[{"id":"d1"')).toBeNull()
  })
  it('returns null when there is no object at all', () => {
    expect(extractJsonObject('no json here')).toBeNull()
  })
})
