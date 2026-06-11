import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text?.trim()) return Response.json({ enhanced: text })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 300,
    system: `You are a travel planning assistant. The user has written a rough, messy trip idea — maybe just a list of things, half-sentences, or random notes. Your job is to rewrite it as one clear, enthusiastic trip planning request (2–3 sentences max).

Rules:
- Include destination, duration, dates, and key interests — but ONLY what the user mentioned
- Do not invent or assume any details they didn't provide
- Keep it natural and conversational, as if a real person typed it
- Output ONLY the rewritten prompt — no preamble, no explanation, no quotes`,
    messages: [{ role: 'user', content: text }],
  })

  const enhanced =
    message.content[0].type === 'text' ? message.content[0].text.trim() : text

  return Response.json({ enhanced })
}
