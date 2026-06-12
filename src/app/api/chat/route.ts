import Anthropic from '@anthropic-ai/sdk'
import type { TripPlan, AgentTripResponse, AgentSettings, TripPreferences } from '@/lib/types'
import { DEFAULT_AGENT_SETTINGS } from '@/lib/types'
import { getPaceLabel, getBudgetLabel, getTripStyleLabel, getDiningLabel } from '@/lib/utils'

// ─── Route runtime config (CRITICAL for Vercel) ───────────────────────────────
// A full itinerary generation with Opus + adaptive thinking takes ~30–60s.
// Without an extended maxDuration, Vercel kills the serverless function at the
// plan default (10s Hobby / 15s Pro) MID-STREAM. The browser then receives a
// truncated stream with no final 'done' event, no trip is created, and the UI
// falls back to the empty hero screen — which looks exactly like the page
// "reloading and clearing the chat". 60s is the universally-safe ceiling
// (allowed on every plan, including Hobby). On Pro/Enterprise you can raise
// this to 300 for more headroom.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── System prompt ─────────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Hodo, an expert AI travel planning assistant. Your job is to help users create detailed, realistic, day-by-day travel itineraries.

## Tone
Be warm, enthusiastic, and specific. Name real places. Use concrete times and costs.

## Response format — STRICT

Every response has exactly two parts:

**Part 1** — A short conversational message (1–3 sentences). This is what the user sees as you type.

**Part 2** — On its own line, the literal marker:
---WANDR-JSON---
Immediately followed by a single JSON object (no markdown fences, no backticks) that matches the AgentTripResponse schema below.

Do NOT include any text after the JSON object. Do NOT wrap the JSON in markdown code fences.

## AgentTripResponse schema

{
  "action": "create_trip" | "replace_trip" | "replace_day_activities" | "update_trip_meta" | "chat-only",
  "message": "<same text as Part 1>",
  "trip": { ... },          // only for create_trip or replace_trip — full TripPlan
  "patch": { ... },         // only for replace_day_activities or update_trip_meta
  "assumptions": [ ... ],   // REQUIRED for create_trip and replace_trip — see below
  "clarifyingQuestions": ["..."]  // optional, only for chat-only
}

## Assumptions (REQUIRED with create_trip and replace_trip)

Include an "assumptions" array listing the key parameters you used when generating the plan.
Each entry: { "field": string, "label": string, "value": string, "source": "message"|"preference"|"inferred" }

source meanings:
- "message"    = the user stated this explicitly in their message
- "preference" = you took it from the saved preferences block above
- "inferred"   = you guessed or assumed it — not stated, not in preferences

Cover at minimum (where data exists):
- field "partyType"  → label "Party"  → e.g. "Couple", "Solo traveller", "Family of 4"
- field "budget"     → label "Budget" → e.g. "Mid-range", "SGD 4,500 total", "Budget"
- field "pace"       → label "Pace"   → e.g. "Balanced", "Relaxed", "Packed"
- field "tripStyle"  → label "Style"  → e.g. "City-focused", "Nature & city mix", "Mostly nature"
- field "dates"      → label "Dates"  → e.g. "Dec 2026", "Jun 15–22, 2025", "Not specified"

Example:
"assumptions": [
  { "field": "partyType",  "label": "Party",  "value": "Couple",            "source": "inferred" },
  { "field": "budget",     "label": "Budget", "value": "Mid-range",         "source": "preference" },
  { "field": "pace",       "label": "Pace",   "value": "Balanced",          "source": "preference" },
  { "field": "tripStyle",  "label": "Style",  "value": "City-focused",      "source": "inferred" },
  { "field": "dates",      "label": "Dates",  "value": "Dec 2026",          "source": "message" }
]

## Action decision tree

Choose the action that best matches the user's intent:

**"create_trip"**: User wants a brand-new itinerary (will be saved alongside any existing trips).
→ Use when: "plan me a trip to X", "I want to go to Y", "make an itinerary for Z", or any trip planning request when there is NO current active trip.
→ Generate a full TripPlan object in the "trip" field.

**"replace_trip"**: User explicitly wants to replace their current trip with a completely new plan.
→ Use when: "redo this whole plan", "start over with X days instead", "actually let's go to X instead", "rebuild this from scratch".
→ Generate a full TripPlan object in the "trip" field. The current trip's activities will be overwritten.

**"replace_day_activities"**: User wants to modify specific activities on specific days of the CURRENT trip.
→ Use when: "change day 3", "add a museum on Tuesday", "remove the Colosseum visit", "swap the beach day for something indoors", "add more food spots".
→ Populate "patch.days" with ONLY the affected days, using the real day IDs from the current trip. Do NOT include unaffected days.

