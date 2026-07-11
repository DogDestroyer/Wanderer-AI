import Anthropic from '@anthropic-ai/sdk'
import type { TripPlan } from '@/lib/types'
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rateLimit'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// ─── Build a compact trip-context block to inject into the system prompt ───────

function buildTripContext(trip: TripPlan | null | undefined): string {
  if (!trip) {
    return 'No existing trip — the user is planning from scratch.'
  }
  const lines: string[] = [
    `Destination: ${trip.destination.name}, ${trip.destination.country}`,
    `Dates: ${trip.startDate} to ${trip.endDate} (${trip.days.length} days)`,
  ]
  if (trip.budget.cap > 0) {
    lines.push(`Budget cap: ${trip.budget.cap} ${trip.budget.currency}`)
  }
  if (trip.preferences) {
    const { paceLevel, budgetLevel, interests } = trip.preferences
    if (paceLevel  !== undefined) lines.push(`Pace level: ${paceLevel}/100 (0 = very relaxed, 100 = packed)`)
    if (budgetLevel !== undefined) lines.push(`Budget style: ${budgetLevel}/100 (0 = shoestring, 100 = luxury)`)
    if (interests?.length)         lines.push(`Stated interests: ${interests.join(', ')}`)
  }
  return lines.join('\n')
}

// ─── Build the full system prompt with dynamic trip context ────────────────────

function buildSystemPrompt(trip: TripPlan | null | undefined): string {
  const tripContext = buildTripContext(trip)

  return `You are a prompt enhancement specialist for a travel planning agent. You transform short, vague trip requests into rich, detailed, actionable planning briefs that give the AI planner everything it needs to build an exceptional itinerary.

## What an enhanced prompt MUST include

- Destination specifics: major neighbourhoods to explore, recommended base area, cultural or geographic context relevant to the trip style
- Traveller profile: who is going (solo, couple, group, family), travel style and energy level, any relevant experience or preferences
- Concrete budget framing: not just "budget" or "luxury" — specific per-person daily targets, what they're willing to splurge on versus save on
- Pacing preferences: how many activities per day, depth versus breadth, morning versus evening energy, rest days
- Dining style: types of cuisine, street food versus restaurants, specific food interests, meal structure preferences
- Must-include constraints: non-negotiable landmarks, experiences, neighbourhoods, or cultural moments
- Must-avoid constraints: tourist traps, dietary restrictions, overly crowded venues, physically demanding activities
- Practical logistics: transport between areas, ideal accommodation zone, known seasonal or opening-day pitfalls, weather contingency suggestions

The enhanced prompt should be 5–10× more specific than the input. Every detail the user provided must be preserved faithfully and never contradicted. Where the user was silent, fill in plausible, reasonable detail — weave it naturally so it reads as one coherent brief.

## Existing trip context

Use these facts if provided. Do not invent details that contradict them.

${tripContext}

## Few-shot examples

### Example 1

Input: plan me a trip to tokyo

Enhanced:
Plan a 7-day trip to Tokyo for a curious solo traveller who wants an equal mix of ancient tradition and hyper-modern culture. Base the itinerary in Shinjuku or Shibuya for central access, with at least one early morning in Asakusa to reach Senso-ji Temple before the tour groups arrive. Budget: around $120–150 USD per person per day covering accommodation, food, and entry fees — willing to spend up to $80 on one exceptional omakase or tasting counter dinner, but preferring ramen shops, standing sushi bars, and neighbourhood izakayas for everyday meals. Pace: moderate throughout — two or three distinct experiences per day, never rushed, with unhurried mornings and long evenings left open for wandering and discovery. Must include: teamLab Planets or Borderless, a full day trip to Kamakura (Great Buddha plus Hase-dera, arriving before 10am), a morning in Yanaka for old-shitamachi atmosphere, and at least one evening deep in Golden Gai. Avoid overpackaged tourist experiences, large bus tours, and Takeshita Street on weekends. Travelling late April — cherry blossom season may be winding down, so build in crowd and weather contingencies for outdoor spots. Note that most major shrines are significantly busier on Sundays and Tsukiji outer market vendors typically close by noon, so plan the market visit on a weekday morning. Include one rest afternoon with no fixed agenda.

---

### Example 2

Input: romantic weekend, not too expensive

Enhanced:
Plan a romantic 3-day, 2-night city escape for a couple in their early 30s — the priority is atmosphere and time together, not a packed sightseeing checklist. Budget: $200–280 per person total for the full trip including accommodation; prefer a boutique hotel or a well-reviewed Airbnb in a neighbourhood with real character — cobblestone streets, independent cafés, evening energy — rather than the central tourist core. Dining is the heart of the trip: one dinner that genuinely feels special without being stiff (a small-plates restaurant, a candlelit neighbourhood trattoria, or a rooftop with views worth the price), relaxed lunches at local spots, and one slow morning dedicated entirely to a good bakery or weekend food market. Pace: unhurried throughout — no more than one anchor experience per half-day, with deliberate gaps left open to linger over coffee and wander wherever mood takes them. Must include one experience that feels authentically local and not obviously touristic — a Sunday market, an independent bookshop, a small neighbourhood gallery or a quiet viewpoint the guidebooks underrate. Avoid anything that feels like a checklist, overexposed photo-op locations, and back-to-back bookings that remove spontaneity. Build a completely unscheduled late-morning slot on Day 2 — just good coffee and wherever the day leads. Consider proximity of accommodation to a pleasant evening neighbourhood so they can step outside after dinner without needing transport.

---

## Output rules

Return ONLY the enhanced prompt text. No preamble, no label like "Here is your enhanced prompt:", no markdown headers, no quotation marks wrapping the output. Write in natural, first-person planning language as if the user composed it themselves after careful thought. Minimum 150 words.`
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    // Rate limit before any model work (this route runs the priciest model).
    const rl = rateLimit(`enhance:${clientIp(req)}`, 10, 5 * 60_000)
    if (!rl.ok) return tooManyRequests(rl.retryAfterMs)

    const body = await req.json().catch(() => null)
    const text: string | undefined = body?.text
    const trip: TripPlan | null | undefined = body?.trip

    if (!text?.trim()) {
      return Response.json({ enhanced: text ?? '' })
    }
    // A prompt to enhance is a short paragraph; anything huge is abuse/bug.
    if (text.length > 10_000) {
      return Response.json({ error: 'Text too long.' }, { status: 413 })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1500,
      thinking: { type: 'adaptive' },
      system: buildSystemPrompt(trip),
      messages: [{ role: 'user', content: text }],
    })

    const textBlock = message.content.find((b) => b.type === 'text')
    const enhanced = textBlock?.type === 'text' ? textBlock.text.trim() : text

    return Response.json({ enhanced })
  } catch (err) {
    console.error('[/api/enhance]', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return Response.json({ error: message }, { status: 500 })
  }
}
