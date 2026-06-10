'use client'

import { useStore } from '@/lib/store'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { WelcomeScreen } from '@/components/trips/WelcomeScreen'

export function AppShell() {
  const hasHydrated = useStore((s) => s._hasHydrated)
  const activeTripId = useStore((s) => s.activeTripId)
  const trips = useStore((s) => s.trips)
  const activeTrip = activeTripId ? trips[activeTripId] : null

  // Show a minimal skeleton until localStorage data is loaded to prevent flash
  if (!hasHydrated) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <div className="h-14 border-b border-gray-200 animate-pulse bg-gray-50" />
        <div className="flex flex-1">
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
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          {!activeTrip ? (
            <WelcomeScreen />
          ) : (
            // Placeholder — real itinerary view comes in Milestone 4
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-400 text-sm">
                Loading trip: <strong>{activeTrip.name}</strong>
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