**"update_trip_meta"**: User wants to change only the trip name, dates, destination, or budget — NOT the daily activities.
→ Use when: "rename this trip", "change the start date to June 10", "update the budget to $3000", "add 2 extra days".
→ Populate "patch" with only the fields that changed.

**"chat-only"**: Conversational response — no trip changes.
→ Use when: answering general travel questions, request is too vague to act on, you need clarification before planning.
→ Optionally include "clarifyingQuestions" to prompt the user for more detail.

## When there is NO current active trip
Always use **"create_trip"**. Never use replace_trip, replace_day_activities, or update_trip_meta when there is no trip to modify.

## TripPlan (for create_trip and replace_trip)

{
  "id": "trip_<8 unique lowercase hex chars>",
  "name": "Rome in 5 Days",
  "destination": {
    "name": "Rome, Italy",
    "country": "Italy",
    "lat": 41.9028,
    "lng": 12.4964
  },
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "budget": {
    "cap": 2500,
    "currency": "USD"
  },
  "preferences": {
    "paceLevel": 60,      // 0 = very relaxed, 100 = jam-packed
    "budgetLevel": 50,    // 0 = shoestring, 100 = ultra-luxury
    "interests": ["history", "food", "art"]
  },
  "days": [ /* Day objects — see below */ ],
  "suggestions": [],
  "createdAt": "<ISO timestamp>",
  "updatedAt": "<ISO timestamp>"
}

## Day

{
  "id": "day_<8 unique lowercase hex chars>",
  "date": "YYYY-MM-DD",
  "activities": [ /* Activity objects */ ],
  "dayNotes": ""
}

## Activity

{
  "id": "act_<8 unique lowercase hex chars>",
  "title": "Visit the Colosseum",
  "description": "Explore the iconic ancient amphitheatre with a skip-the-line audio guide.",
  "category": "attraction",   // attraction | food | transport | accommodation | experience | leisure
  "startTime": "09:00",       // 24-hour HH:MM
  "endTime": "11:30",         // 24-hour HH:MM
  "durationMinutes": 150,
  "location": {
    "name": "Colosseum",
    "address": "Piazza del Colosseo, 1, 00184 Roma RM, Italy",
    "lat": 41.8902,
    "lng": 12.4922
  },
  "travelTimeToNextMinutes": 15,
  "cost": {
    "amount": 18.00,
    "currency": "USD",
    "isEstimate": true,
    "note": "per person, includes audio guide"
  },
  "locked": false,
  "weatherSensitive": false
}

## Activity guidelines
- Keep descriptions to 1–2 sentences max — concise but vivid
- Typical timings: breakfast 07:30–09:00, lunch 12:30–14:00, dinner 19:00–21:00
- Day 1: start with arrival transport + accommodation check-in
- Last day: end with departure transport
- Set weatherSensitive: true for open-air markets, beach days, walking tours, etc.
- Use accurate latitude/longitude coordinates
- For trips longer than 10 days, plan 3–4 activities per day (not 5–6) to stay within output limits

## Currency rules (CRITICAL — wrong codes cause budget chaos)
- Every cost MUST include the correct ISO 4217 currency code for where that cost occurs.
- Use the LOCAL destination currency for in-country costs: JPY for Japan, THB for Thailand, EUR for Europe, etc.
- NEVER use USD as a catch-all for foreign costs. ¥2,500 ramen must be { amount: 2500, currency: "JPY" }, not { amount: 2500, currency: "USD" }.
- Transport within a country: use that country's currency. International flights: use the currency of the booking (often USD or EUR).
- Accommodation abroad: use the local currency unless priced in USD/EUR (boutique/international chains may quote USD).
- Sanity-check your own output BEFORE writing the JSON:
  - Tokyo ramen: ¥800–2,500 (not ¥8,000, not $15)
  - Tokyo mid-range hotel/night: ¥12,000–30,000
  - Bangkok street food: ฿50–200
  - Paris café lunch: €15–30
  - NYC dinner: $25–80
  If an amount looks implausible for the destination, fix it before sending.
- The budget.currency field on the TripPlan is the user's REPORTING currency (e.g. "USD"). Activity costs should still use local currencies — the app converts them automatically.

## AgentTripPatch (for replace_day_activities and update_trip_meta)

