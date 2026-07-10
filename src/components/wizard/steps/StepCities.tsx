'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import type { StepProps } from '../stepTypes'
import type { WizardCity } from '@/lib/wizard'
import { citiesForCountries, POPULAR_CITIES, searchCities, type WizardCityHit } from '@/lib/data/cities'
import { countryByName } from '@/lib/data/countries'
import { TokenSearch, SelectableCard, type TokenItem } from '../WizardKit'

// STEP 2 · "Which cities?"
// Grid of the top cities for the countries picked in step 1 (or a global popular
// set if step 1 was skipped). Search + grid are BOTH constrained to the chosen
// countries — selecting China must never surface Chicago or Chiang Mai.

export function StepCities({ draft, update }: StepProps) {
  const [matches, setMatches] = useState<TokenItem[]>([])
  // Remember the country for each searched city so adding resolves correctly.
  const hitByName = useRef(new Map<string, WizardCityHit>())

  const selectedCountryCodes = useMemo(
    () => draft.countries.map((n) => countryByName(n)?.code).filter(Boolean) as string[],
    [draft.countries],
  )

  // Grid: chosen countries' top cities, else the global popular set.
  const grid: WizardCityHit[] = selectedCountryCodes.length
    ? citiesForCountries(selectedCountryCodes)
    : POPULAR_CITIES

  const selectedKeys = new Set(draft.cities.map((c) => c.name))

  function addCity(city: WizardCity) {
    if (draft.cities.some((c) => c.name === city.name)) return
    update({ cities: [...draft.cities, city] })
  }
  function removeCity(name: string) {
    update({ cities: draft.cities.filter((c) => c.name !== name) })
  }
  function toggleCity(city: WizardCity) {
    if (selectedKeys.has(city.name)) removeCity(city.name)
    else addCity(city)
  }

  const onQuery = useCallback((q: string) => {
    // Constrain search to the selected countries (empty = global, step-1 skipped).
    const hits = searchCities(q, selectedCountryCodes)
    hitByName.current = new Map(hits.map((h) => [h.name, h]))
    setMatches(hits.map((h) => ({ key: h.name, label: h.name })))
  }, [selectedCountryCodes])

  const selectedTokens: TokenItem[] = draft.cities.map((c) => ({ key: c.name, label: c.name }))

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-6">
      <div className="w-full max-w-xl">
        <TokenSearch
          placeholder={selectedCountryCodes.length ? 'Search cities in your countries…' : 'Search cities…'}
          selected={selectedTokens}
          suggestions={matches}
          onQuery={onQuery}
          onAdd={(item) => {
            const hit = hitByName.current.get(item.key)
            addCity({ name: item.key, country: hit?.country ?? '' })
          }}
          onRemove={removeCity}
        />
      </div>

      {grid.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full max-h-[42vh] overflow-y-auto px-0.5">
          {grid.map((c) => (
            <SelectableCard
              key={`${c.name}-${c.code}`}
              title={c.name}
              subtitle={selectedCountryCodes.length ? undefined : c.country}
              selected={selectedKeys.has(c.name)}
              onClick={() => toggleCity({ name: c.name, country: c.country })}
            />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-[#555] text-center max-w-sm">
          No preset cities for your pick — type any city above and Hodo will plan around it.
        </p>
      )}
    </div>
  )
}
