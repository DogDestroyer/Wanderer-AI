'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/lib/store'
import { useWeather } from '@/hooks/useWeather'
import { ToastContainer } from '@/components/ui/Toast'
import { Header } from './Header'
import { WelcomeScreen } from '@/components/trips/WelcomeScreen'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ItineraryView } from '@/components/itinerary/ItineraryView'

export function AppShell() {
  const hasHydrated = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips = useStore((s) => s.trips)
  const activeTrip = activeTripId ? trips[activeTripId] : null

  const [chatOpen, setChatOpen] = useState(false)

  // Fetch weather forecast for the active trip (no-op when dates are out of range)
  useWeather(activeTrip)

  // Open chat whenever a component dispatches wandr:focus-chat (e.g. WelcomeScreen CTA)
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

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] overflow-hidden">
      <ToastContainer />
      <Header chatOpen={chatOpen} onToggleChat={() => setChatOpen((v) => !v)} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-h-0 min-w-0">
          {!activeTrip ? (
            <WelcomeScreen />
          ) : (
            <ItineraryView trip={activeTrip} />
          )}
        </main>

        {/* Chat panel — slides in from right when toggled */}
        {chatOpen && (
          <div className="flex-shrink-0 w-full md:w-[380px] border-l border-[#1f1f1f] flex flex-col overflow-hidden">
            <ChatPanel />
          </div>
        )}
      </div>
    </div>
  )
}
