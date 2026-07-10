'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'
import { useWeather } from '@/hooks/useWeather'
import { ToastContainer } from '@/components/ui/Toast'
import { Header } from './Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Wizard } from '@/components/wizard/Wizard'
import { ItineraryView } from '@/components/itinerary/ItineraryView'

// ─── AppShell ─────────────────────────────────────────────────────────────────
// Controls the app's top-level modes:
//   • Wizard — full-screen new-trip planning wizard (replaces the old hero)
//   • Normal — active trip, itinerary + chat sidebar
//
// A brand-new trip is started through the wizard (auto-opened on a fresh start,
// or via Header "New trip"). Everything below the wizard — itinerary, tabs,
// chat, live data — is unchanged.

export function AppShell() {
  const hasHydrated  = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const isGenerating = useStore((s) => s.isGenerating)
  const chatHistory  = useStore((s) => s.chatHistory)
  const wizardActive = useStore((s) => s.wizard.active)
  const startWizard  = useStore((s) => s.startWizard)
  const activeTrip   = activeTripId ? trips[activeTripId] : null

  // chatOpen: sidebar visibility in normal mode
  const [chatOpen, setChatOpen] = useState(true)

  // A pre-trip conversation that exists but never produced a trip (e.g. a dropped
  // stream). We must NOT silently reset — show a clear "interrupted, retry" state.
  const newChatMsgs = chatHistory['__new__'] ?? []
  const hasPendingNewChat = newChatMsgs.length > 0

  // A genuinely fresh start — no trip, nothing generating or interrupted. This is
  // where the wizard belongs, so we auto-open it (the wizard IS the new-trip flow).
  const isFreshStart = hasHydrated && !activeTripId && !isGenerating && !hasPendingNewChat

  // Weather hook (no-op when trip is null)
  useWeather(activeTrip)

  // Auto-open the wizard on a fresh start.
  useEffect(() => {
    if (isFreshStart && !wizardActive) startWizard()
  }, [isFreshStart, wizardActive, startWizard])

  // Open chat when wandr:focus-chat fires
  useEffect(() => {
    function handler() { setChatOpen(true) }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  // ── Skeleton until localStorage has been read ───────────────────────────────
  if (!hasHydrated) {
    return (
      <div className="flex flex-col h-screen bg-[#0a0a0a]">
        <div className="h-14 border-b border-[#1f1f1f] animate-pulse bg-[#111111]" />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-5 h-5 border border-[#333] border-t-white rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // ── Wizard takeover ─────────────────────────────────────────────────────────
  if (wizardActive) {
    return (
      <>
        <ToastContainer />
        <Wizard />
      </>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <ToastContainer />
      <Header chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)} />

      <motion.div
        key="normal"
        className="flex flex-1 overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Main itinerary area */}
        <main className="flex-1 overflow-y-auto min-h-0 min-w-0">
          {activeTrip ? (
            <ItineraryView trip={activeTrip} />
          ) : isGenerating ? (
            <GeneratingSkeleton />
          ) : hasPendingNewChat ? (
            /* Generation finished without a trip → interrupted, retry affordance. */
            <InterruptedState messages={newChatMsgs} />
          ) : (
            /* Fresh start: the wizard is opening (effect above). Neutral hold. */
            <div className="flex flex-1 items-center justify-center h-full">
              <div className="w-5 h-5 border border-[#333] border-t-white rounded-full animate-spin" />
            </div>
          )}
        </main>

        {/* Chat sidebar — also shown during the interrupted state so its retry
            handler (a wandr:send-message listener) is mounted. */}
        {(activeTrip || hasPendingNewChat) && chatOpen && (
          <div className="flex-shrink-0 w-full md:w-[380px] border-l border-[#1f1f1f] flex flex-col overflow-hidden">
            <ChatPanel />
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ─── GeneratingSkeleton ───────────────────────────────────────────────────────
// Shown in the main area while generating a new trip (no activeTripId yet).

function GeneratingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[#333]">
      <div className="w-5 h-5 border border-[#333] border-t-[#555] rounded-full animate-spin" />
      <p className="text-[12px]">Building your itinerary…</p>
    </div>
  )
}

// ─── InterruptedState ─────────────────────────────────────────────────────────
// Shown when a generation finished WITHOUT producing a trip (e.g. the stream was
// interrupted). Replaces the old silent fall-back to the empty hero screen with
// an explicit "something went wrong — retry" affordance. The conversation itself
// remains visible in the chat sidebar.

function InterruptedState({ messages }: { messages: ChatMessage[] }) {
  const clearChatThread = useStore((s) => s.clearChatThread)
  const startWizard     = useStore((s) => s.startWizard)

  // The user's most recent prompt — what we resend on retry.
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  function retry() {
    if (!lastUserMessage) return
    // Clear the interrupted thread, then resend as a fresh full generation.
    clearChatThread('__new__')
    requestAnimationFrame(() => {
      document.dispatchEvent(
        new CustomEvent('wandr:send-message', { detail: { message: lastUserMessage, intent: 'full' } }),
      )
    })
  }

  function startOver() {
    // Drop the interrupted thread and relaunch the new-trip wizard.
    clearChatThread('__new__')
    startWizard()
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
      <div className="w-10 h-10 rounded-xl bg-[#1a0e00] border border-[#5a3a00] flex items-center justify-center">
        <AlertTriangle size={18} className="text-[#f59e0b]" />
      </div>
      <div>
        <p className="text-[13px] font-semibold text-[#f0f0f0]">Generation was interrupted</p>
        <p className="text-[12px] text-[#666] mt-1 max-w-[300px] leading-relaxed">
          The plan didn&apos;t finish building — this usually means the request was cut off. Your message is saved.
        </p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={retry}
          disabled={!lastUserMessage}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-black text-[12px] font-semibold hover:bg-[#e8e8e8] transition-colors disabled:opacity-40"
        >
          <RotateCw size={12} />
          Retry
        </button>
        <button
          onClick={startOver}
          className="px-3.5 py-2 rounded-lg border border-[#2a2a2a] text-[#888] text-[12px] font-medium hover:text-[#f0f0f0] hover:border-[#444] transition-colors"
        >
          Start over
        </button>
      </div>
    </div>
  )
}
