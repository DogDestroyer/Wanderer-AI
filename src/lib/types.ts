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

export interface TripBudget {
  cap: number         // user-set spending ceiling
  currency: string    // ISO currency code
}

export interface TripPreferences {
  paceLevel: number    // 0–100: 0 = very relaxed, 100 = packed
  budgetLevel: number  // 0–100: 0 = shoestring, 100 = luxury
  interests: string[]  // e.g. ["history", "food", "hiking"]
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
  coverImageUrl?: string
  createdAt: string
  updatedAt: string
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
// action = 'create'     → brand-new trip (trip field is populated)
// action = 'patch'      → update part of existing trip (patch field is populated)
// action = 'chat-only'  → conversational response, no plan change

export interface AgentTripPatch {
  tripId: string
  name?: string
  days?: Day[]               // full replacement for specified days
  dayIds?: string[]          // which day IDs were updated (for partial patches)
  suggestions?: AgentSuggestion[]
  budget?: TripBudget
  preferences?: Partial<TripPreferences>
}

export interface AgentTripResponse {
  action: 'create' | 'patch' | 'chat-only'
  trip?: TripPlan
  patch?: AgentTripPatch
  message: string
  clarifyingQuestions?: string[]
}
