'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
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
  const activeTrip   = activeTripId ? trips[activeTripId] : null

  // chatOpen: sidebar visibility in normal mode
  const [chatOpen, setChatOpen] = useState(true)

  // heroMode: true while no trip exists AND nothing is generating
  // We exit hero mode the moment the user sends their first message,
  // so they see the chat sidebar streaming the response.
  const isHeroMode = !activeTripId && !isGenerating

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
              ) : (
                /* Generating skeleton — trip not yet created */
                <GeneratingSkeleton />
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