{
  "tripId": "<the current trip's id>",
  "name": "Updated Name",              // optional — update_trip_meta only
  "destination": { ... },              // optional — update_trip_meta only
  "startDate": "YYYY-MM-DD",           // optional — update_trip_meta only
  "endDate": "YYYY-MM-DD",             // optional — update_trip_meta only
  "days": [ /* only the affected Day objects with new activities */ ],
  "dayIds": ["day_abc123"],            // list of day IDs that changed
  "budget": { ... },                   // optional
  "preferences": { ... }               // optional
}`

// ─── Preferences prompt ───────────────────────────────────────────────────────
// Translates the full TripPreferences object into a system prompt block.

function buildPreferencesPrompt(prefs: TripPreferences | null | undefined): string {
  if (!prefs) return ''

  const lines: string[] = [
    '## User Trip Preferences',
    '',
    'These preferences were set by the user before writing their message. HONOUR them when planning — they are the user\'s baseline intent.',
    '',
  ]

  // ── Budget: exact amount takes precedence over the slider ─────────────────
  if (prefs.exactBudget?.amount && prefs.exactBudget.amount > 0) {
    const { amount, currency, perPerson } = prefs.exactBudget
    const scopeLabel = perPerson ? 'per person' : 'for the whole trip'
    const formattedAmount = amount.toLocaleString('en')
    lines.push(
      `- EXACT BUDGET — hard constraint: ${currency} ${formattedAmount} ${scopeLabel}`,
      `  This overrides the budget-style slider. The itinerary's estimated costs MUST stay within`,
      `  this limit. In your conversational reply, include one sentence tracking the plan against`,
      `  the budget, e.g. "Estimated total ${currency} X,XXX of your ${formattedAmount} budget."`,
    )
  } else {
    lines.push(`- Budget style: ${getBudgetLabel(prefs.budgetLevel)} (${prefs.budgetLevel}/100, 0=shoestring, 100=luxury)`)
  }

  lines.push(`- Pace: ${getPaceLabel(prefs.paceLevel)} (${prefs.paceLevel}/100, 0=very relaxed, 100=jam-packed)`)

  if (prefs.tripStyle !== undefined) {
    lines.push(`- Trip style: ${getTripStyleLabel(prefs.tripStyle)} (${prefs.tripStyle}/100, 0=pure nature, 100=pure city)`)
  }

  // ── Interests: built-in selections + custom tags ──────────────────────────
  const allInterests = [...(prefs.interests ?? []), ...(prefs.customInterests ?? [])]
  if (allInterests.length) {
    lines.push(`- Interests: ${allInterests.join(', ')} — weight the itinerary toward these`)
  }

  if (prefs.partySize && prefs.partyType) {
    lines.push(`- Party: ${prefs.partySize} ${prefs.partySize === 1 ? 'person' : 'people'}, ${prefs.partyType}`)
  }
  if (prefs.diningStyle !== undefined) {
    lines.push(`- Dining: ${getDiningLabel(prefs.diningStyle)} (${prefs.diningStyle}/100, 0=street food, 100=fine dining)`)
  }
  if (prefs.accommodation) {
    const accomMap: Record<string, string> = {
      hostel: 'Hostels / budget guesthouses',
      'mid-range': 'Mid-range hotels',
      boutique: 'Boutique / design hotels',
      luxury: 'Luxury / 5-star hotels',
    }
    lines.push(`- Accommodation: ${accomMap[prefs.accommodation] ?? prefs.accommodation}`)
  }
  if (prefs.mobility) {
    lines.push(`- Mobility: ${prefs.mobility === 'full' ? 'Lots of walking OK — no constraint' : 'Minimise walking — cluster venues, prefer transit'}`)
  }
  if (prefs.mustAvoid?.trim()) {
    lines.push(`- Must avoid (hard constraint): ${prefs.mustAvoid}`)
  }

  lines.push(
    '',
    '**Precedence rule**: If the user\'s message directly conflicts with a preference above, the MESSAGE wins.',
    'When this happens, briefly note the override (e.g. "You mentioned luxury hotels, so I\'ve upgraded from your mid-range preference").',
    '',
    'After generating the plan, add ONE sentence to your conversational message reflecting key tailoring,',
    'e.g. "Kept it budget-friendly and packed the days with food markets and nature walks, as set in your preferences."',
  )

  return '\n\n' + lines.join('\n')
}

// ─── Dynamic settings prompt ──────────────────────────────────────────────────

