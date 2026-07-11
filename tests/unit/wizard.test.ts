import { describe, it, expect } from 'vitest'
import {
  addDays, daysBetween, suggestedPartyType, describeParty,
  composeWizardMessage, wizardToPreferences, scaffoldFromDraft,
  EMPTY_WIZARD_DRAFT, type WizardDraft,
} from '@/lib/wizard'
import { parseRequestedDays } from '@/lib/tripText'

const draft = (over: Partial<WizardDraft> = {}): WizardDraft => ({ ...EMPTY_WIZARD_DRAFT, ...over })

describe('addDays / daysBetween', () => {
  it('adds days within a month', () => {
    expect(addDays('2026-09-15', 9)).toBe('2026-09-24')
  })
  it('crosses month and year boundaries using LOCAL dates (the GMT+8 off-by-one regression)', () => {
    expect(addDays('2026-08-30', 5)).toBe('2026-09-04')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    // start + (days-1) must invert daysBetween exactly
    expect(daysBetween('2026-09-15', addDays('2026-09-15', 9))).toBe(10)
  })
  it('daysBetween is inclusive', () => {
    expect(daysBetween('2026-09-15', '2026-09-15')).toBe(1)
    expect(daysBetween('2026-09-15', '2026-09-24')).toBe(10)
  })
})

describe('suggestedPartyType / describeParty', () => {
  it('maps sizes to sensible types', () => {
    expect(suggestedPartyType(1)).toBe('solo')
    expect(suggestedPartyType(2)).toBe('couple')
    expect(suggestedPartyType(5)).toBe('friends')
    expect(suggestedPartyType(null)).toBe('solo')
  })
  it('describes work as a business trip in prose', () => {
    expect(describeParty('work')).toMatch(/business/)
    expect(describeParty('couple')).toBe('couple')
  })
})

describe('composeWizardMessage', () => {
  it('includes every answered field', () => {
    const msg = composeWizardMessage(draft({
      countries: ['Japan'],
      cities: [{ name: 'Tokyo', country: 'Japan' }, { name: 'Kyoto', country: 'Japan' }],
      days: 10, startDate: '2026-09-15', endDate: '2026-09-24',
      partySize: 2, partyType: 'work',
      exactAmount: 5000, currency: 'SGD', perPerson: false,
      interests: ['food'], customInterests: ['onsen'],
      notes: 'We love ramen.',
    }))
    expect(msg).toContain('Tokyo')
    expect(msg).toContain('Kyoto')
    expect(msg).toContain('Japan')
    expect(msg).toContain('10 days')
    expect(msg).toContain('2026-09-15')
    expect(msg).toMatch(/work \/ business/)
    expect(msg).toContain('SGD 5,000 total')
    expect(msg).toContain('food and onsen')
    expect(msg).toContain('Additional notes: We love ramen.')
  })

  it('omits skipped steps so the agent infers them', () => {
    const msg = composeWizardMessage(draft({ skipped: ['days', 'people', 'budget'] }))
    expect(msg).not.toMatch(/days long/)
    expect(msg).not.toMatch(/For \d+ (person|people)/)
    expect(msg).not.toMatch(/Budget style/)
  })
})

describe('wizardToPreferences', () => {
  it('clears party fields when the people step was skipped', () => {
    const prefs = wizardToPreferences(draft({ partySize: 3, skipped: ['people'] }))
    expect(prefs.partySize).toBeUndefined()
    expect(prefs.partyType).toBeUndefined()
  })
  it('maps an exact budget and keeps explicit party choices', () => {
    const prefs = wizardToPreferences(draft({ partySize: 4, partyType: 'family', exactAmount: 3000, currency: 'USD', perPerson: true }))
    expect(prefs.exactBudget).toEqual({ amount: 3000, currency: 'USD', perPerson: true })
    expect(prefs.partyType).toBe('family')
    expect(prefs.partySize).toBe(4)
  })
})

describe('scaffoldFromDraft', () => {
  it('builds an instant shell from answers with user-sourced chips', () => {
    const s = scaffoldFromDraft(draft({
      countries: ['Japan'], cities: [{ name: 'Tokyo', country: 'Japan' }],
      days: 10, startDate: '2026-09-15', endDate: '2026-09-24',
      partySize: 2, exactAmount: 5000, currency: 'SGD',
    }))
    expect(s.dayCount).toBe(10)
    expect(s.destinationName).toContain('Tokyo')
    expect(s.budgetCap).toBe(5000)
    expect(s.assumptions.find((a) => a.field === 'partyType')?.source).toBe('message')
  })
})

describe('parseRequestedDays', () => {
  it('parses days, hyphenated days, and weeks', () => {
    expect(parseRequestedDays('10 days in Japan')).toBe(10)
    expect(parseRequestedDays('a 5-day trip')).toBe(5)
    expect(parseRequestedDays('two weeks in Italy')).toBe(14)
    expect(parseRequestedDays('3 weeks backpacking')).toBe(21)
  })
  it('returns null when no duration is stated or out of range', () => {
    expect(parseRequestedDays('somewhere sunny please')).toBeNull()
    expect(parseRequestedDays('99 days of summer')).toBeNull()
  })
})
