'use client'

import { useStore } from '@/lib/store'
import { useWeather } from '@/hooks/useWeather'
import { ToastContainer } from '@/components/ui/Toast'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { WelcomeScreen } from '@/components/trips/WelcomeScreen'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { ItineraryView } from '@/components/itinerary/ItineraryView'

export function AppShell() {
  const hasHydrated = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips = useStore((s) => s.trips)
  const activeTrip = activeTripId ? trips[activeTripId] : null

  // Fetch weather forecast for the active trip (no-op when dates are out of range)
  useWeather(activeTrip)

  // ── Skeleton until localStorage has been read ───────────────────────────────
  if (!hasHydrated) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="h-14 border-b border-gray-200 animate-pulse bg-gray-50" />
        <div className="flex flex-1 overflow-hidden">
          <div className="w-60 hidden md:block bg-slate-900" />
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      <ToastContainer />
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Content + Chat wrapper */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Main content area */}
          <main className="flex-1 overflow-y-auto min-h-0 min-w-0">
            {!activeTrip ? (
              <WelcomeScreen />
            ) : (
              <ItineraryView trip={activeTrip} />
            )}
          </main>

          {/* Chat panel — right sidebar on desktop, bottom strip on mobile */}
          <div className="flex-shrink-0 md:w-96 h-72 md:h-auto border-t md:border-t-0 md:border-l border-gray-200 flex flex-col">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
