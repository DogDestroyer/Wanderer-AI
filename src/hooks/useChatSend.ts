'use client'

import { useCallback } from 'react'
import { useStore } from '@/lib/store'
import type { ChatMessage, AgentTripResponse } from '@/lib/types'
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
      createTrip(trip)
    } else if (action === 'replace_trip' && trip && snapshotActiveTripId) {
      const { id: _id, createdAt: _ca, ...rest } = trip
      updateTrip(snapshotActiveTripId, rest as Partial<import('@/lib/types').TripPlan>)
    } else if (
      (action === 'replace_day_activities' || action === 'update_trip_meta' || action === 'patch') &&
      patch && snapshotActiveTripId
    ) {
      const { tripId: _tid, dayIds: _dids, ...tripFields } = patch
      updateTrip(snapshotActiveTripId, tripFields as Partial<import('@/lib/types').TripPlan>)
    }
    // 'chat-only' — nothing to update
  }, [createTrip, updateTrip, updateLastAssistantMessage])

  // ── Core send function ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
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
        }),
      })

      if (!res.ok || !res.body) throw new Error(`Server error: ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer       = ''
      let streamedText = ''

      type StreamPayload =
        | { type: 'delta';      text: string }
        | { type: 'done';       response: AgentTripResponse }
        | { type: 'error';      message: string }
        | { type: 'json_error'; naturalMessage: string; parseError?: string }

      let jsonError: { naturalMessage: string } | null = null

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
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
          } else if (payload.type === 'done') {
            applyTripResponse(payload.response, chatId, snapshotActiveTripId)
          } else if (payload.type === 'json_error') {
            jsonError = { naturalMessage: payload.naturalMessage }
          } else if (payload.type === 'error') {
            updateLastAssistantMessage(chatId, 'Sorry, something went wrong — please try again.', false)
          }
        }
      }
      return jsonError
    }

    try {
      // ── First attempt ─────────────────────────────────────────────────────
      const jsonError = await runStream(baseHistory)

      if (jsonError) {
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

        const retryError = await runStream(retryHistory)

        if (retryError) {
          updateLastAssistantMessage(chatId, retryError.naturalMessage, false)
          showToast({ message: 'Plan generated but could not be applied — please try again.', type: 'warning' })
        }
      }
    } catch {
      updateLastAssistantMessage(chatId, "Sorry, I couldn't connect to the AI. Please try again.", false)
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
