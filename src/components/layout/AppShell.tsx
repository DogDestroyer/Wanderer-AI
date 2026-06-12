'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ChatMessage } from '@/lib/types'
import { useWeather } from '@/hooks/useWeather'
import { ToastContainer } from '@/components/ui/Toast'
import { Header } from './Header'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { HeroLayout } from '@/components/chat/HeroLayout'
import { ItineraryView } from '@/components/itinerary/ItineraryView'

// ─── AppShell ─────────────────────────────────────────────────────────────────
// Controls two layout modes:
//   • Hero   — no active trip, centered input (Google-homepage style)
//   • Normal — active trip, itinerary + chat sidebar
//
// The transition fires when isGenerating becomes true (user has sent a message)
// so the user sees feedback immediately. The itinerary renders once the trip
// arrives from the AI.

export function AppShell() {
  const hasHydrated  = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips        = useStore((s) => s.trips)
  const isGenerating = useStore((s) => s.isGenerating)
  const chatHistory  = useStore((s) => s.chatHistory)
  const activeTrip   = activeTripId ? trips[activeTripId] : null

  // chatOpen: sidebar visibility in normal mode
  const [chatOpen, setChatOpen] = useState(true)

  // A pre-trip conversation that exists but never produced a trip. This happens
  // when a generation is interrupted (e.g. a dropped stream). We must NOT fall
  // back to the bare hero screen in this case — that silent reset is exactly what
  // made the bug so confusing. Instead we stay in normal mode and show a clear
  // "interrupted, retry" state alongside the preserved conversation.
  const newChatMsgs = chatHistory['__new__'] ?? []
  const hasPendingNewChat = newChatMsgs.length > 0

  // heroMode: true ONLY for a genuinely fresh start — no trip, not generating,
  // and no in-progress/interrupted conversation to preserve.
  const isHeroMode = !activeTripId && !isGenerating && !hasPendingNewChat

  // Weather hook (no-op when trip is null)
  useWeather(activeTrip)

  // Open chat when wandr:focus-chat fires (e.g. Header "New trip" button)
  useEffect(() => {
    function handler() { setChatOpen(true) }
    document.addEventListener('wandr:focus-chat', handler)
    return () => document.removeEventListener('wandr:focus-chat', handler)
  }, [])

  // Always show chat panel when transitioning from hero mode (generation starting)
  useEffect(() => {
    if (isGenerating && !activeTripId) setChatOpen(true)
  }, [isGenerating, activeTripId])

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

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <ToastContainer />
      <Header chatOpen={!isHeroMode && chatOpen} onToggleChat={() => setChatOpen((v) => !v)} />

      {/* ── Layout switching with transition ─────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {isHeroMode ? (

          /* ── HERO mode: full-screen centred layout ─────────────────────────── */
          <motion.div
            key="hero"
            className="flex flex-1 overflow-hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.2 } }}
            transition={{ duration: 0.3 }}
          >
            <HeroLayout />
          </motion.div>

        ) : (

          /* ── NORMAL mode: itinerary + chat sidebar ─────────────────────────── */
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
                /* Generating skeleton — trip not yet created */
                <GeneratingSkeleton />
              ) : (
                /* Generation finished without a trip → interrupted. Show a clear
                   retry affordance instead of silently dropping to the hero. */
                <InterruptedState messages={newChatMsgs} />
              )}
            </main>

            {/* Chat sidebar */}
            {chatOpen && (
              <div className="flex-shrink-0 w-full md:w-[380px] border-l border-[#1f1f1f] flex flex-col overflow-hidden">
                <ChatPanel />
              </div>
            )}
          </motion.div>

        )}
      </AnimatePresence>
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
    clearChatThread('__new__')
    document.dispatchEvent(new CustomEvent('wandr:focus-chat'))
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
