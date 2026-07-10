// ─── Static countries → cities dataset (no API, no AI) ────────────────────────
// Powers the wizard's "Which cities?" step. Curated major cities per country,
// keyed by ISO-3166 alpha-2 code (matching countries.ts). Not exhaustive — a
// tasteful shortlist of the destinations travellers actually search for.

import { countryByCode } from './countries'

export const CITIES_BY_COUNTRY: Record<string, string[]> = {
  JP: ['Tokyo', 'Kyoto', 'Osaka', 'Hiroshima', 'Nara', 'Sapporo', 'Fukuoka', 'Nagoya', 'Kanazawa', 'Hakone', 'Nikko'],
  IT: ['Rome', 'Florence', 'Venice', 'Milan', 'Naples', 'Bologna', 'Turin', 'Verona', 'Amalfi', 'Siena', 'Palermo'],
  FR: ['Paris', 'Nice', 'Lyon', 'Marseille', 'Bordeaux', 'Strasbourg', 'Cannes', 'Toulouse', 'Annecy', 'Colmar'],
  ES: ['Barcelona', 'Madrid', 'Seville', 'Valencia', 'Granada', 'Málaga', 'Bilbao', 'San Sebastián', 'Córdoba', 'Toledo'],
  TH: ['Bangkok', 'Chiang Mai', 'Phuket', 'Krabi', 'Ayutthaya', 'Pai', 'Koh Samui', 'Chiang Rai', 'Sukhothai'],
  US: ['New York', 'Los Angeles', 'San Francisco', 'Chicago', 'Las Vegas', 'Miami', 'New Orleans', 'Seattle', 'Boston', 'Washington DC', 'Honolulu'],
  GB: ['London', 'Edinburgh', 'Bath', 'Oxford', 'Cambridge', 'Manchester', 'York', 'Liverpool', 'Glasgow', 'Bristol'],
  GR: ['Athens', 'Santorini', 'Mykonos', 'Thessaloniki', 'Crete', 'Rhodes', 'Corfu', 'Naxos', 'Delphi'],
  PT: ['Lisbon', 'Porto', 'Sintra', 'Faro', 'Madeira', 'Lagos', 'Coimbra', 'Évora'],
  ID: ['Bali', 'Jakarta', 'Yogyakarta', 'Ubud', 'Lombok', 'Bandung', 'Gili Islands', 'Komodo'],
  VN: ['Hanoi', 'Ho Chi Minh City', 'Hoi An', 'Da Nang', 'Ha Long Bay', 'Hue', 'Sapa', 'Nha Trang', 'Da Lat'],
  MX: ['Mexico City', 'Cancún', 'Tulum', 'Playa del Carmen', 'Oaxaca', 'Guadalajara', 'Puerto Vallarta', 'Mérida', 'San Miguel de Allende'],
  AU: ['Sydney', 'Melbourne', 'Brisbane', 'Cairns', 'Perth', 'Gold Coast', 'Adelaide', 'Byron Bay', 'Hobart'],
  TR: ['Istanbul', 'Cappadocia', 'Antalya', 'Izmir', 'Bodrum', 'Pamukkale', 'Ankara', 'Ephesus'],
  DE: ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Dresden', 'Heidelberg', 'Nuremberg'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Haarlem', 'Delft', 'Maastricht'],
  CH: ['Zurich', 'Geneva', 'Lucerne', 'Interlaken', 'Zermatt', 'Bern', 'Lausanne', 'Grindelwald'],
  IN: ['Delhi', 'Mumbai', 'Jaipur', 'Agra', 'Goa', 'Udaipur', 'Varanasi', 'Kerala', 'Bangalore', 'Rishikesh'],
  SG: ['Singapore'],
  KR: ['Seoul', 'Busan', 'Jeju', 'Gyeongju', 'Incheon', 'Jeonju', 'Sokcho'],
  AE: ['Dubai', 'Abu Dhabi', 'Sharjah'],
  MA: ['Marrakech', 'Fez', 'Casablanca', 'Chefchaouen', 'Rabat', 'Essaouira', 'Merzouga'],
  HR: ['Dubrovnik', 'Split', 'Zagreb', 'Hvar', 'Zadar', 'Rovinj', 'Plitvice'],
  IS: ['Reykjavík', 'Vík', 'Akureyri', 'Selfoss', 'Höfn'],
  NZ: ['Auckland', 'Queenstown', 'Wellington', 'Christchurch', 'Rotorua', 'Wanaka', 'Napier'],
  EG: ['Cairo', 'Luxor', 'Aswan', 'Alexandria', 'Hurghada', 'Sharm El Sheikh', 'Giza'],
  PE: ['Lima', 'Cusco', 'Machu Picchu', 'Arequipa', 'Puno', 'Huacachina'],
  BR: ['Rio de Janeiro', 'São Paulo', 'Salvador', 'Florianópolis', 'Foz do Iguaçu', 'Paraty', 'Manaus'],
  AR: ['Buenos Aires', 'Mendoza', 'Bariloche', 'El Calafate', 'Salta', 'Córdoba'],
  AT: ['Vienna', 'Salzburg', 'Innsbruck', 'Hallstatt', 'Graz'],
  BE: ['Brussels', 'Bruges', 'Ghent', 'Antwerp'],
  KH: ['Siem Reap', 'Phnom Penh', 'Sihanoukville', 'Battambang', 'Kampot'],
  CA: ['Toronto', 'Vancouver', 'Montreal', 'Quebec City', 'Banff', 'Ottawa', 'Victoria'],
  CL: ['Santiago', 'Valparaíso', 'Atacama', 'Torres del Paine', 'Easter Island'],
  CN: ['Beijing', 'Shanghai', 'Xi’an', 'Chengdu', 'Guilin', 'Hong Kong', 'Zhangjiajie', 'Suzhou'],
  CO: ['Bogotá', 'Cartagena', 'Medellín', 'Cali', 'Santa Marta'],
  CR: ['San José', 'La Fortuna', 'Manuel Antonio', 'Monteverde', 'Tamarindo'],
  CZ: ['Prague', 'Český Krumlov', 'Brno', 'Karlovy Vary'],
  DK: ['Copenhagen', 'Aarhus', 'Odense'],
  FI: ['Helsinki', 'Rovaniemi', 'Turku', 'Tampere'],
  HU: ['Budapest', 'Eger', 'Debrecen'],
  IE: ['Dublin', 'Galway', 'Cork', 'Killarney', 'Dingle'],
  IL: ['Jerusalem', 'Tel Aviv', 'Haifa', 'Eilat'],
  JO: ['Amman', 'Petra', 'Wadi Rum', 'Aqaba'],
  LA: ['Luang Prabang', 'Vientiane', 'Vang Vieng'],
  MY: ['Kuala Lumpur', 'Penang', 'Malacca', 'Langkawi', 'Kota Kinabalu'],
  MV: ['Malé', 'Maafushi'],
  NP: ['Kathmandu', 'Pokhara', 'Chitwan'],
  NO: ['Oslo', 'Bergen', 'Tromsø', 'Stavanger', 'Ålesund'],
  PH: ['Manila', 'Cebu', 'Palawan', 'Boracay', 'Bohol', 'Siargao'],
  PL: ['Kraków', 'Warsaw', 'Gdańsk', 'Wrocław', 'Zakopane'],
  ZA: ['Cape Town', 'Johannesburg', 'Kruger', 'Durban', 'Stellenbosch'],
  LK: ['Colombo', 'Kandy', 'Galle', 'Ella', 'Sigiriya'],
  SE: ['Stockholm', 'Gothenburg', 'Malmö', 'Kiruna'],
  TW: ['Taipei', 'Taichung', 'Tainan', 'Kaohsiung', 'Hualien'],
}

