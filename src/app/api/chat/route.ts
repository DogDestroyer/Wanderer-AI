import Anthropic from '@anthropic-ai/sdk'
import type { TripPlan, AgentTripResponse } from '@/lib/types'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── System prompt ─────────────────────────────────────────────────────────────
// Instructs Claude to respond as Wandr and emit a structured JSON block at the end
// of every response so the frontend can apply trip changes.

const BASE_SYSTEM_PROMPT = `You are Wandr, an expert AI travel planning assistant. Your job is to help users create detailed, realistic, day-by-day travel itineraries.

## Tone
Be warm, enthusiastic, and specific. Name real places. Use concrete times and costs.

## Response format — STRICT

Every response has exactly two parts:

**Part 1** — A short conversational message (1–3 sentences). This is what the user sees as you type.

**Part 2** — On its own line, the literal marker:
---WANDR-JSON---
Immediately followed by a single JSON object (no markdown fences) that matches the AgentTripResponse schema below.

Do NOT include any text after the JSON object.

## AgentTripResponse schema

{
  "action": "create" | "patch" | "chat-only",
  "message": "<same text as Part 1>",
  "trip": { ... },                          // only when action = "create"
  "patch": { ... },                         // only when action = "patch"
  "clarifyingQuestions": ["..."]            // optional, for chat-only when you need more info
}

### action values
- **"create"** — user wants a new trip and has given enough info (destination + rough duration).
- **"patch"** — user wants to modify an existing trip.
- **"chat-only"** — conversational reply, no plan change (questions, unclear requests, etc.).

## TripPlan (for action: "create")

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
- 5–8 activities per day for a balanced pace
- Group nearby locations together to minimise travel
- Typical timings: breakfast 07:30–09:00, lunch 12:30–14:00, dinner 19:00–21:00
- Day 1: start with arrival transport + accommodation check-in
- Last day: end with departure transport
- Set weatherSensitive: true for open-air markets, beach days, walking tours, etc.
- Use accurate latitude/longitude coordinates

## AgentTripPatch (for action: "patch")

{
  "tripId": "trip_abc12345",
  "name": "Updated Name",         // optional
  "days": [ /* replaced days */ ],// optional — full replacement of affected days
  "dayIds": ["day_abc123"],       // list of day IDs that changed
  "budget": { ... },              // optional
  "preferences": { ... }          // optional
}`

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    trip?: TripPlan | null
  }

  const { messages, trip } = body

  // Inject current trip as extra context when one exists
  const systemPrompt = trip
    ? `${BASE_SYSTEM_PROMPT}\n\n## Current trip the user is editing\n${JSON.stringify(trip, null, 2)}`
    : `${BASE_SYSTEM_PROMPT}\n\nToday's date: ${new Date().toISOString().split('T')[0]}`

  const encoder = new TextEncoder()

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      function send(payload: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      try {
        const stream = client.messages.stream({
          model: 'claude-opus-4-8',
          max_tokens: 8000,
          thinking: { type: 'adaptive' },
          system: systemPrompt,
          messages,
        })

        let fullText = ''
        let visibleText = ''  // text shown to user before the JSON marker
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
                // Marker not yet seen — stream this chunk to the client
                visibleText += chunk
                send({ type: 'delta', text: chunk })
              } else {
                // Marker found in this chunk — send any remaining visible text before the marker
                markerFound = true
                const newVisible = fullText.slice(visibleText.length, markerIdx)
                if (newVisible) {
                  visibleText += newVisible
                  send({ type: 'delta', text: newVisible })
                }
              }
            }
            // After marker is found, keep accumulating fullText silently (building JSON)
          }
        }

        // ── Parse the structured JSON block ────────────────────────────────────
        const MARKER = '---WANDR-JSON---'
        const markerIdx = fullText.indexOf(MARKER)
        let agentResponse: AgentTripResponse

        if (markerIdx !== -1) {
          const jsonStr = fullText.slice(markerIdx + MARKER.length).trim()
          const naturalMessage = fullText.slice(0, markerIdx).trim()
          try {
            agentResponse = JSON.parse(jsonStr) as AgentTripResponse
            // Prefer the streamed natural-language text as the displayed message
            if (naturalMessage) agentResponse.message = naturalMessage
          } catch {
            agentResponse = { action: 'chat-only', message: naturalMessage || fullText.trim() }
          }
        } else {
          agentResponse = { action: 'chat-only', message: fullText.trim() }
        }

        send({ type: 'done', response: agentResponse })
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
