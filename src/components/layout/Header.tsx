'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { ChevronDown, Plus, Trash2, MessageSquare, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cn, formatNights } from '@/lib/utils'

interface HeaderProps {
  chatOpen: boolean
  onToggleChat: () => void
}

export function Header({ chatOpen, onToggleChat }: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { trips, activeTripId, setActiveTrip, deleteTrip, startWizard } = useStore()
  const activeTrip = activeTripId ? trips[activeTripId] : null
  const tripList = Object.values(trips).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [dropdownOpen])

  function handleNewTrip() {
    setDropdownOpen(false)
    startWizard()  // launch the full-screen new-trip wizard
  }

  function handleSelect(tripId: string) {
    setActiveTrip(tripId)
    setDropdownOpen(false)
  }

  function handleDelete(tripId: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (confirm('Delete this trip? This cannot be undone.')) {
      deleteTrip(tripId)
    }
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-[#1f1f1f] bg-[#0a0a0a] px-5">

      {/* HODO wordmark — links to landing page */}
      <Link
        href="/"
        className="text-[13px] font-bold text-white tracking-[0.22em] uppercase select-none opacity-100 hover:opacity-60 transition-opacity duration-150"
      >
        HODO
      </Link>

      {/* Thin divider */}
      <div className="w-px h-4 bg-[#2a2a2a] shrink-0" />

      {/* Trip switcher ─────────────────────────────────────────────────────── */}
      <div className="relative shrink-0" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-[#888] hover:text-[#f0f0f0] transition-colors duration-150"
        >
          <span className="max-w-[160px] truncate">
            {activeTrip ? activeTrip.name : 'No trip'}
          </span>
          <ChevronDown
            size={12}
            className={cn('transition-transform duration-200', dropdownOpen && 'rotate-180')}
          />
        </button>

        {/* Dropdown panel */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-64 bg-[#111111] border border-[#2a2a2a] rounded-xl shadow-2xl shadow-black/70 overflow-hidden z-50">

            {/* New trip row */}
            <button
              onClick={handleNewTrip}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-[13px] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
            >
              <Plus size={13} />
              <span>New trip</span>
            </button>

            {tripList.length > 0 && (
              <div className="h-px bg-[#1f1f1f] mx-3" />
            )}

            {/* Trip list */}
            <div className="py-1">
              {tripList.length === 0 ? (
                <p className="text-[12px] text-[#444] px-3.5 py-3 leading-relaxed">
                  No trips yet — start a conversation to build your first itinerary.
                </p>
              ) : (
                tripList.map((trip) => (
                  <div
                    key={trip.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(trip.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSelect(trip.id)}
                    className={cn(
                      'group flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-colors',
                      trip.id === activeTripId
                        ? 'bg-[#1a1a1a] text-[#f0f0f0]'
                        : 'text-[#888] hover:bg-[#161616] hover:text-[#f0f0f0]'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] truncate font-medium">{trip.name}</p>
                      <p className="text-[11px] text-[#555] mt-0.5">
                        {trip.destination.name} · {formatNights(trip.startDate, trip.endDate)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(trip.id, e)}
                      aria-label={`Delete trip ${trip.name}`}
                      className="opacity-0 group-hover:opacity-100 ml-2 p-1 rounded hover:bg-[#2a2a2a] text-[#555] hover:text-[#f0f0f0] transition-all shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Chat toggle ──────────────────────────────────────────────────────── */}
      <button
        onClick={onToggleChat}
        className={cn(
          'flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-150',
          chatOpen
            ? 'bg-white text-black'
            : 'border border-[#2a2a2a] text-[#888] hover:text-[#f0f0f0] hover:border-[#444]'
        )}
      >
        {chatOpen ? <X size={13} /> : <MessageSquare size={13} />}
        {chatOpen ? 'Close' : 'Chat'}
      </button>
    </header>
  )
}
