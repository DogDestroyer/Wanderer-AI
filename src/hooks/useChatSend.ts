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
  ) => {
    // Update message BEFORE createTrip so the '__new__' key migration captures it
    updateLastAssistantMessage(chatId, response.message, false)

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

  // ── Core send function ───────────────────────────────────────────────────────
  // `intent` selects the model tier on the server: 'full' (default) uses Sonnet
  // for full trip generation; 'quick' uses the faster Haiku for small partial
  // edits (assumption-chip corrections, single-day tweaks, preference re-plans).
  const sendMessage = useCallback(async (text: string, intent: 'full' | 'quick' = 'full') => {
    if (!text.trim() || isGenerating) return

    const chatId              = activeTripId ?? '__new__'
    const snapshotActiveTripId = activeTripId

    // Add user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(chatId, userMessage)
    setIsGenerating(true)

    // Add empty assistant placeholder
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }
    addChatMessage(chatId, assistantMessage)

    const baseHistory = [...messages, userMessage].map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // ── Inner stream processor ─────────────────────────────────────────────────
    async function runStream(
      messagesToSend: Array<{ role: 'user' | 'assistant'; content: string }>
    ) {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesToSend,
          trip: activeTrip ?? null,
          agentSettings,
          preferences: activePreferences,
          intent,
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

      // Guard against the proxy redirecting to the login page — in that case the
      // fetch follows the redirect, gets back HTML with a 200 status, and res.ok
      // is true even though we never reached the API route. Detect by Content-Type.
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
      // Did the server send a terminal event ('done' or 'error')? If the stream
      // ends without one, the function was cut off mid-response and we must NOT
      // silently swallow it.
      let receivedTerminal = false

      // Inactivity watchdog: the server heartbeats every 10s, so a healthy
      // generation never goes quiet. If NOTHING (not even a ping) arrives for
      // 30s, the connection is genuinely dead — abort and surface the interrupted
      // state instead of hanging forever.
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
          // Idle timeout — treat as a cut stream (handled by the caller as interrupted).
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
            updateLastAssistantMessage(chatId, streamedText)
          } else if (payload.type === 'ping') {
            // Keepalive only — its arrival resets the idle watchdog above.
          } else if (payload.type === 'done') {
            receivedTerminal = true
            applyTripResponse(payload.response, chatId, snapshotActiveTripId)
          } else if (payload.type === 'json_error') {
            jsonError = { naturalMessage: payload.naturalMessage }
          } else if (payload.type === 'error') {
            receivedTerminal = true
            updateLastAssistantMessage(chatId, 'Sorry, something went wrong — please try again.', false)
          }
        }
      }
      // Stream closed cleanly but we never got a 'done'/'error'/'json_error':
      // the response was truncated. Signal a cut so the caller surfaces it.
      const cutOff = !receivedTerminal && !jsonError
      return { jsonError, cutOff }
    }

    // Shown when the AI response is truncated before completing (most often a
    // serverless function timeout). A toast is used because it renders even from
    // the pre-trip hero screen, where the chat panel isn't mounted.
    function handleCutOff() {
      updateLastAssistantMessage(
        chatId,
        'The response was cut off before it finished — this usually means the request took too long. Please try again.',
        false,
      )
      showToast({ message: 'The plan took too long to generate — please try again.', type: 'warning' })
    }

    try {
      // ── First attempt ─────────────────────────────────────────────────────
      const { jsonError, cutOff } = await runStream(baseHistory)

      if (cutOff) {
        // A retry would almost certainly time out the same way — fail loudly instead.
        handleCutOff()
      } else if (jsonError) {
        // ── Auto-retry once with failure context ──────────────────────────
        const naturalMsg = jsonError.naturalMessage
        updateLastAssistantMessage(chatId, naturalMsg + '\n\n*(Applying your plan…)*', false)
        showToast({ message: 'Applying your plan…', type: 'info' })

        const retryHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...baseHistory,
          { role: 'assistant', content: naturalMsg },
          {
            role: 'user',
            content:
              'Your previous response was cut off before the JSON block. Please resend the complete response — include the ---WANDR-JSON--- marker on its own line and the full JSON object with all days and activities. Do not truncate.',
          },
        ]

        const { jsonError: retryError, cutOff: retryCutOff } = await runStream(retryHistory)

        if (retryCutOff) {
          handleCutOff()
        } else if (retryError) {
          updateLastAssistantMessage(chatId, retryError.naturalMessage, false)
          showToast({ message: 'Plan generated but could not be applied — please try again.', type: 'warning' })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sorry, I couldn't connect to the AI. Please try again."
      updateLastAssistantMessage(chatId, msg, false)
      // Surface via toast too — visible even from the hero screen where the chat
      // panel (and thus the message bubble) isn't rendered.
      showToast({ message: msg, type: 'warning' })
    } finally {
      setIsGenerating(false)
    }
  }, [
    isGenerating, activeTripId, activeTrip, messages, agentSettings,
    activePreferences, applyTripResponse, addChatMessage,
    updateLastAssistantMessage, setIsGenerating,
  ])

  return { sendMessage, isGenerating, messages, chatKey }
}
