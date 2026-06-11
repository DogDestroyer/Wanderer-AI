import Anthropic from '@anthropic-ai/sdk'
import type { TripPlan, AgentTripResponse, AgentSettings } from '@/lib/types'
import { DEFAULT_AGENT_SETTINGS } from '@/lib/types'

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
  "trip": { ... },     // only for create_trip or replace_trip — full TripPlan
  "patch": { ... },    // only for replace_day_activities or update_trip_meta
  "clarifyingQuestions": ["..."]  // optional, only for chat-only
}

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
- Typical timings: breakfast 07:30–09:00, lunch 12:30–14:00, dinner 19:00–21:00
- Day 1: start with arrival transport + accommodation check-in
- Last day: end with departure transport
- Set weatherSensitive: true for open-air markets, beach days, walking tours, etc.
- Use accurate latitude/longitude coordinates

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
  }

  const { messages, trip, agentSettings = DEFAULT_AGENT_SETTINGS } = body

  const settingsPrompt = buildSettingsPrompt(agentSettings)
  const today = new Date().toISOString().split('T')[0]
  const systemPrompt = trip
    ? `${BASE_SYSTEM_PROMPT}${settingsPrompt}\n\n## Current active trip\n\nThe user currently has this trip open. Use its day IDs when patching days.\n\n${JSON.stringify(trip, null, 2)}`
    : `${BASE_SYSTEM_PROMPT}${settingsPrompt}\n\nNo active trip. Today's date: ${today}. Always use action "create_trip".`

  const encoder = new TextEncoder()

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(payload: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const stream = client.messages.stream({
          model: 'claude-opus-4-8',
          max_tokens: 20000,
          thinking: { type: 'adaptive' },
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
