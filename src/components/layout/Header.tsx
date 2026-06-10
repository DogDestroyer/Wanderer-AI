'use client'

import { Plane, Menu, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function Header() {
  const { activeTripId, trips, sidebarOpen, setSidebarOpen } = useStore()
  const activeTrip = activeTripId ? trips[activeTripId] : null

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center border-b border-gray-200 bg-white px-4 gap-3">
      {/* Mobile sidebar toggle */}
      <button
        className="md:hidden flex items-center justify-center w-8 h-8 rounded-md hover:bg-gray-100 transition-colors"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 select-none">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-600">
          <Plane size={14} className="text-white -rotate-45" />
        </div>
        <span className="font-semibold text-gray-900 tracking-tight">Wandr</span>
      </div>

      {/* Active trip name */}
      {activeTrip && (
        <>
          <span className="text-gray-300 hidden md:block">/</span>
          <span className="text-sm text-gray-600 truncate hidden md:block max-w-xs">
            {activeTrip.name}
          </span>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right side — reserved for future actions */}
      <div className="flex items-center gap-2">
        <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          AI Powered
        </span>
      </div>
    </header>
  )
}
