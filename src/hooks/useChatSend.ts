'use client'

import { useCallback } from 'react'
import { useStore } from '@/lib/store'
import type { ChatMessage, AgentTripResponse } from '@/lib/types'
import { preserveLockedActivities } from '@/lib/recalculate'
import { showToast } from '@/components/ui/Toast'

// ─── useChatSend ──────────────────────────────────────────────────────────────
// Shared send logic used by both HeroLayout (empty state) and ChatPanel (sidebar).
// Handles streaming, JSON parsing, auto-retry, and all trip-mutation actions.

export function useChatSend() {
  const activeTripId   = useStore((s) => s.activeTripId)
  const trips          = useStore((s) => s.trips)
  const chatHistory    = useStore((s) => s.chatHistory)
  const isGenerating   = useStore((s) => s.isGenerating)
  const agentSettings  = useStore((s) => s.agentSettings)
  const draftPreferences = useStore((s) => s.draftPreferences)

  const addChatMessage           = useStore((s) => s.addChatMessage)
  const updateLastAssistantMessage = useStore((s) => s.updateLastAssistantMessage)
  const setIsGenerating          = useStore((s) => s.setIsGenerating)
  const createTrip               = useStore((s) => s.createTrip)
  const updateTrip               = useStore((s) => s.updateTrip)
  const setUserDefaults          = useStore((s) => s.setUserDefaults)

  const activeTrip  = activeTripId ? trips[activeTripId] : null
  const chatKey     = activeTripId ?? '__new__'
  const messages: ChatMessage[] = chatHistory[chatKey] ?? []

  // Determines which preferences to send — trip's own prefs if exists, else draft
  const activePreferences = activeTrip?.preferences ?? draftPreferences

  // ── Apply a completed response to the store ─────────────────────────────────
  const applyTripResponse = useCallback((
    response: AgentTripResponse,
    chatId: string,
    snapshotActiveTripId: string | null,
    updateMessage = true,
  ) => {
    // Update message BEFORE createTrip so the '__new__' key migration captures it.
    // Fill batches pass updateMessage=false so they don't clobber the skeleton's preamble.
    if (updateMessage) updateLastAssistantMessage(chatId, response.message, false)

    const { action, trip, patch } = response

    if ((action === 'create_trip' || action === 'create') && trip) {
      // Attach assumptions to the trip object before saving
      const tripWithAssumptions = response.assumptions?.length
        ? { ...trip, assumptions: response.assumptions }
        : trip
      createTrip(tripWithAssumptions)
      // Remember this trip's preferences as the user's defaults for future sessions
      setUserDefaults(trip.preferences)
    } else if (action === 'replace_trip' && trip && snapshotActiveTripId) {
      const { id: _id, createdAt: _ca, ...rest } = trip
      // Backstop: never let the agent alter or drop locked activities.
      const oldDays = useStore.getState().trips[snapshotActiveTripId]?.days ?? []
      const safeRest = rest.days
        ? { ...rest, days: preserveLockedActivities(oldDays, rest.days) }
        : rest
      const patchWithAssumptions = response.assumptions?.length
        ? { ...safeRest, assumptions: response.assumptions }
        : safeRest
      updateTrip(snapshotActiveTripId, patchWithAssumptions as Partial<import('@/lib/types').TripPlan>)
      setUserDefaults(trip.preferences)
    } else if (
      (action === 'replace_day_activities' || action === 'update_trip_meta' || action === 'patch') &&
      patch && snapshotActiveTripId
    ) {
      const { tripId: _tid, dayIds: _dids, ...tripFields } = patch
      // Backstop: preserve locked activities in any days the agent replaced.
      if (tripFields.days) {
        const oldDays = useStore.getState().trips[snapshotActiveTripId]?.days ?? []
        tripFields.days = preserveLockedActivities(oldDays, tripFields.days)
      }
      updateTrip(snapshotActiveTripId, tripFields as Partial<import('@/lib/types').TripPlan>)
    }
    // 'chat-only' — nothing to update
  }, [createTrip, updateTrip, updateLastAssistantMessage, setUserDefaults])

  // ── Low-level stream processor ──────────────────────────────────────────────
  // POSTs one request and processes its heartbeat-aware SSE stream. Reused for
  // single-shot edits, the skeleton request, and each fill batch.
  const streamOnce = useCallback(async (
    body: Record<string, unknown>,
    handlers: { onDelta?: (full: string) => void; onDone?: (resp: AgentTripResponse) => void },
  ): Promise<{ jsonError: { naturalMessage: string } | null; cutOff: boolean; serverError: string | null }> => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

    // Guard against the proxy redirecting to /login (HTML with a 200 status).
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream')) {
      throw new Error(
        res.status === 401 || res.status === 403
          ? 'Session expired — please refresh the page and log in again.'
          : 'Could not reach the AI server — please refresh and try again.'
      )
    }

    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer       = ''
    let streamedText = ''

    type StreamPayload =
      | { type: 'delta';      text: string }
      | { type: 'ping';       elapsedMs: number }
      | { type: 'done';       response: AgentTripResponse }
      | { type: 'error';      message: string }
      | { type: 'json_error'; naturalMessage: string; parseError?: string }

    let jsonError: { naturalMessage: string } | null = null
    let serverError: string | null = null
    let receivedTerminal = false

    // Inactivity watchdog: the server heartbeats every 10s, so a healthy
    // generation never goes quiet. If NOTHING (not even a ping) arrives for 30s,
    // the connection is genuinely dead — abort and surface the interrupted state.
    const IDLE_MS = 30_000
    async function readWithTimeout(): Promise<ReadableStreamReadResult<Uint8Array>> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The connection went quiet — the response was interrupted.')), IDLE_MS)
      })
      try {
        return await Promise.race([reader.read(), timeout])
      } finally {
        clearTimeout(timer)
      }
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>
      try {
        result = await readWithTimeout()
      } catch (idleErr) {
        reader.cancel().catch(() => {})
        throw idleErr
      }
      const { done, value } = result
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = JSON.parse(line.slice(6)) as StreamPayload

        if (payload.type === 'delta') {
          streamedText += payload.text
          handlers.onDelta?.(streamedText)
        } else if (payload.type === 'ping') {
          // Keepalive only — its arrival resets the idle watchdog above.
        } else if (payload.type === 'done') {
          receivedTerminal = true
          handlers.onDone?.(payload.response)
        } else if (payload.type === 'json_error') {
          jsonError = { naturalMessage: payload.naturalMessage }
        } else if (payload.type === 'error') {
          receivedTerminal = true
          serverError = payload.message
        }
      }
    }
    // Closed without a terminal event → truncated. Signal a cut.
    const cutOff = !receivedTerminal && !jsonError && !serverError
    return { jsonError, cutOff, serverError }
  }, [])

  // ── Fill empty days in 2–3 day batches (resumable) ──────────────────────────
  // Repeatedly finds days with no activities and fills the next batch. Reading
  // the fresh trip from the store each round makes this naturally resumable: it
  // simply continues from wherever it was interrupted. Returns true when every
  // day has activities.
  const fillEmptyDays = useCallback(async (tripId: string, preamble: string): Promise<boolean> => {
    const BATCH = 3
    // Guard caps total rounds (≈ very large trips) to avoid any infinite loop.
    for (let round = 0; round < 60; round++) {
      const trip = useStore.getState().trips[tripId]
      if (!trip) return false
      const emptyIds = trip.days.filter((d) => !d.activities || d.activities.length === 0).map((d) => d.id)
      if (emptyIds.length === 0) return true

      const batch = emptyIds.slice(0, BATCH)
      const filled = trip.days.length - emptyIds.length
      updateLastAssistantMessage(tripId, `${preamble}\n\n_Adding activities… ${filled}/${trip.days.length} days_`, true)

      // One automatic retry per batch (heartbeats make idle failures rare).
      let ok = false
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        const freshTrip = useStore.getState().trips[tripId]
        try {
          const r = await streamOnce(
            {
              messages: [{ role: 'user', content: `Generate the activities for these day IDs now: ${batch.join(', ')}.` }],
              trip: freshTrip,
              agentSettings,
              preferences: activePreferences,
              intent: 'full',
              mode: 'fill',
              fillDayIds: batch,
            },
            { onDone: (resp) => applyTripResponse(resp, tripId, tripId, false) },
          )
          if (!r.cutOff && !r.jsonError && !r.serverError) ok = true
        } catch {
          // network/idle error — retry once, else bail to resume affordance
        }
      }
      if (!ok) return false
    }
    return false
  }, [streamOnce, applyTripResponse, updateLastAssistantMessage, agentSettings, activePreferences])

  // ── Core send function ───────────────────────────────────────────────────────
  // `intent` selects the model tier on the server: 'full' (default) uses Sonnet,
  // 'quick' uses the faster Haiku for small partial edits.
  //
  // For a BRAND-NEW trip we generate in two phases (Plan B): a fast SKELETON
  // (structure + dated days, no activities) renders immediately, then activities
  // are filled in 2–3 day batches. Each request is small, so monster trips never
  // approach the 300s function cap and the plan visibly fills in.
  const sendMessage = useCallback(async (text: string, intent: 'full' | 'quick' = 'full') => {
    if (!text.trim() || isGenerating) return

    const chatId               = activeTripId ?? '__new__'
    const snapshotActiveTripId = activeTripId

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date().toISOString(),
    }
    addChatMessage(chatId, userMessage)
    setIsGenerating(true)

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true,
    }
    addChatMessage(chatId, assistantMessage)

    const baseHistory = [...messages, userMessage].map((m) => ({
      role: m.role as 'user' | 'assistant', content: m.content,
    }))

    function handleCutOff(targetChatId: string) {
      updateLastAssistantMessage(
        targetChatId,
        'The response was cut off before it finished — this usually means the request took too long. Please try again.',
        false,
      )
      showToast({ message: 'The plan took too long to generate — please try again.', type: 'warning' })
    }

    try {
      const creatingNewTrip = !snapshotActiveTripId && intent === 'full'

      if (creatingNewTrip) {
        // ── Phase 1: skeleton (fast structure, empty days) ──────────────────
        const skel = await streamOnce(
          { messages: baseHistory, trip: null, agentSettings, preferences: activePreferences, intent: 'full', mode: 'skeleton' },
          { onDelta: (t) => updateLastAssistantMessage(chatId, t), onDone: (resp) => applyTripResponse(resp, chatId, null) },
        )
        if (skel.serverError) {
          updateLastAssistantMessage(chatId, 'Sorry, something went wrong — please try again.', false)
          showToast({ message: 'Something went wrong — please try again.', type: 'warning' }); return
        }
        if (skel.cutOff) { handleCutOff(chatId); return }
        if (skel.jsonError) {
          updateLastAssistantMessage(chatId, skel.jsonError.naturalMessage, false)
          showToast({ message: 'Could not start the plan — please try again.', type: 'warning' }); return
        }

        const newTripId = useStore.getState().activeTripId
        const newTrip   = newTripId ? useStore.getState().trips[newTripId] : null
        // Chat-only reply (vague request) or no days → nothing to fill.
        if (!newTripId || !newTrip || newTrip.days.length === 0) return

        const msgs = useStore.getState().chatHistory[newTripId] ?? []
        const preamble = [...msgs].reverse().find((m) => m.role === 'assistant')?.content
          || 'Here\'s your trip — filling in each day…'

        // ── Phase 2: fill days in batches ───────────────────────────────────
        const ok = await fillEmptyDays(newTripId, preamble)
        if (ok) {
          updateLastAssistantMessage(newTripId, preamble, false)
        } else {
          updateLastAssistantMessage(newTripId, `${preamble}\n\n_Some days still need activities — tap “Resume” on the itinerary to finish._`, false)
          showToast({ message: 'Some days didn\'t finish — tap Resume to complete them.', type: 'warning' })
        }
        return
      }

      // ── Single-shot path (edits / quick tier) ─────────────────────────────
      const editBody = { messages: baseHistory, trip: activeTrip ?? null, agentSettings, preferences: activePreferences, intent }
      const { jsonError, cutOff, serverError } = await streamOnce(editBody, {
        onDelta: (t) => updateLastAssistantMessage(chatId, t),
        onDone: (resp) => applyTripResponse(resp, chatId, snapshotActiveTripId),
      })

      if (serverError) {
        updateLastAssistantMessage(chatId, 'Sorry, something went wrong — please try again.', false)
        showToast({ message: 'Something went wrong — please try again.', type: 'warning' })
      } else if (cutOff) {
        handleCutOff(chatId)
      } else if (jsonError) {
        const naturalMsg = jsonError.naturalMessage
        updateLastAssistantMessage(chatId, naturalMsg + '\n\n*(Applying your plan…)*', false)
        showToast({ message: 'Applying your plan…', type: 'info' })

        const retryHistory = [
          ...baseHistory,
          { role: 'assistant' as const, content: naturalMsg },
          { role: 'user' as const, content: 'Your previous response was cut off before the JSON block. Please resend the complete response — include the ---WANDR-JSON--- marker on its own line and the full JSON object with all days and activities. Do not truncate.' },
        ]
        const retry = await streamOnce(
          { ...editBody, messages: retryHistory },
          { onDone: (resp) => applyTripResponse(resp, chatId, snapshotActiveTripId) },
        )
        if (retry.cutOff) {
          handleCutOff(chatId)
        } else if (retry.jsonError) {
          updateLastAssistantMessage(chatId, retry.jsonError.naturalMessage, false)
          showToast({ message: 'Plan generated but could not be applied — please try again.', type: 'warning' })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sorry, I couldn't connect to the AI. Please try again."
      updateLastAssistantMessage(chatId, msg, false)
      showToast({ message: msg, type: 'warning' })
    } finally {
      setIsGenerating(false)
    }
  }, [
    isGenerating, activeTripId, activeTrip, messages, agentSettings,
    activePreferences, applyTripResponse, addChatMessage,
    updateLastAssistantMessage, setIsGenerating, streamOnce, fillEmptyDays,
  ])

  // ── Resume an interrupted chunked generation ────────────────────────────────
  // Fills any days that are still empty (after a batch failed). Wired to the
  // "Resume" affordance on the itinerary.
  const resumeFill = useCallback(async (tripId: string) => {
    if (useStore.getState().isGenerating) return
    const trip = useStore.getState().trips[tripId]
    if (!trip || !trip.days.some((d) => !d.activities || d.activities.length === 0)) return
    setIsGenerating(true)
    try {
      const msgs = useStore.getState().chatHistory[tripId] ?? []
      const raw = [...msgs].reverse().find((m) => m.role === 'assistant')?.content || 'Finishing your itinerary…'
      const preamble = raw.split('\n\n_')[0] // strip any prior progress/resume note
      const ok = await fillEmptyDays(tripId, preamble)
      updateLastAssistantMessage(
        tripId,
        ok ? preamble : `${preamble}\n\n_Some days still need activities — tap “Resume” to finish._`,
        false,
      )
      if (!ok) showToast({ message: 'Some days still didn\'t finish — tap Resume again.', type: 'warning' })
    } finally {
      setIsGenerating(false)
    }
  }, [fillEmptyDays, setIsGenerating, updateLastAssistantMessage])

  return { sendMessage, isGenerating, messages, chatKey, resumeFill }
}
