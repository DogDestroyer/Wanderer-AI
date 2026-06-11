import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const text: string | undefined = body?.text

    if (!text?.trim()) {
      return Response.json({ enhanced: text ?? '' })
    }

    const message = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 300,
      thinking: { type: 'adaptive' },
      system: `You are a travel planning assistant. The user has written a rough, messy trip idea — maybe just a list of things, half-sentences, or random notes. Your job is to rewrite it as one clear, enthusiastic trip planning request (2–3 sentences max).

Rules:
- Include destination, duration, dates, and key interests — but ONLY what the user mentioned
- Do not invent or assume any details they did not provide
- Keep it natural and conversational, as if a real person typed it
- Output ONLY the rewritten prompt — no preamble, no explanation, no quotes`,
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
