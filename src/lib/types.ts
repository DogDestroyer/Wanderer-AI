// ─── Core domain types for Wandr ───────────────────────────────────────────

export type ActivityCategory =
  | 'attraction'
  | 'food'
  | 'transport'
  | 'accommodation'
  | 'experience'
  | 'leisure'

export type WeatherCondition =
  | 'sunny'
  | 'partly-cloudy'
  | 'cloudy'
  | 'rainy'
  | 'stormy'
  | 'snowy'
  | 'windy'

export interface Location {
  name: string
  address?: string
  lat: number
  lng: number
}

export interface Cost {
  amount: number       // always in the trip's currency
  currency: string     // e.g. "USD", "EUR", "GBP"
  isEstimate: boolean  // false = real price, true = AI guess
  note?: string        // e.g. "per person", "includes tax"
}

export interface WeatherForecast {
  tempHighC: number
  tempLowC: number
  condition: WeatherCondition
  precipitationProbability: number  // 0–100 percent
  windSpeedKph: number
  description: string
}

export interface Activity {
  id: string
  title: string
  description: string
  category: ActivityCategory
  startTime: string             // "09:00" 24-hour
  endTime: string               // "10:30" 24-hour — recalculated automatically
  durationMinutes: number       // source of truth for duration
  location: Location
  travelTimeToNextMinutes: number  // walking/transit to the NEXT activity
  cost: Cost
  locked: boolean               // agent never modifies locked activities
  weatherSensitive: boolean     // flag for weather-based swap suggestions
  agentNotes?: string           // why the agent chose this
  bookingUrl?: string
}

export interface Day {
  id: string
  date: string                  // ISO "2024-06-15"
  dayTitle?: string             // short evocative title, e.g. "Kyoto: Temples & Kaiseki"
  weather?: WeatherForecast     // populated by weather API
  activities: Activity[]
  dayNotes?: string
}

export interface TripDestination {
  name: string
  country: string
  lat: number
  lng: number
}

// ─── Live travel data (flights + hotels) ──────────────────────────────────────
// Sourced behind a provider-agnostic wrapper (liteAPI for hotels, Travelpayouts
// for flights). Both degrade gracefully to AI estimates (isEstimate / source).

export interface HotelOffer {
  source: 'liteapi' | 'estimate'
  hotelId?: string
  name: string
  city: string
  stars?: number          // 1–5
  rating?: number         // review score, e.g. 8.7
  pricePerNight: number   // in `currency`
  currency: string
  photo?: string
  isEstimate: boolean     // false for real liteAPI prices
  deepLink: string        // "Check price" — Agoda/Trip.com search
}

export interface FlightOffer {
  source: 'travelpayouts' | 'estimate'
  originCode: string
  destinationCode: string
  departDate: string      // YYYY-MM-DD
  returnDate?: string
  price: number           // in `currency`
  currency: string
  airline?: string
  isIndicative: boolean   // true: cached aggregate (Travelpayouts), verify via deep link
  isEstimate: boolean     // true if source === 'estimate'
  deepLink: string        // Trip.com flight search
}

export interface TripLiveData {
  fetchedAt: number       // epoch ms
  key: string             // hash of the fetch params — refetch only when this changes
  flight: FlightOffer | null
  hotels: HotelOffer[]    // shortlist for the primary destination city
}

export interface TripBudget {
  cap: number         // user-set spending ceiling
  currency: string    // ISO currency code
}

export type PartyType = 'solo' | 'couple' | 'family' | 'friends'
export type AccommodationType = 'hostel' | 'mid-range' | 'boutique' | 'luxury'
export type MobilityType = 'full' | 'limited'

export const INTEREST_OPTIONS = [
  'food', 'nature', 'shopping', 'history', 'nightlife', 'art', 'adventure',
] as const

/** An exact monetary budget entered by the user — overrides the budgetLevel slider. */
export interface ExactBudget {
  amount: number      // positive integer
  currency: string    // ISO 4217 code, e.g. "SGD"
  perPerson: boolean  // false = total trip, true = per person
}

export interface TripPreferences {
  // Core — always present
  paceLevel: number    // 0–100: 0 = very relaxed, 100 = packed
  budgetLevel: number  // 0–100: 0 = shoestring, 100 = luxury
  interests: string[]  // selected built-in interest tags
  // Extended — optional for backward compat with persisted trips
  tripStyle?: number              // 0–100: 0 = nature-focused, 100 = city-focused
  partySize?: number              // 1–10
  partyType?: PartyType
  diningStyle?: number            // 0–100: 0 = street food, 100 = fine dining
  accommodation?: AccommodationType
  mobility?: MobilityType         // 'full' = walking OK, 'limited' = minimise walking
  mustAvoid?: string              // free-text hard constraints
  exactBudget?: ExactBudget | null  // when set, overrides budgetLevel as a hard cap
  customInterests?: string[]      // user-added interest tags beyond INTEREST_OPTIONS
  showLocalPrices?: boolean       // show original local price as a muted secondary value (default true)
  flyingFrom?: string             // origin city/airport for live flight pricing, e.g. "Singapore" or "SIN"
}

export const DEFAULT_PREFERENCES: TripPreferences = {
  paceLevel: 50,
  budgetLevel: 50,
  interests: [],
  tripStyle: 50,
  partySize: 2,
  partyType: 'couple',
  diningStyle: 50,
  accommodation: 'mid-range',
  mobility: 'full',
  mustAvoid: '',
  exactBudget: null,
  customInterests: [],
  showLocalPrices: true,
}