/** Cities for a set of selected country codes, de-duplicated, in country order. */
export function citiesForCountries(codes: string[]): { name: string; country: string; code: string }[] {
  const out: { name: string; country: string; code: string }[] = []
  const seen = new Set<string>()
  for (const code of codes) {
    const country = countryByCode(code)
    for (const name of CITIES_BY_COUNTRY[code] ?? []) {
      const key = `${name}|${code}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ name, country: country?.name ?? '', code })
    }
  }
  return out
}

// ─── Global popular cities (shown when step 1 is skipped) ─────────────────────
// Selecting one implies its country, so a city choice alone can drive planning.
export const POPULAR_CITIES: { name: string; country: string; code: string }[] = [
  ['Tokyo', 'JP'], ['Paris', 'FR'], ['Rome', 'IT'], ['Bangkok', 'TH'], ['Barcelona', 'ES'],
  ['London', 'GB'], ['New York', 'US'], ['Bali', 'ID'], ['Lisbon', 'PT'], ['Istanbul', 'TR'],
  ['Kyoto', 'JP'], ['Amsterdam', 'NL'], ['Dubai', 'AE'], ['Singapore', 'SG'], ['Sydney', 'AU'],
  ['Marrakech', 'MA'], ['Athens', 'GR'], ['Hanoi', 'VN'], ['Seoul', 'KR'], ['Mexico City', 'MX'],
  ['Reykjavík', 'IS'], ['Cape Town', 'ZA'], ['Cusco', 'PE'], ['Queenstown', 'NZ'],
].map(([name, code]) => ({ name, code, country: countryByCode(code)?.name ?? '' }))

/** Case-insensitive search across every city in the dataset (for autocomplete). */
export function searchCities(query: string, limit = 10): { name: string; country: string; code: string }[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: { name: string; country: string; code: string }[] = []
  for (const [code, names] of Object.entries(CITIES_BY_COUNTRY)) {
    const country = countryByCode(code)
    if (!country) continue
    for (const name of names) {
      if (name.toLowerCase().includes(q)) out.push({ name, country: country.name, code })
      if (out.length >= limit * 3) break
    }
  }
  // Prefer prefix matches
  out.sort((a, b) => {
    const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1
    const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1
    return ap - bp
  })
  return out.slice(0, limit)
}
