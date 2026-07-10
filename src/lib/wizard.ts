// ─── Wizard draft model + pure mapping helpers (no React, no store) ───────────
// The wizard collects answers into a WizardDraft, persisted continuously. On
// completion the draft maps into our EXISTING objects: a Partial<TripPreferences>
// (fed to draftPreferences) plus a single natural-language message (fed to the
// same sendMessage the chat uses). No parallel trip state.

import type { PartyType, TripPreferences } from './types'
import { getBudgetLabel } from './utils'

export const WIZARD_STEPS = [
  'countries', 'cities', 'days', 'dates', 'people', 'budget', 'interests', 'notes', 'generate',
] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]
export const WIZARD_TOTAL = WIZARD_STEPS.length // 9

export interface WizardCity {
  name: string
  country: string
}

export interface WizardDraft {
  countries: string[]         // country names
  cities: WizardCity[]        // chosen cities (carry their country for the skip case)
  days: number | null
  startDate: string | null    // ISO yyyy-mm-dd
  endDate: string | null
  partySize: number | null
  partyType: PartyType | null
  budgetLevel: number         // 0–100 slider
  exactAmount: number | null  // exact budget amount (optional, overrides slider)
  currency: string
  perPerson: boolean
  interests: string[]         // built-in interest tags
  customInterests: string[]   // user-added tags
  notes: string               // step 8 free text — passed to the agent verbatim
  skipped: WizardStepId[]     // steps the user explicitly skipped
}

export const EMPTY_WIZARD_DRAFT: WizardDraft = {
  countries: [],
  cities: [],
  days: 7,          // sensible default; the days step is stepper-only
  startDate: null,
  endDate: null,
  partySize: 3,     // sensible default; the people step is stepper-only
  partyType: null,
  budgetLevel: 50,
  exactAmount: null,
  currency: 'SGD',
  perPerson: false,
  interests: [],
  customInterests: [],
  notes: '',
  skipped: [],
}

// ─── Party-type suggestion from size (overridable) ────────────────────────────
export function suggestedPartyType(size: number | null): PartyType {
  if (!size || size <= 1) return 'solo'
  if (size === 2) return 'couple'
  return 'friends'
}

// Human phrasing for the generation message (Work reads as a business trip).
export function describeParty(type: PartyType): string {
  return type === 'work' ? 'work / business trip' : type
}

// ─── Date helpers (two-way sync with day count) ───────────────────────────────
export function daysBetween(start: string, end: string): number {
  const a = new Date(start + 'T00:00:00').getTime()
  const b = new Date(end + 'T00:00:00').getTime()
  return Math.round((b - a) / 86_400_000) + 1 // inclusive day count
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  // Format from LOCAL fields — toISOString() would shift the date across the UTC
  // boundary in non-UTC timezones (e.g. GMT+8), yielding an off-by-one end date.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ─── Which structured fields did the user actually provide? ───────────────────
// A field counts as answered when it holds a real value (skipped/blank steps map
// to inferred assumptions downstream).
export function allCountries(draft: WizardDraft): string[] {
  const set = new Set<string>(draft.countries)
  for (const c of draft.cities) if (c.country) set.add(c.country)
  return [...set]
}

// ─── Map the draft into preference fields (for draftPreferences) ──────────────
// Unanswered/skipped fields are explicitly cleared (set undefined) so stale
// defaults never leak in and get treated as user intent — a skipped step should
// leave the value for the agent to infer.
export function wizardToPreferences(draft: WizardDraft): Partial<TripPreferences> {
  const answeredPeople = !!draft.partySize && draft.partySize > 0 && !draft.skipped.includes('people')
  const answeredBudget = !draft.skipped.includes('budget')
  const hasExact = !!draft.exactAmount && draft.exactAmount > 0
  return {
    budgetLevel: answeredBudget ? draft.budgetLevel : 50,
    interests: draft.interests,
    customInterests: draft.customInterests,
    exactBudget: hasExact ? { amount: draft.exactAmount as number, currency: draft.currency, perPerson: draft.perPerson } : null,
    partySize: answeredPeople ? (draft.partySize as number) : undefined,
    partyType: draft.partyType ?? (answeredPeople ? suggestedPartyType(draft.partySize) : undefined),
  }
}

// ─── Compose the single generation message (fed to sendMessage) ───────────────
// Contains every answered field so the agent marks them as user-stated (chips:
// non-inferred). Omitted fields are left for the agent to infer. The step-8 free
// text is appended verbatim and, being part of the message, wins on conflicts.
export function composeWizardMessage(draft: WizardDraft): string {
  const cityNames = draft.cities.map((c) => c.name)
  const countries = allCountries(draft)

  // Destination clause
  let where = ''
  if (cityNames.length && countries.length) {
    where = `${listPhrase(cityNames)} in ${listPhrase(countries)}`
  } else if (cityNames.length) {
    where = listPhrase(cityNames)
  } else if (countries.length) {
    where = listPhrase(countries)
  }

  const parts: string[] = []
  if (where) parts.push(`Plan a trip to ${where}.`)
  else parts.push('Plan me a trip.')

  if (draft.days && draft.days > 0 && !draft.skipped.includes('days')) {
    parts.push(`It should be ${draft.days} days long.`)
  }
  if (draft.startDate && draft.endDate) {
    parts.push(`Travelling from ${draft.startDate} to ${draft.endDate}.`)
  } else if (draft.startDate) {
    parts.push(`Starting around ${draft.startDate}.`)
  }

  if (draft.partySize && draft.partySize > 0 && !draft.skipped.includes('people')) {
    const type = draft.partyType ?? suggestedPartyType(draft.partySize)
    const people = draft.partySize === 1 ? '1 person' : `${draft.partySize} people`
    parts.push(`For ${people} (${describeParty(type)}).`)
  } else if (draft.partyType && !draft.skipped.includes('people')) {
    parts.push(`For a ${describeParty(draft.partyType)} trip.`)
  }

  // Budget
  if (draft.exactAmount && draft.exactAmount > 0) {
    const scope = draft.perPerson ? 'per person' : 'total'
    parts.push(`Budget: ${draft.currency} ${draft.exactAmount.toLocaleString('en')} ${scope}.`)
  } else if (!draft.skipped.includes('budget')) {
    parts.push(`Budget style: ${getBudgetLabel(draft.budgetLevel).toLowerCase()}.`)
  }

  // Interests
  const interests = [...draft.interests, ...draft.customInterests]
  if (interests.length) {
    parts.push(`Interests: ${listPhrase(interests)}.`)
  }

  let message = parts.join(' ')

  const notes = draft.notes.trim()
  if (notes) message += `\n\nAdditional notes: ${notes}`

  return message
}

// "a", "a and b", "a, b and c"
function listPhrase(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

// ─── Per-step "is this step answered enough to advance with Enter?" ───────────
// Used by the shell to decide when Enter advances. Steps are all skippable, so
// "valid" only gates the Enter shortcut and the primary button emphasis.
export function isStepAnswered(step: WizardStepId, draft: WizardDraft): boolean {
  switch (step) {
    case 'countries': return draft.countries.length > 0 || draft.cities.length > 0
    case 'cities':    return draft.cities.length > 0
    case 'days':      return !!draft.days && draft.days > 0
    case 'dates':     return !!(draft.startDate && draft.endDate)
    case 'people':    return !!draft.partySize && draft.partySize > 0
    case 'budget':    return true // slider always has a value
    case 'interests': return draft.interests.length > 0 || draft.customInterests.length > 0
    case 'notes':     return true // free text, optional
    case 'generate':  return true
  }
}