export type SuggestionType =
  | 'timing-conflict'
  | 'weather-swap'
  | 'route-optimization'
  | 'budget-warning'
  | 'closed-venue'
  | 'general'

export interface ActivitySwap {
  fromActivityId: string
  toActivity: Omit<Activity, 'id'>
}

export interface AgentSuggestion {
  id: string
  type: SuggestionType
  title: string
  message: string
  affectedActivityIds: string[]
  affectedDayIds: string[]
  swapOption?: ActivitySwap
  dismissed: boolean
  createdAt: string
}

// ─── Assumption chips ─────────────────────────────────────────────────────────
// Key parameters the agent used when generating a plan — shown as editable chips
// at the top of the itinerary so the user can see and correct any AI guesses.

export interface TripAssumption {
  field: string    // 'partyType' | 'budget' | 'pace' | 'tripStyle' | 'dates'
  label: string    // human-readable: 'Party', 'Budget', 'Pace', 'Style', 'Dates'
  value: string    // human-readable: 'Couple', 'Mid-range', 'Balanced', 'Dec 2026'
  source: 'message' | 'preference' | 'inferred'
}

// ─── Checklist (per-trip, no AI) ──────────────────────────────────────────────

export type ChecklistSection = 'Before you go' | 'Packing' | 'Documents' | 'General'
export const CHECKLIST_SECTIONS: ChecklistSection[] = ['Before you go', 'Packing', 'Documents', 'General']

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
  section: ChecklistSection
  order: number
}

// ─── Reservations (per-trip, no AI) ───────────────────────────────────────────

export type ReservationType = 'flight' | 'hotel' | 'restaurant' | 'activity' | 'transport'
export type ReservationStatus = 'booked' | 'pending' | 'cancelled'

export interface Reservation {
  id: string
  type: ReservationType
  name: string
  date?: string                 // YYYY-MM-DD
  time?: string                 // HH:MM
  confirmationNumber?: string
  cost?: Cost                   // actual spend — flows into the budget
  notes?: string
  status: ReservationStatus
  activityId?: string           // links to an itinerary activity (if reserved from one)
}

export interface TripPlan {
  id: string
  name: string
  destination: TripDestination
  startDate: string            // ISO date
  endDate: string              // ISO date
  budget: TripBudget
  preferences: TripPreferences
  days: Day[]
  suggestions: AgentSuggestion[]
  assumptions?: TripAssumption[]  // key parameters used when the plan was generated
  liveData?: TripLiveData         // cached live flight + hotel prices
  checklist?: ChecklistItem[]     // per-trip checklist (feature 3)
  reservations?: Reservation[]    // confirmed bookings (feature 4)
  coverImageUrl?: string
  createdAt: string
  updatedAt: string
}

// ─── Agent settings ─────────────────────────────────────────────────────────
// User-configurable controls that shape the system prompt on every request.
// All fields default to off/auto so the AI uses its own judgment unless told otherwise.

export interface AgentSettings {
  // Planning behaviour
  activitiesPerDay: 'auto' | 'light' | 'moderate' | 'packed' // auto = Claude decides
  groupByLocation:  boolean  // cluster nearby spots to minimise travel
  includeMeals:     boolean  // explicitly include breakfast / lunch / dinner stops
  includeTransport: boolean  // include transit steps between activities

  // Sources & style — what kinds of places to emphasise
  mainstream:     boolean  // well-known tourist highlights
  hiddenGems:     boolean  // off-the-beaten-path, local favourites
  foodScene:      boolean  // street food, restaurants, food markets
  historyCulture: boolean  // museums, heritage sites, local traditions
  outdoors:       boolean  // nature, hiking, parks, beaches
  nightlife:      boolean  // bars, clubs, live music
  shopping:       boolean  // markets, boutiques, shopping districts
}

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  activitiesPerDay: 'auto',
  groupByLocation:  false,
  includeMeals:     false,
  includeTransport: false,
  mainstream:       false,
  hiddenGems:       false,
  foodScene:        false,
  historyCulture:   false,
  outdoors:         false,
  nightlife:        false,
  shopping:         false,
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  isStreaming?: boolean
}

// ─── What the AI agent returns ───────────────────────────────────────────────
//
// action = 'create_trip'           → brand-new trip saved alongside any existing trips
// action = 'replace_trip'          → overwrite the current trip wholesale
// action = 'replace_day_activities'→ replace activities on specific days of the current trip
// action = 'update_trip_meta'      → change trip name / dates / destination / budget only
// action = 'chat-only'             → conversational response, no plan change
//
// Legacy (keep for backward compat):
// action = 'create'  → same as create_trip
// action = 'patch'   → same as replace_day_activities / update_trip_meta

export interface AgentTripPatch {
  tripId: string
  name?: string
  destination?: TripDestination  // allowed in update_trip_meta
  startDate?: string             // allowed in update_trip_meta
  endDate?: string               // allowed in update_trip_meta
  days?: Day[]                   // full replacement for specified days
  dayIds?: string[]              // which day IDs were updated (informational)
  suggestions?: AgentSuggestion[]
  budget?: TripBudget
  preferences?: Partial<TripPreferences>
}

export interface AgentTripResponse {
  action:
    | 'create_trip'
    | 'replace_trip'
    | 'replace_day_activities'
    | 'update_trip_meta'
    | 'chat-only'
    | 'create'   // legacy
    | 'patch'    // legacy
  trip?: TripPlan       // populated for create_trip / replace_trip
  patch?: AgentTripPatch // populated for replace_day_activities / update_trip_meta / legacy patch
  message: string
  assumptions?: TripAssumption[]  // key parameters used — shown as editable chips
  clarifyingQuestions?: string[]
}
