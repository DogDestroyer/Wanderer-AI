'use client'

import { useState, useCallback } from 'react'
import type { StepProps } from '../stepTypes'
import { COUNTRIES, POPULAR_COUNTRIES, searchCountries, countryByName } from '@/lib/data/countries'
import { TokenSearch, type TokenItem } from '../WizardKit'
import { FloatingPills } from '../FloatingPills'

// STEP 1 · "Where would you like to go?"
// Autocomplete over the full country list + drifting popular-country pills.
// Box and pills are equivalent selection surfaces.

export function StepCountries({ draft, update }: StepProps) {
  const [matches, setMatches] = useState<TokenItem[]>([])

  const selected: TokenItem[] = draft.countries.map((name) => {
    const c = countryByName(name)
    return { key: name, label: name, prefix: c?.flag }
  })

  const onQuery = useCallback((q: string) => {
    setMatches(searchCountries(q).map((c) => ({ key: c.name, label: c.name, prefix: c.flag })))
  }, [])

  function addCountry(name: string) {
    if (draft.countries.includes(name)) return
    update({ countries: [...draft.countries, name] })
  }
  function removeCountry(name: string) {
    update({ countries: draft.countries.filter((n) => n !== name) })
  }
  function toggleCountry(name: string) {
    if (draft.countries.includes(name)) removeCountry(name)
    else addCountry(name)
  }

  const selectedSet = new Set(draft.countries)

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-8">
      <div className="w-full max-w-xl">
        <TokenSearch
          placeholder="Search countries…"
          selected={selected}
          suggestions={matches}
          onQuery={onQuery}
          onAdd={(item) => addCountry(item.key)}
          onRemove={removeCountry}
        />
      </div>

      <FloatingPills
        items={POPULAR_COUNTRIES.map((c) => ({ key: c.name, label: c.name, prefix: c.flag }))}
        selected={selectedSet}
        onToggle={toggleCountry}
      />

      {/* Keep a stable reference to the full list for type-completeness / SSR */}
      <span className="sr-only">{COUNTRIES.length} countries available</span>
    </div>
  )
}
