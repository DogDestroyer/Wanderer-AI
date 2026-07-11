'use client'

import { useCallback } from 'react'
import { useStore } from '@/lib/store'
import type { ChatMessage, AgentTripResponse } from '@/lib/types'
import { preserveLockedActivities } from '@/lib/recalculate'
import { showToast } from '@/components/ui/Toast'

import { parseRequestedDays } from '@/lib/tripText'

// ─── useChatSend ──────────────────────────────────────────────────────────────
// Shared send logic used by both the new-trip Wizard and ChatPanel (sidebar).
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
  // Live-build observer actions (no-op unless a build session is active).
  const updateBuild              = useStore((s) => s.updateBuild)
  const bumpBuild                = useStore((s) => s.bumpBuild)
  const endBuild                 = useStore((s) => s.endBuild)

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
      if (tripFields.days) {
        const oldDays = useStore.getState().trips[snapshotActiveTripId]?.days ?? []
        // Backstop: preserve locked activities in any days the agent replaced.
        const patched = preserveLockedActivities(oldDays, tripFields.days)
        // CRITICAL: MERGE the patched days by id into the existing days. A partial
        // patch (a fill batch, or a single-day edit) contains ONLY the affected
        // days — replacing the whole array would collapse the trip to that subset
        // (e.g. a 10-day trip → 3 days after the first fill batch).
        const patchedById = new Map(patched.map((d) => [d.id, d]))
        const merged = oldDays.map((d) => patchedById.get(d.id) ?? d)
        for (const nd of patched) if (!oldDays.some((d) => d.id === nd.id)) merged.push(nd)
        tripFields.days = merged
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
    handlers: { onDelta?: (full: string) => void; onDone?: (resp: AgentTripResponse) => void; onPing?: () => void },
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
          // Keepalive only — its arrival resets the idle watchdog above and
          // proves liveness to the live-build UI (honest heartbeat).
          handlers.onPing?.()
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

  // ── Fill empty days in 2–3 day batches (resilient + resumable) ──────────────
  // Fills each batch of empty days. COMPLETION CONTRACT: a batch is only "done"
  // when its days actually contain activities (not merely "the stream had no
  // error"). BATCH RESILIENCE: a failed batch retries once (feeding the error
  // back for self-correction); if it still fails, those days are marked and the
  // loop CONTINUES with the next batch rather than abandoning the rest. Returns
  // the real completion state so the caller can surface an incomplete plan.
  const fillEmptyDays = useCallback(
    async (tripId: string, preamble: string): Promise<{ complete: boolean; total: number; filled: number }> => {
      const BATCH = 3
      const failed = new Set<string>() // days that failed twice this run — skip so we make progress

      for (let round = 0; round < 80; round++) {
        const trip = useStore.getState().trips[tripId]
        if (!trip) return { complete: false, total: 0, filled: 0 }
        const total = trip.days.length
        const emptyIds = trip.days
          .filter((d) => (!d.activities || d.activities.length === 0) && !failed.has(d.id))
          .map((d) => d.id)
        if (emptyIds.length === 0) break // nothing left to attempt

        const batch = emptyIds.slice(0, BATCH)
        const doneCount = trip.days.filter((d) => d.activities && d.activities.length > 0).length
        const rangeLabel = `days ${doneCount + 1}–${Math.min(doneCount + batch.length, total)} of ${total}`
        // Progress: always visibly partial.
        updateLastAssistantMessage(tripId, `${preamble}\n\n_Building ${rangeLabel}…_`, true)
        // Live-build status line (real pipeline state).
        updateBuild({ statusLine: `Planning ${rangeLabel}…` })

        let batchOk = false
        let lastError: string | null = null
        for (let attempt = 0; attempt < 2 && !batchOk; attempt++) {
          const freshTrip = useStore.getState().trips[tripId]
          const fillMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
            { role: 'user', content: `Generate the activities for these day IDs now: ${batch.join(', ')}.` },
          ]
          // Self-correction: on retry, tell the model exactly what went wrong.
          if (attempt > 0 && lastError) {
            fillMessages.push({ role: 'assistant', content: '(previous attempt was incomplete)' })
            fillMessages.push({
              role: 'user',
              content: `Your previous response ${lastError}. Resend a COMPLETE replace_day_activities patch containing ONLY day IDs ${batch.join(', ')}, each with a full "activities" array. Include the ---WANDR-JSON--- marker on its own line and valid, untruncated JSON.`,
            })
          }
          try {
            const r = await streamOnce(
              { messages: fillMessages, trip: freshTrip, agentSettings, preferences: activePreferences, intent: 'full', mode: 'fill', fillDayIds: batch },
              { onDone: (resp) => applyTripResponse(resp, tripId, tripId, false), onPing: bumpBuild },
            )
            if (r.serverError) { lastError = 'errored on the server'; continue }
            if (r.cutOff) { lastError = 'was cut off before finishing'; continue }
            if (r.jsonError) { lastError = 'contained invalid JSON'; continue }
            // COMPLETION CHECK: did the batch days actually receive activities?
            const after = useStore.getState().trips[tripId]
            const stillEmpty = batch.filter((id) => {
              const d = after?.days.find((x) => x.id === id)
              return !d || !d.activities || d.activities.length === 0
            })
            if (stillEmpty.length === 0) batchOk = true
            else lastError = `did not include activities for day(s) ${stillEmpty.join(', ')}`
          } catch {
            lastError = 'failed to connect'
          }
        }
        // Failed twice → mark these days so we don't retry them forever, and
        // CONTINUE to the next batch (do NOT abandon the remaining days).
        if (!batchOk) {
          batch.forEach((id) => failed.add(id))
          updateBuild({ failedDayIds: [...failed] }) // show retry card in place
        }
      }

      const finalTrip = useStore.getState().trips[tripId]
      const total = finalTrip?.days.length ?? 0
      const emptyRemaining = finalTrip ? finalTrip.days.filter((d) => !d.activities || d.activities.length === 0).length : 0
      return { complete: emptyRemaining === 0, total, filled: total - emptyRemaining }
    },
    [streamOnce, applyTripResponse, updateLastAssistantMessage, agentSettings, activePreferences, updateBuild, bumpBuild],
  )

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
    // Read preferences fresh from the store: the wizard sets draftPreferences and
    // sends in the same tick, so the render-time `activePreferences` closure can
    // be stale. For an edit the active trip's own preferences win.
    const sendPreferences = activeTrip?.preferences ?? useStore.getState().draftPreferences

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
          { messages: baseHistory, trip: null, agentSettings, preferences: sendPreferences, intent: 'full', mode: 'skeleton' },
          { onDelta: (t) => updateLastAssistantMessage(chatId, t), onDone: (resp) => applyTripResponse(resp, chatId, null), onPing: bumpBuild },
        )
        if (skel.serverError) {
          endBuild()
          updateLastAssistantMessage(chatId, 'Sorry, something went wrong — please try again.', false)
          showToast({ message: 'Something went wrong — please try again.', type: 'warning' }); return
        }
        if (skel.cutOff) { endBuild(); handleCutOff(chatId); return }
        if (skel.jsonError) {
          endBuild()
          updateLastAssistantMessage(chatId, skel.jsonError.naturalMessage, false)
          showToast({ message: 'Could not start the plan — please try again.', type: 'warning' }); return
        }

        const newTripId = useStore.getState().activeTripId
        let newTrip     = newTripId ? useStore.getState().trips[newTripId] : null
        // Chat-only reply (vague request) or no days → nothing to fill.
        if (!newTripId || !newTrip || newTrip.days.length === 0) { endBuild(); return }

        // Skeleton landed → move the live build into its construction phase.
        updateBuild({ phase: 'building', statusLine: `Sketching your ${newTrip.days.length} days…` })

        // ── Skeleton validation: day count must match the requested duration ──
        const requestedDays = parseRequestedDays(text)
        if (requestedDays && newTrip.days.length < requestedDays) {
          const had = newTrip.days.length
          const fixMessages = [
            ...baseHistory,
            { role: 'assistant' as const, content: `(skeleton draft had ${had} days)` },
            { role: 'user' as const, content: `That skeleton only had ${had} days, but the trip must be EXACTLY ${requestedDays} days. Regenerate the skeleton with ${requestedDays} correctly-dated days — each with an id, dayTitle, and EMPTY activities.` },
          ]
          await streamOnce(
            { messages: fixMessages, trip: null, agentSettings, preferences: sendPreferences, intent: 'full', mode: 'skeleton' },
            {
              onDone: (resp) => {
                const days = resp.trip?.days
                // Replace days on the SAME trip (don't create a duplicate).
                if (days && days.length > had) {
                  updateTrip(newTripId, { days: days.map((d) => ({ ...d, activities: [] })) })
                }
              },
            },
          ).catch(() => {})
          newTrip = useStore.getState().trips[newTripId] ?? newTrip
        }

        const msgs = useStore.getState().chatHistory[newTripId] ?? []
        const preamble = [...msgs].reverse().find((m) => m.role === 'assistant')?.content
          || 'Here\'s your trip — filling in each day…'

        // ── Phase 2: fill days in batches ───────────────────────────────────
        const result = await fillEmptyDays(newTripId, preamble)
        if (result.complete) {
          updateLastAssistantMessage(newTripId, preamble, false)
        } else {
          const missing = result.total - result.filled
          updateLastAssistantMessage(
            newTripId,
            `${preamble}\n\n_⚠ ${missing} of ${result.total} days didn't finish building. Tap “Resume” on the itinerary to retry them._`,
            false,
          )
          showToast({ message: `${missing} day${missing === 1 ? '' : 's'} didn't finish — tap Resume to retry`, type: 'warning' })
        }
        // ── Live-build completion: restrained finish, then hand off to the
        //    normal (settled) trip view a beat later. ──
        if (useStore.getState().build.active) {
          const done = useStore.getState().trips[newTripId]
          const activityCount = done ? done.days.reduce((n, d) => n + (d.activities?.length ?? 0), 0) : 0
          const status = result.complete
            ? `Your trip is ready · ${result.total} days · ${activityCount} ${activityCount === 1 ? 'activity' : 'activities'}`
            : `Built ${result.filled} of ${result.total} days — ${result.total - result.filled} need a retry`
          updateBuild({ phase: 'complete', statusLine: status })
          // The reveal sequencer (useRevealSequencer) ends the build session once
          // the final day has visually settled. This is only a safety net in case
          // the view unmounted mid-build and the sequencer never finishes.
          setTimeout(() => useStore.getState().endBuild(), 90_000)
        }
        return
      }

      // ── Single-shot path (edits / quick tier) ─────────────────────────────
      const editBody = { messages: baseHistory, trip: activeTrip ?? null, agentSettings, preferences: sendPreferences, intent }
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
    updateBuild, endBuild, bumpBuild,
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
      const result = await fillEmptyDays(tripId, preamble)
      if (result.complete) {
        updateLastAssistantMessage(tripId, preamble, false)
      } else {
        const missing = result.total - result.filled
        updateLastAssistantMessage(tripId, `${preamble}\n\n_⚠ ${missing} of ${result.total} days still need activities — tap “Resume” to retry._`, false)
        showToast({ message: `${missing} day${missing === 1 ? '' : 's'} still didn't finish — tap Resume again`, type: 'warning' })
      }
    } finally {
      setIsGenerating(false)
    }
  }, [fillEmptyDays, setIsGenerating, updateLastAssistantMessage])

  return { sendMessage, isGenerating, messages, chatKey, resumeFill }
}