function buildSettingsPrompt(s: AgentSettings): string {
  const lines: string[] = []

  const paceMap = { light: '2–4', moderate: '5–7', packed: '8–10' }
  if (s.activitiesPerDay !== 'auto') {
    lines.push(`- Plan ${paceMap[s.activitiesPerDay]} activities per day`)
  }
  if (s.groupByLocation)  lines.push('- Cluster activities by neighbourhood to minimise travel time')
  if (s.includeMeals)     lines.push('- Explicitly include breakfast, lunch, and dinner recommendations')
  if (s.includeTransport) lines.push('- Include transit/walking steps between activities')

  const styles: string[] = []
  if (s.mainstream)     styles.push('well-known tourist highlights and iconic landmarks')
  if (s.hiddenGems)     styles.push('hidden gems, local favourites, and off-the-beaten-path spots')
  if (s.foodScene)      styles.push('street food, local restaurants, food markets, and culinary experiences')
  if (s.historyCulture) styles.push('historical sites, museums, cultural experiences, and local traditions')
  if (s.outdoors)       styles.push('nature, hiking, parks, beaches, and outdoor activities')
  if (s.nightlife)      styles.push('bars, live music, clubs, and evening entertainment')
  if (s.shopping)       styles.push('markets, boutiques, and shopping districts')

  if (styles.length > 0) {
    lines.push(`- Emphasise: ${styles.join('; ')}`)
  }

  return lines.length > 0
    ? `\n\n## User preferences\n${lines.join('\n')}`
    : ''
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    trip?: TripPlan | null
    agentSettings?: AgentSettings
    preferences?: TripPreferences | null
  }

  const { messages, trip, agentSettings = DEFAULT_AGENT_SETTINGS, preferences } = body

  // Use trip's own preferences if available, otherwise fall back to passed preferences
  const activePreferences = trip?.preferences ?? preferences ?? null

  const settingsPrompt     = buildSettingsPrompt(agentSettings)
  const preferencesPrompt  = buildPreferencesPrompt(activePreferences)
  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = trip
    ? `${BASE_SYSTEM_PROMPT}${settingsPrompt}${preferencesPrompt}\n\n## Current active trip\n\nThe user currently has this trip open. Use its day IDs when patching days.\n\n${JSON.stringify(trip, null, 2)}`
    : `${BASE_SYSTEM_PROMPT}${settingsPrompt}${preferencesPrompt}\n\nNo active trip. Today's date: ${today}. Always use action "create_trip".`

  const encoder = new TextEncoder()

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(payload: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const stream = client.messages.stream({
          model: 'claude-opus-4-8',
          // Lowered from 32000: a single itinerary's text + JSON is well under this,
          // and a tighter ceiling trims worst-case output time.
          max_tokens: 24000,
          thinking: { type: 'adaptive' },
          // 'medium' effort keeps Opus's quality high for structured itinerary
          // generation while cutting the deep-thinking time that pushed total
          // latency to ~60s — which is the hard function-timeout limit on Vercel's
          // Hobby plan. This keeps generations comfortably under the cap.
          output_config: { effort: 'medium' },
          system: systemPrompt,
          messages,
        })

        let fullText = ''
        let visibleText = ''
        let markerFound = false

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text
            fullText += chunk

            if (!markerFound) {
              const markerIdx = fullText.indexOf('---WANDR-JSON---')
              if (markerIdx === -1) {
                visibleText += chunk
                send({ type: 'delta', text: chunk })
              } else {
                markerFound = true
                const newVisible = fullText.slice(visibleText.length, markerIdx)
                if (newVisible) {
                  visibleText += newVisible
                  send({ type: 'delta', text: newVisible })
                }
              }
            }
          }
        }

        // ── Parse the structured JSON block ────────────────────────────────────
        const MARKER = '---WANDR-JSON---'
        const markerIdx = fullText.indexOf(MARKER)
        const naturalMessage = markerIdx !== -1
          ? fullText.slice(0, markerIdx).trim()
          : fullText.trim()

        if (markerIdx === -1) {
          // Model never emitted the marker at all — treat as chat-only
          send({ type: 'done', response: { action: 'chat-only', message: naturalMessage } satisfies AgentTripResponse })
          return
        }

        const jsonStr = fullText.slice(markerIdx + MARKER.length).trim()
        let agentResponse: AgentTripResponse

        try {
          agentResponse = JSON.parse(jsonStr) as AgentTripResponse
          // Always prefer the streamed natural-language text as the displayed message
          if (naturalMessage) agentResponse.message = naturalMessage
          send({ type: 'done', response: agentResponse })
        } catch (parseErr) {
          // JSON parse failed — emit a json_error event so the client can retry
          const errMsg = parseErr instanceof Error ? parseErr.message : String(parseErr)
          console.error('[/api/chat] JSON parse failed:', errMsg, '\nRaw JSON (first 500):', jsonStr.slice(0, 500))
          send({ type: 'json_error', naturalMessage, parseError: errMsg })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred'
        send({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
