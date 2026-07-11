// ─── Agent JSON extraction ────────────────────────────────────────────────────
// Extract the first balanced JSON object from a string, ignoring any trailing
// prose the model may append after it. Faster models (Haiku) sometimes add a
// stray sentence after the JSON, which breaks a naive JSON.parse of the whole
// remainder. This scans brace depth while respecting string literals/escapes so
// we recover the valid object instead of failing the entire generation.

export function extractJsonObject(text: string): string | null {
  const startIdx = text.indexOf('{')
  if (startIdx === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; continue }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(startIdx, i + 1)
    }
  }
  return null // unbalanced — genuinely truncated
}
