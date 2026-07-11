import { describe, it, expect } from 'vitest'
import { recalculateDay, preserveLockedActivities, detectTimingConflicts, calculateDayBudgetConverted } from '@/lib/recalculate'
import type { Activity, Day } from '@/lib/types'

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1', title: 'X', description: '', category: 'attraction',
  startTime: '09:00', endTime: '10:00', durationMinutes: 60,
  location: { name: 'L', lat: 0, lng: 0 }, travelTimeToNextMinutes: 15,
  cost: { amount: 0, currency: 'USD', isEstimate: true }, locked: false, weatherSensitive: false,
  ...over,
})

describe('recalculateDay', () => {
  it('chains start/end times from the first activity (default anchor)', () => {
    const out = recalculateDay([
      act({ id: 'a', startTime: '09:00', durationMinutes: 60, travelTimeToNextMinutes: 30 }),
      act({ id: 'b', startTime: '13:00', durationMinutes: 90 }), // stored time ignored — reflows
    ])
    expect(out[0]).toMatchObject({ startTime: '09:00', endTime: '10:00' })
    expect(out[1]).toMatchObject({ startTime: '10:30', endTime: '12:00' }) // 10:00 + 30m travel
  })

  it('anchors at a later index: earlier cards keep stored startTimes', () => {
    const out = recalculateDay([
      act({ id: 'a', startTime: '09:00', durationMinutes: 60 }),
      act({ id: 'b', startTime: '14:00', durationMinutes: 60, travelTimeToNextMinutes: 10 }),
      act({ id: 'c', startTime: '11:00', durationMinutes: 30 }),
    ], 1)
    expect(out[0].startTime).toBe('09:00') // kept
    expect(out[1].startTime).toBe('14:00') // the anchor — the manual edit sticks
    expect(out[2]).toMatchObject({ startTime: '15:10', endTime: '15:40' }) // reflowed from anchor
  })

  it('handles empty input and clamps at midnight wrap', () => {
    expect(recalculateDay([])).toEqual([])
    const out = recalculateDay([act({ startTime: '23:30', durationMinutes: 60 })])
    expect(out[0].endTime).toBe('00:30') // wraps past midnight
  })
})

describe('preserveLockedActivities', () => {
  const day = (id: string, activities: Activity[]): Day => ({ id, date: '2026-09-15', activities })

  it('restores a locked activity the agent modified', () => {
    const locked = act({ id: 'L', title: 'Original', locked: true })
    const oldDays = [day('d1', [locked])]
    const newDays = [day('d1', [act({ id: 'L', title: 'Agent rewrote this', locked: false })])]
    const out = preserveLockedActivities(oldDays, newDays)
    expect(out[0].activities[0].title).toBe('Original')
    expect(out[0].activities[0].locked).toBe(true)
  })

  it('re-inserts a locked activity the agent dropped, near its original slot', () => {
    const locked = act({ id: 'L', title: 'Keep me', locked: true })
    const oldDays = [day('d1', [act({ id: 'a' }), locked, act({ id: 'b' })])]
    const newDays = [day('d1', [act({ id: 'x' }), act({ id: 'y' })])] // L dropped
    const out = preserveLockedActivities(oldDays, newDays)
    expect(out[0].activities.map((a) => a.id)).toEqual(['x', 'L', 'y'])
  })

  it('leaves days without locked activities untouched', () => {
    const oldDays = [day('d1', [act({ id: 'a' })])]
    const newDays = [day('d1', [act({ id: 'z' })])]
    expect(preserveLockedActivities(oldDays, newDays)).toBe(newDays) // same reference — early return
  })
})

describe('detectTimingConflicts', () => {
  it('flags an activity that overlaps the next one', () => {
    const out = detectTimingConflicts([
      act({ id: 'a', startTime: '09:00', endTime: '11:00' }),
      act({ id: 'b', startTime: '10:30', endTime: '12:00' }),
      act({ id: 'c', startTime: '12:00', endTime: '13:00' }),
    ])
    expect(out).toEqual(['a'])
  })
})

describe('calculateDayBudgetConverted', () => {
  it('converts each cost before summing (mixed currencies)', () => {
    const rates = { EUR: 1, USD: 2, JPY: 100 } // 1 EUR = 2 USD = 100 JPY
    const total = calculateDayBudgetConverted(
      [act({ cost: { amount: 100, currency: 'JPY', isEstimate: true } }),
       act({ cost: { amount: 2, currency: 'USD', isEstimate: true } })],
      'USD', rates,
    )
    expect(total).toBe(2 + 2) // ¥100 → €1 → $2, plus $2
  })
})
